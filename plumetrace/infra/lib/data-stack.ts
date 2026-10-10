/**
 * OWNER    : Tejas
 * DUE      : D1 14:00
 * TASK     :
 *   S3 bucket (Block Public Access, lifecycle on raw/ 14 d), DynamoDB on-demand tables from §8.1 (+ GSI byRun on Forecast, TTL attr `ttl`) + RouteCache table, KMS CMK for RiderHealth, Glue database + crawlers on curated/ and features/.
 * DONE WHEN: Tables visible in console; Khare can write riders, Yasho1 can write Forecast items.
 * GUIDE    : docs/team/TEJAS.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : WIP  (synth-clean; "visible in console" verifies on deploy — needs AWS creds, ask first)
 */
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import { appConfig, FORECAST_GSI_BY_RUN, Stage, type TableKey } from "./config";

export interface DataStackProps extends cdk.StackProps {
  stage: Stage;
}

/**
 * Shared data plane: the single S3 bucket, all §8.1 DynamoDB tables, the RiderHealth
 * KMS key, and the Glue catalog. Other stacks read `bucket`, `tables` and
 * `riderHealthKey` as cross-stack references.
 */
export class DataStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly tables: Record<TableKey, dynamodb.Table>;
  public readonly riderHealthKey: kms.Key;
  public readonly glueDatabaseName: string;
  public readonly bus: events.EventBus;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const cfg = appConfig(props.stage, this.account);

    // Custom EventBridge bus (brief §8.3). Lives here (not EngineStack) so the API
    // and gov stacks can emit/consume action.* events without pulling in the heavy
    // engine Docker build. EngineStack reuses this same bus for forecast.published.
    this.bus = new events.EventBus(this, "Bus", { eventBusName: cfg.busName });
    const isDemo = props.stage === "demo";
    const removalPolicy = isDemo ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // --- S3 bucket -----------------------------------------------------------
    this.bucket = new s3.Bucket(this, "DataBucket", {
      bucketName: cfg.bucketName, // plumetrace-<account>-<region>-<stage>
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // AC8
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy,
      autoDeleteObjects: !isDemo,
      lifecycleRules: [
        { id: "expire-raw", prefix: "raw/", expiration: cdk.Duration.days(14) },
      ],
    });

    // --- KMS CMK for health data (brief §15, AC8) ----------------------------
    // Only the fleet/dose role gets kms:Decrypt — granted in FleetStack.
    this.riderHealthKey = new kms.Key(this, "RiderHealthKey", {
      alias: `${cfg.prefix}-riderhealth`,
      enableKeyRotation: true,
      description: "PlumeTrace RiderHealth table (DPDP sensitive health data)",
      removalPolicy,
    });

    // --- DynamoDB tables (§8.1, on-demand) -----------------------------------
    interface MkTableOpts {
      hasSortKey?: boolean;
      ttl?: boolean;
      encryptionKey?: kms.Key;
    }
    const mkTable = (key: TableKey, opts: MkTableOpts = {}): dynamodb.TableV2 =>
      new dynamodb.TableV2(this, key, {
        tableName: cfg.tables[key],
        partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
        sortKey:
          opts.hasSortKey === false ? undefined : { name: "sk", type: dynamodb.AttributeType.STRING },
        billing: dynamodb.Billing.onDemand(),
        timeToLiveAttribute: opts.ttl ? "ttl" : undefined,
        removalPolicy,
        encryption: opts.encryptionKey
          ? dynamodb.TableEncryptionV2.customerManagedKey(opts.encryptionKey)
          : dynamodb.TableEncryptionV2.awsManagedKey(),
      });

    // Forecast: pk/sk + TTL + GSI byRun ("whole map for hour X", §8.1).
    const forecast = new dynamodb.TableV2(this, "Forecast", {
      tableName: cfg.tables.Forecast,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: "ttl",
      removalPolicy,
      globalSecondaryIndexes: [
        {
          // byRun SK is valid_hour (matches the deployed table + the API's
          // `run_id = :r AND valid_hour = :vh` query in forecast.controllers.js).
          indexName: FORECAST_GSI_BY_RUN,
          partitionKey: { name: "run_id", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "valid_hour", type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    const stationForecast = mkTable("StationForecast", { ttl: true });
    const attribution = mkTable("Attribution");
    // Actions: pk only + a byStatus GSI for GET /actions?status=draft (§8.4).
    const actions = new dynamodb.TableV2(this, "Actions", {
      tableName: cfg.tables.Actions,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy,
      globalSecondaryIndexes: [
        {
          indexName: "byStatus",
          partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "created_at", type: dynamodb.AttributeType.STRING },
        },
      ],
    });
    const riders = mkTable("Riders", { hasSortKey: false });
    const riderHealth = mkTable("RiderHealth", { hasSortKey: false, encryptionKey: this.riderHealthKey });
    const shifts = mkTable("Shifts");
    const routeCache = mkTable("RouteCache"); // D-11: pk o#<h3>, sk d#<h3>

    this.tables = {
      Forecast: forecast as unknown as dynamodb.Table,
      StationForecast: stationForecast as unknown as dynamodb.Table,
      Attribution: attribution as unknown as dynamodb.Table,
      Actions: actions as unknown as dynamodb.Table,
      Riders: riders as unknown as dynamodb.Table,
      RiderHealth: riderHealth as unknown as dynamodb.Table,
      Shifts: shifts as unknown as dynamodb.Table,
      RouteCache: routeCache as unknown as dynamodb.Table,
    };

    // --- Glue catalog over curated/ and features/ (brief §16) ----------------
    this.glueDatabaseName = `${cfg.prefix}_catalog`.replace(/-/g, "_");
    new glue.CfnDatabase(this, "GlueDatabase", {
      catalogId: this.account,
      databaseInput: { name: this.glueDatabaseName },
    });
    const crawlerRole = new iam.Role(this, "CrawlerRole", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSGlueServiceRole"),
      ],
    });
    this.bucket.grantRead(crawlerRole);
    for (const area of ["curated", "features"]) {
      new glue.CfnCrawler(this, `Crawler-${area}`, {
        role: crawlerRole.roleArn,
        databaseName: this.glueDatabaseName,
        name: `${cfg.prefix}-${area}`,
        targets: { s3Targets: [{ path: `s3://${this.bucket.bucketName}/${area}/` }] },
      });
    }

    // --- Outputs -------------------------------------------------------------
    new cdk.CfnOutput(this, "BucketName", { value: this.bucket.bucketName });
    new cdk.CfnOutput(this, "ForecastTable", { value: forecast.tableName });
    new cdk.CfnOutput(this, "RiderHealthKeyArn", { value: this.riderHealthKey.keyArn });
  }
}
