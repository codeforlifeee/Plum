#!/usr/bin/env node
/**
 * OWNER    : Tejas
 * DUE      : D1 13:00
 * TASK     :
 *   CDK app entry. Read context `stage` (dev | demo). Instantiate stacks in dependency order: Data -> Engine -> Gov -> Fleet -> Agent -> Api -> Web -> Observability. Prefix every resource name with `pt-${stage}`. Region us-east-1.
 * DONE WHEN: `npx cdk synth -c stage=dev` succeeds with all stacks.
 * GUIDE    : docs/team/TEJAS.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : WIP
 *   DataStack is wired and synths. The remaining stacks are added here as each lib/*
 *   file starts exporting its class (Engine/Gov/Fleet/Web/Observability are mine;
 *   Agent is Yasho2's) — then this flips to DONE when the full app synths.
 */
import * as cdk from "aws-cdk-lib";
import { assertStage, REGION } from "../lib/config";
import { DataStack } from "../lib/data-stack";
import { EngineStack } from "../lib/engine-stack";
import { ApiStack } from "../lib/api-stack";
import { GovStack } from "../lib/gov-stack";
import { FleetStack } from "../lib/fleet-stack";
import { WebStack } from "../lib/web-stack";
import { ObservabilityStack } from "../lib/observability-stack";

const app = new cdk.App();
const stage = assertStage(app.node.tryGetContext("stage") ?? "dev");

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT || "171403826703",
  region: REGION,
};

// Copilot runs on the Anthropic API directly (Option A) — no Bedrock/AgentStack.
const anthropicModel = (app.node.tryGetContext("anthropicModel") as string) ?? "claude-sonnet-4-6";
// Live Claude over mock data (demo): -c agentLive=1.
const agentLive = ["1", "true", "yes"].includes(String(app.node.tryGetContext("agentLive") ?? "").toLowerCase());
// Web origin (CloudFront URL) for CORS + Cognito callback/logout URLs: -c webOrigin=https://xxxx.cloudfront.net
const webOrigin = app.node.tryGetContext("webOrigin") as string | undefined;
const webOrigins = [webOrigin, "http://localhost:5173"].filter(Boolean) as string[];
const coreOnly = ["1", "true", "yes"].includes(String(app.node.tryGetContext("coreOnly") ?? "").toLowerCase());
const webOnly = ["1", "true", "yes"].includes(String(app.node.tryGetContext("webOnly") ?? "").toLowerCase());
// `only=PtData-dev,PtGov-dev` restricts which stacks are CONSTRUCTED (not just
// deployed). This CDK bundles assets for every constructed stack, so limiting the
// set keeps a non-Docker deploy (data/gov) from bundling the Docker-based API.
const onlyRaw = String(app.node.tryGetContext("only") ?? "").trim();
const onlySet = onlyRaw ? new Set(onlyRaw.split(",").map((s) => s.trim())) : null;
const want = (id: string) => !onlySet || onlySet.has(id);
// Tool Lambda ARNs can be injected via context so the API deploy doesn't have to
// construct (and bundle) the gov stack just to learn them.
const ctxToolArns: Record<string, string> = {};
for (const [ctx, envName] of [["fnReport", "FN_REPORT"], ["fnFarmer", "FN_FARMER_ALERT"], ["fnFireTrend", "FN_FIRE_TREND"], ["fnReplanner", "FN_REPLANNER"], ["fnRiderNotify", "FN_RIDER_NOTIFY"]] as const) {
  const v = app.node.tryGetContext(ctx);
  if (v) ctxToolArns[envName] = String(v);
}
// realData=1: serve real DynamoDB/S3 (MOCK_MODE off) and deploy the gov tool Lambdas,
// WITHOUT requiring the heavy engine/fleet Docker stacks. The bus lives in DataStack.
const realData = ["1", "true", "yes"].includes(String(app.node.tryGetContext("realData") ?? "").toLowerCase());
// withEngine / withFleet: opt into the heavy Python Docker stacks (live forecasts, replanner).
const fullApp = !coreOnly && !webOnly;
const withEngine = fullApp || ["1", "true", "yes"].includes(String(app.node.tryGetContext("withEngine") ?? "").toLowerCase());
const withFleet = fullApp || ["1", "true", "yes"].includes(String(app.node.tryGetContext("withFleet") ?? "").toLowerCase());
const withGov = fullApp || realData || ["1", "true", "yes"].includes(String(app.node.tryGetContext("withGov") ?? "").toLowerCase());

// Data -> (Engine/Gov/Fleet/Obs, as opted in) -> Api -> Web.
let data: DataStack | undefined;
if (!webOnly) {
  data = new DataStack(app, `PtData-${stage}`, { stage, env });
}

const toolLambdaArns: Record<string, string> = { ...ctxToolArns };
let busName: string | undefined;
if (!webOnly && data) {
  // Literal name (not data.bus.eventBusName) so gov/api don't take a cross-stack
  // dependency on PtData's bus resource — lets gov deploy without redeploying PtData.
  busName = `plumetrace-${stage}`;

  if (withEngine && want(`PtEngine-${stage}`)) {
    const engine = new EngineStack(app, `PtEngine-${stage}`, { stage, env, data });
    if (want(`PtObs-${stage}`)) {
      const observability = new ObservabilityStack(app, `PtObs-${stage}`, { stage, env, engine });
      void observability;
    }
  }
  if (withGov && want(`PtGov-${stage}`)) {
    const gov = new GovStack(app, `PtGov-${stage}`, { stage, env, data, busName });
    toolLambdaArns.FN_REPORT ??= gov.reportGenerator.functionArn;
    toolLambdaArns.FN_FARMER_ALERT ??= gov.farmerAlert.functionArn;
    toolLambdaArns.FN_FIRE_TREND ??= gov.fireTrend.functionArn;
  }
  if (withFleet && want(`PtFleet-${stage}`)) {
    const fleet = new FleetStack(app, `PtFleet-${stage}`, { stage, env, data, busName });
    void fleet;
  }
}

if (!webOnly && data && want(`PtApi-${stage}`)) {
  const api = new ApiStack(app, `PtApi-${stage}`, {
    stage,
    env,
    data,
    busName,
    modelId: anthropicModel,
    agentLive,
    webOrigins,
    // realData flips MOCK_MODE off; otherwise keep the per-stage default.
    mockMode: realData ? false : undefined,
    toolLambdaArns,
  });
  void api;
}
if (want(`PtWeb-${stage}`)) {
  const web = new WebStack(app, `PtWeb-${stage}`, { stage, env });
  void web;
}

app.synth();
