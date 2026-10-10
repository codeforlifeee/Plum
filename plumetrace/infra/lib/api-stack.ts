/**
 * OWNER    : Tejas
 * DUE      : D1 18:00
 * TASK     :
 *   Cognito user pool + Hosted UI domain + groups gov/fleet/admin + app client (callback = Amplify URL + localhost:5173). DockerImageFunction from api/Dockerfile (Bun + AWS Lambda Web Adapter, response streaming enabled for /agent/chat). HTTP API with JWT authorizer -> Lambda proxy. Pass env: table names, bucket, bus, guardrail id, lambda ARNs of Khare/Yasho2 tool Lambdas.
 * DONE WHEN: Tanmay can hit https://<api>/runs/latest with a Cognito token (MOCK_MODE=1 on D1).
 * GUIDE    : docs/team/TEJAS.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : WIP
 *   Cognito + HTTP API + JWT authorizer are written and type-check. Full `cdk synth`
 *   waits on api/Dockerfile (Yasho2, still a stub) + the Docker daemon, since the API
 *   Lambda is a DockerImageFunction. MOCK_MODE=1 is passed on dev so D1 works on mocks.
 */
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { HttpApi, HttpMethod, CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { appConfig, SECRET_NAMES, Stage, TableKey } from "./config";
import type { DataStack } from "./data-stack";

const REPO_ROOT = path.join(__dirname, "..", "..");
const GROUPS = ["gov", "fleet", "admin"] as const;

/** Map logical table keys -> the env var names the API (api/src/libs/env.js) reads. */
const TABLE_ENV: Record<TableKey, string> = {
  Forecast: "TABLE_FORECAST",
  StationForecast: "TABLE_STATION_FORECAST",
  Attribution: "TABLE_ATTRIBUTION",
  Actions: "TABLE_ACTIONS",
  Riders: "TABLE_RIDERS",
  RiderHealth: "TABLE_RIDER_HEALTH",
  Shifts: "TABLE_SHIFTS",
  RouteCache: "TABLE_ROUTE_CACHE",
};

export interface ApiStackProps extends cdk.StackProps {
  stage: Stage;
  data: DataStack;
  busName?: string;
  /** Web origin(s) allowed to call the API and used as Cognito callback URLs. */
  webOrigins?: string[];
  /** Anthropic model id for the Copilot (Option A). Default claude-sonnet-4-6. */
  modelId?: string;
  /** Run the REAL Anthropic Copilot even in MOCK_MODE (live Claude over mock data). */
  agentLive?: boolean;
  /** ARNs of Khare/Yasho2 tool Lambdas the agent may invoke. */
  toolLambdaArns?: Record<string, string>;
  /** Force MOCK_MODE on/off. Default: true for dev, false for demo. */
  mockMode?: boolean;
}

export class ApiStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly httpApi: HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const cfg = appConfig(props.stage, this.account);
    const { data } = props;
    const webOrigins = props.webOrigins ?? ["http://localhost:5173"];
    // Cognito Hosted UI redirects to `${origin}/login` (web/src/lib/auth.js), so
    // register that exact URL (plus the bare origin) as callback/logout URLs.
    const oauthUrls = webOrigins.flatMap((o) => [`${o}/login`, o]);

    // Anthropic Copilot key (Option A). The secret is created once out-of-band
    // (see docs/DEPLOY.md); CDK only references it and grants the API read.
    const anthropicSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "AnthropicSecret",
      SECRET_NAMES.anthropicKey,
    );
    const anthropicModel = props.modelId ?? "claude-sonnet-4-6";

    // --- Cognito ------------------------------------------------------------
    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${cfg.prefix}-users`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireDigits: true, requireLowercase: true, requireUppercase: true },
      removalPolicy: props.stage === "demo" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const hostedUi = this.userPool.addDomain("HostedUi", {
      cognitoDomain: { domainPrefix: `${cfg.prefix}-${this.account}` },
    });
    // Host (no scheme) for the web's VITE_COGNITO_DOMAIN (aws-amplify Auth).
    const cognitoDomainHost = `${cfg.prefix}-${this.account}.auth.${this.region}.amazoncognito.com`;
    void hostedUi;

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: `${cfg.prefix}-web`,
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: oauthUrls,
        logoutUrls: oauthUrls,
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
      },
    });

    for (const g of GROUPS) {
      const group = new cognito.CfnUserPoolGroup(this, `Group-${g}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: g,
      });
      // One demo user per group. Passwords are NOT committed — set post-deploy with
      // `aws cognito-idp admin-set-user-password` (see infra/README.md).
      const user = new cognito.CfnUserPoolUser(this, `User-${g}`, {
        userPoolId: this.userPool.userPoolId,
        username: `${g}@plumetrace.demo`,
        messageAction: "SUPPRESS",
        userAttributes: [{ name: "email", value: `${g}@plumetrace.demo` }, { name: "email_verified", value: "true" }],
      });
      const attachment = new cognito.CfnUserPoolUserToGroupAttachment(this, `Attach-${g}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: g,
        username: user.ref,
      });
      attachment.addDependency(user);
      attachment.addDependency(group);
    }

    // --- API container Lambda (Bun + Lambda Web Adapter) --------------------
    const apiFn = new lambda.DockerImageFunction(this, "ApiFn", {
      functionName: `${cfg.prefix}-api`,
      code: lambda.DockerImageCode.fromImageAsset(REPO_ROOT, { file: "api/Dockerfile" }),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      environment: {
        // Names here MUST match api/src/libs/env.js (documented in api/.env.example).
        // Bun on Lambda: the filesystem is read-only except /tmp. Redirect every
        // Bun write (home, temp, AND the runtime transpiler cache) to /tmp, or it
        // crashes with "bun is unable to write files: EROFS" and the route 500s.
        // NOTE: the transpiler cache value MUST be a writable directory. Setting it
        // to "0" does NOT disable the cache on this Bun version — Bun treats "0" as a
        // relative path and tries to write it under the read-only /var/task, so cold
        // starts kept crashing. Point it at /tmp (writable, 512 MB ephemeral) instead.
        HOME: "/tmp",
        TMPDIR: "/tmp",
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "/tmp/bun-transpiler-cache",
        BUN_INSTALL: "/tmp/.bun",
        // Lambda Web Adapter invoke mode. The browser talks to this function ONLY
        // through the HTTP API (HttpLambdaIntegration) — a buffered proxy integration
        // that expects a `{statusCode, headers, body}` envelope. The Dockerfile sets
        // AWS_LWA_INVOKE_MODE=response_stream (for the SSE Function URL), but in that
        // mode LWA returns a streaming-protocol envelope the HTTP API cannot parse, so
        // API Gateway returned 500 on every route even though the Lambda logged 200
        // (0 Lambda errors, 56 APIGW 5xx). A Lambda env var overrides the image ENV,
        // so force buffered here to make the whole REST + chat surface respond.
        AWS_LWA_INVOKE_MODE: "buffered",
        NODE_ENV: "production",
        PT_STAGE: props.stage,
        MOCK_MODE: (props.mockMode ?? props.stage === "dev") ? "1" : "0",
        // Live Claude over mock data when requested (demo). Off by default.
        AGENT_LIVE: props.agentLive ? "1" : "0",
        CORS_ORIGINS: webOrigins.join(","),
        BUCKET: data.bucket.bucketName,
        BUS_NAME: props.busName ?? cfg.busName,
        COGNITO_POOL_ID: this.userPool.userPoolId,
        COGNITO_CLIENT_ID: this.userPoolClient.userPoolClientId,
        ...Object.fromEntries(Object.entries(cfg.tables).map(([k, v]) => [TABLE_ENV[k as TableKey], v])),
        // Anthropic Copilot (Option A): the Lambda reads the key from Secrets Manager.
        ANTHROPIC_SECRET_NAME: SECRET_NAMES.anthropicKey,
        ANTHROPIC_MODEL: anthropicModel,
        ...(props.toolLambdaArns ?? {}),
      },
    });
    data.bucket.grantReadWrite(apiFn);
    for (const t of Object.values(data.tables)) t.grantReadWriteData(apiFn);
    // Let the API read the Anthropic key at cold start (least privilege — AC8).
    anthropicSecret.grantRead(apiFn);

    // Allow the agent to invoke the gov/fleet tool Lambdas it drafts actions with.
    const toolArns = Object.values(props.toolLambdaArns ?? {});
    if (toolArns.length) {
      apiFn.addToRolePolicy(new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: toolArns,
      }));
    }

    // Approving a draft emits action.approved on the custom bus -> gov executor.
    const busArn = cdk.Arn.format(
      { service: "events", resource: "event-bus", resourceName: props.busName ?? cfg.busName },
      this,
    );
    apiFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["events:PutEvents"],
      resources: [busArn],
    }));

    // A Function URL with response streaming for SSE (/agent/chat) — see YASHO2 §7.
    const streamingUrl = apiFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // --- HTTP API + Cognito JWT authorizer ---------------------------------
    const authorizer = new HttpJwtAuthorizer(
      "JwtAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      { jwtAudience: [this.userPoolClient.userPoolClientId] },
    );

    this.httpApi = new HttpApi(this, "HttpApi", {
      apiName: `${cfg.prefix}-api`,
      corsPreflight: {
        allowOrigins: webOrigins,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowHeaders: ["authorization", "content-type"],
      },
    });
    this.httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.DELETE],
      integration: new HttpLambdaIntegration("ApiIntegration", apiFn),
      authorizer,
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: this.httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoDomain", { value: cognitoDomainHost });
    new cdk.CfnOutput(this, "AgentStreamUrl", { value: streamingUrl.url });
  }
}
