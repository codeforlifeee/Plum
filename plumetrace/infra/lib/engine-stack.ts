/**
 * OWNER    : Tejas
 * DUE      : D2 14:00
 * TASK     :
 *   EngineStack: Lambda container images (one per state), Step Functions `EngineRun` (§9: ResolveRun -> Parallel(FIRMS catch->degraded, Map GFS f000..f072, OpenAQ) -> Trajectories -> Forecast -> Gridding -> Summarize -> Publish), EventBridge Scheduler 04/10/16/22 UTC, custom bus plumetrace-<stage>, hourly Verify.
 * DONE WHEN: AC1: a manual execution with {} finishes green on real data.
 * GUIDE    : docs/team/TEJAS.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : WIP  (synth-clean incl. docker image build; AC1 green run verifies on deploy with real data/creds)
 */
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { appConfig, SECRET_NAMES, Stage } from "./config";
import type { DataStack } from "./data-stack";

const REPO_ROOT = path.join(__dirname, "..", "..");

export interface EngineStackProps extends cdk.StackProps {
  stage: Stage;
  data: DataStack;
}

export class EngineStack extends cdk.Stack {
  public readonly bus: events.EventBus;
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: EngineStackProps) {
    super(scope, id, props);
    const cfg = appConfig(props.stage, this.account);
    const { data } = props;

    // The custom EventBridge bus now lives in DataStack (so gov/api don't depend on
    // this heavy engine build). Reuse it here for forecast.published.
    this.bus = data.bus;

    // One container image for every state; the state is selected by PT_HANDLER env,
    // and plumetrace_engine.handlers.lambda_handler dispatches on it.
    const code = lambda.DockerImageCode.fromImageAsset(REPO_ROOT, {
      file: "engine/Dockerfile",
      cmd: ["plumetrace_engine.handlers.lambda_handler"],
    });

    const commonEnv: Record<string, string> = {
      PT_STAGE: props.stage,
      PT_BUCKET: data.bucket.bucketName,
      PT_EVENT_BUS: cfg.busName,
      PT_TABLE_FORECAST: cfg.tables.Forecast,
      PT_TABLE_STATION: cfg.tables.StationForecast,
      PT_TABLE_ATTRIBUTION: cfg.tables.Attribution,
    };

    const mkFn = (id: string, handlerName: string, memoryMb: number): lambda.DockerImageFunction => {
      const fn = new lambda.DockerImageFunction(this, id, {
        functionName: `${cfg.prefix}-${handlerName}`,
        code,
        memorySize: memoryMb,
        timeout: cdk.Duration.minutes(15),
        environment: { ...commonEnv, PT_HANDLER: handlerName },
      });
      data.bucket.grantReadWrite(fn);
      return fn;
    };

    // Ingest 1–2 GB; trajectories/forecast 4–6 GB (brief §9 / my playbook).
    const resolveRunFn = mkFn("ResolveRunFn", "resolve_run", 1024);
    const ingestFirmsFn = mkFn("IngestFirmsFn", "ingest_firms", 2048);
    const ingestGfsFn = mkFn("IngestGfsHourFn", "ingest_gfs_hour", 2048);
    const ingestOpenaqFn = mkFn("IngestOpenaqFn", "ingest_openaq", 1536);
    const trajectoriesFn = mkFn("TrajectoriesFn", "trajectories", 6144);
    const forecastFn = mkFn("ForecastFn", "forecast", 6144);
    const griddingFn = mkFn("GriddingFn", "gridding", 4096);
    const summarizeFn = mkFn("SummarizeFn", "summarize", 2048);
    const publishFn = mkFn("PublishFn", "publish", 1024);
    const verifyFillObsFn = mkFn("VerifyFillObsFn", "verify_fill_obs", 2048);
    const verifySkillFn = mkFn("VerifySkillFn", "verify_skill", 2048);

    // Engine writes the forecast tables and publishes the event.
    for (const t of [data.tables.Forecast, data.tables.StationForecast, data.tables.Attribution]) {
      t.grantWriteData(forecastFn);
      t.grantWriteData(griddingFn);
    }
    this.bus.grantPutEventsTo(publishFn);

    // FIRMS + OpenAQ API keys live in Secrets Manager; the ingest handlers read them
    // via _secret() (env var first, then Secrets Manager).
    const firmsSecret = secretsmanager.Secret.fromSecretNameV2(this, "FirmsSecret", SECRET_NAMES.firmsMapKey);
    const openaqSecret = secretsmanager.Secret.fromSecretNameV2(this, "OpenaqSecret", SECRET_NAMES.openaqKey);
    firmsSecret.grantRead(ingestFirmsFn);
    openaqSecret.grantRead(ingestOpenaqFn);

    // --- Step Functions `EngineRun` (§9) ------------------------------------
    // Each sequential task passes the whole {run_id, degraded[]} envelope in and
    // replaces it with the handler's returned envelope (payloadResponseOnly).
    const invoke = (id: string, fn: lambda.IFunction, opts: { retry?: boolean } = {}): tasks.LambdaInvoke => {
      const t = new tasks.LambdaInvoke(this, id, {
        lambdaFunction: fn,
        payloadResponseOnly: true,
      });
      if (opts.retry) {
        t.addRetry({ maxAttempts: 2, backoffRate: 2, interval: cdk.Duration.seconds(10) });
      }
      return t;
    };

    const resolveRun = invoke("ResolveRun", resolveRunFn);
    // FIRMS is sequential-before-parallel so a degraded run (handler adds "firms")
    // propagates downstream; the task retry covers transient Lambda errors.
    const ingestFirms = invoke("IngestFIRMS", ingestFirmsFn, { retry: true });

    // GFS Map over f000..f072 (hourly, MaxConcurrency 20). Hours are built by a Pass.
    const buildHours = new sfn.Pass(this, "BuildGfsHours", {
      result: sfn.Result.fromArray(Array.from({ length: 73 }, (_, i) => i)),
      resultPath: "$.hours",
    });
    const gfsMap = new sfn.Map(this, "IngestGFS", {
      itemsPath: "$.hours",
      maxConcurrency: 20,
      itemSelector: { "run_id.$": "$.run_id", "fff.$": "$$.Map.Item.Value", "degraded.$": "$.degraded" },
      resultPath: "$.gfs",
    });
    gfsMap.itemProcessor(invoke("IngestGFSHour", ingestGfsFn, { retry: true }));
    const gfsBranch = buildHours.next(gfsMap);

    const ingestParallel = new sfn.Parallel(this, "IngestParallel", { resultPath: "$.ingest" })
      .branch(gfsBranch)
      .branch(invoke("IngestOpenAQ", ingestOpenaqFn, { retry: true }));

    // Attribution folds into Forecast (DECISIONS D-12).
    const chain = resolveRun
      .next(ingestFirms)
      .next(ingestParallel)
      .next(invoke("Trajectories", trajectoriesFn))
      .next(invoke("Forecast", forecastFn))
      .next(invoke("Gridding", griddingFn))
      .next(invoke("Summarize", summarizeFn))
      .next(invoke("Publish", publishFn));

    this.stateMachine = new sfn.StateMachine(this, "EngineRun", {
      stateMachineName: `${cfg.prefix}-EngineRun`,
      definitionBody: sfn.DefinitionBody.fromChainable(chain),
      timeout: cdk.Duration.minutes(30),
      logs: {
        destination: new logs.LogGroup(this, "EngineRunLogs", {
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        level: sfn.LogLevel.ERROR,
      },
    });

    // --- Schedules (UTC) ----------------------------------------------------
    // EngineRun at 04/10/16/22 (brief §9). EventBridge Scheduler is specified; a
    // scheduled Rule is the stable L2 equivalent and triggers the same target.
    new events.Rule(this, "EngineSchedule", {
      ruleName: `${cfg.prefix}-engine-schedule`,
      schedule: events.Schedule.expression(cfg.schedules.engineRunCron),
      targets: [new targets.SfnStateMachine(this.stateMachine)],
    });

    // Hourly Verify: fill obs + recompute skill (brief §9 step 9).
    new events.Rule(this, "VerifyFillObsSchedule", {
      ruleName: `${cfg.prefix}-verify-fillobs`,
      schedule: events.Schedule.expression(cfg.schedules.verifyCron),
      targets: [new targets.LambdaFunction(verifyFillObsFn)],
    });
    new events.Rule(this, "VerifySkillSchedule", {
      ruleName: `${cfg.prefix}-verify-skill`,
      schedule: events.Schedule.expression(cfg.schedules.verifyCron),
      targets: [new targets.LambdaFunction(verifySkillFn)],
    });

    new cdk.CfnOutput(this, "StateMachineArn", { value: this.stateMachine.stateMachineArn });
    new cdk.CfnOutput(this, "BusName", { value: this.bus.eventBusName });
  }
}
