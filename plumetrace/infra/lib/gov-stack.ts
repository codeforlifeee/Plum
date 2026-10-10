/**
 * OWNER    : Tejas
 * DUE      : D2 18:00
 * TASK     :
 *   NodejsFunction (Node 20) for each gov handler: reportGenerator (2 GB, chromium), farmerAlert, autoDraft, executor (rule on action.approved), fireTrend, govVerify (daily schedule). Grants: translate, polly, S3 reports/ audio/, Actions table, telegram secret.
 * DONE WHEN: Khare can `cdk deploy PtGov-dev` and invoke each Lambda.
 * GUIDE    : docs/team/TEJAS.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : WIP  (tsc-clean; NodejsFunction bundling needs esbuild/Docker, deploy needs AWS)
 */
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { appConfig, SECRET_NAMES, Stage } from "./config";
import type { DataStack } from "./data-stack";

const REPO_ROOT = path.join(__dirname, "..", "..");
const GOV_SRC = path.join(REPO_ROOT, "gov", "src");
const DEPS_LOCK = path.join(__dirname, "..", "package-lock.json");

export interface GovStackProps extends cdk.StackProps {
  stage: Stage;
  data: DataStack;
  busName: string;
}

export class GovStack extends cdk.Stack {
  public readonly reportGenerator: NodejsFunction;
  public readonly farmerAlert: NodejsFunction;
  public readonly fireTrend: NodejsFunction;
  public readonly executor: NodejsFunction;

  constructor(scope: Construct, id: string, props: GovStackProps) {
    super(scope, id, props);
    const cfg = appConfig(props.stage, this.account);
    const { data } = props;
    const bus = events.EventBus.fromEventBusName(this, "Bus", props.busName);
    const telegram = secretsmanager.Secret.fromSecretNameV2(this, "TelegramSecret", SECRET_NAMES.telegram);

    const commonEnv: Record<string, string> = {
      PT_STAGE: props.stage,
      PT_BUCKET: data.bucket.bucketName,
      PT_EVENT_BUS: props.busName,
      PT_TABLE_ACTIONS: cfg.tables.Actions,
      PT_TABLE_ATTRIBUTION: cfg.tables.Attribution,
    };

    const mkFn = (name: string, entryRel: string, memoryMb = 512, timeoutS = 30): NodejsFunction =>
      new NodejsFunction(this, name, {
        functionName: `${cfg.prefix}-${name}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(GOV_SRC, entryRel),
        handler: "handler",
        projectRoot: REPO_ROOT,
        depsLockFilePath: DEPS_LOCK,
        memorySize: memoryMb,
        timeout: cdk.Duration.seconds(timeoutS),
        environment: commonEnv,
        bundling: {
          // reportGenerator renders PDFs with puppeteer-core + Chromium, provided at
          // runtime via a Lambda layer (NOT bundled by esbuild). Keeping them external
          // lets `cdk synth` succeed; attach the Chromium layer before invoking the
          // report Lambda for real (see docs/HANDOFFS.md). @aws-sdk/* is on the runtime.
          externalModules: ["@aws-sdk/*", "puppeteer-core", "@sparticuz/chromium"],
        },
      });

    const reportGenerator = mkFn("reportGenerator", "reportGenerator/handler.js", 2048, 60);
    const farmerAlert = mkFn("farmerAlert", "farmerAlert/handler.js", 1024, 60);
    const autoDraft = mkFn("autoDraft", "autoDraft/handler.js", 1024, 120);
    const executor = mkFn("executor", "executor/handler.js");
    const fireTrend = mkFn("fireTrend", "verification/fireTrend.js");
    const govVerify = mkFn("govVerify", "verification/govVerify.js", 512, 60);
    this.reportGenerator = reportGenerator;
    this.farmerAlert = farmerAlert;
    this.fireTrend = fireTrend;
    this.executor = executor;

    // --- grants (least privilege, CDK grant* only — AC8) --------------------
    data.bucket.grantReadWrite(reportGenerator);
    data.bucket.grantReadWrite(farmerAlert);
    // autoDraft runs the report + farmer handlers in-process, so it needs their grants.
    data.bucket.grantReadWrite(autoDraft);
    data.bucket.grantReadWrite(executor);
    data.bucket.grantRead(fireTrend);
    data.bucket.grantReadWrite(govVerify);

    // reportGenerator + farmerAlert write drafts to the Actions table (createDraft).
    data.tables.Actions.grantReadWriteData(autoDraft);
    data.tables.Actions.grantReadWriteData(executor);
    data.tables.Actions.grantReadWriteData(reportGenerator);
    data.tables.Actions.grantReadWriteData(farmerAlert);
    data.tables.Attribution.grantReadData(fireTrend);
    data.tables.Attribution.grantReadData(autoDraft);

    telegram.grantRead(farmerAlert);
    telegram.grantRead(executor);
    // executor emits action.executed on the custom bus (best-effort in the handler).
    bus.grantPutEventsTo(executor);

    // Translate + Polly for the Punjabi farmer alert (action-level, resource "*" is required).
    // autoDraft also needs them because it invokes the farmer-alert handler in-process.
    for (const fn of [farmerAlert, autoDraft]) {
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ["translate:TranslateText", "polly:SynthesizeSpeech"],
        resources: ["*"],
      }));
    }

    // --- event rules --------------------------------------------------------
    // forecast.published -> autoDraft (threshold check lives in the handler, §8.3).
    new events.Rule(this, "OnForecastPublished", {
      ruleName: `${cfg.prefix}-gov-on-forecast`,
      eventBus: bus,
      eventPattern: { source: ["plumetrace.engine"], detailType: ["forecast.published"] },
      targets: [new targets.LambdaFunction(autoDraft)],
    });
    // action.approved -> executor (AC6: deliver within 30 s).
    new events.Rule(this, "OnActionApproved", {
      ruleName: `${cfg.prefix}-gov-on-approved`,
      eventBus: bus,
      eventPattern: { source: ["plumetrace.agent"], detailType: ["action.approved"] },
      targets: [new targets.LambdaFunction(executor)],
    });
    // Daily next-day verification.
    new events.Rule(this, "GovVerifyDaily", {
      ruleName: `${cfg.prefix}-gov-verify`,
      schedule: events.Schedule.expression("cron(30 2 * * ? *)"), // 08:00 IST
      targets: [new targets.LambdaFunction(govVerify)],
    });

    new cdk.CfnOutput(this, "AutoDraftArn", { value: autoDraft.functionArn });
    new cdk.CfnOutput(this, "ExecutorArn", { value: executor.functionArn });
    new cdk.CfnOutput(this, "ReportGeneratorArn", { value: reportGenerator.functionArn });
    new cdk.CfnOutput(this, "FarmerAlertArn", { value: farmerAlert.functionArn });
  }
}
