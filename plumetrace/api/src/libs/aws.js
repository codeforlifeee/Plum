/**
 * OWNER    : Yasho2
 * DUE      : D1 16:00
 * TASK     :
 *   Singleton AWS SDK v3 clients: DynamoDBDocumentClient, S3 + presigner, EventBridge, Lambda (invoke tool Lambdas), BedrockRuntime.
 * DONE WHEN: -
 * GUIDE    : docs/team/YASHO2.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import env from './env.js';

/* Lazy singletons: clients are created on first use, so MOCK_MODE never
 * imports or constructs an AWS client (no creds needed for local dev). */
let _doc, _ddbCommands, _s3, _presign, _eventbridge, _lambda, _bedrock;

export async function getDocClient() {
  if (!_doc) {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocument } = await import('@aws-sdk/lib-dynamodb');
    _doc = DynamoDBDocument.from(new DynamoDBClient({ region: env.AWS_REGION }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _doc;
}

/** The lib-dynamodb command classes, for actionsRepo DI. */
export async function getDdbCommands() {
  if (!_ddbCommands) {
    const m = await import('@aws-sdk/lib-dynamodb');
    _ddbCommands = {
      PutCommand: m.PutCommand,
      GetCommand: m.GetCommand,
      UpdateCommand: m.UpdateCommand,
      QueryCommand: m.QueryCommand,
      ScanCommand: m.ScanCommand,
      DeleteCommand: m.DeleteCommand,
      BatchGetCommand: m.BatchGetCommand,
    };
  }
  return _ddbCommands;
}

export async function getS3() {
  if (!_s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    _s3 = new S3Client({ region: env.AWS_REGION });
  }
  return _s3;
}

export async function presignGet(bucket, key, expiresIn = 900) {
  const s3 = await getS3();
  if (!_presign) {
    const m = await import('@aws-sdk/s3-request-presigner');
    _presign = m.getSignedUrl;
  }
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  return _presign(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

export async function getEventBridge() {
  if (!_eventbridge) {
    const { EventBridgeClient } = await import('@aws-sdk/client-eventbridge');
    _eventbridge = new EventBridgeClient({ region: env.AWS_REGION });
  }
  return _eventbridge;
}

/** Put one event on the custom `plumetrace` bus. */
export async function putEvent(source, detailType, detail) {
  const eb = await getEventBridge();
  const { PutEventsCommand } = await import('@aws-sdk/client-eventbridge');
  return eb.send(
    new PutEventsCommand({
      Entries: [
        { EventBusName: env.BUS_NAME, Source: source, DetailType: detailType, Detail: JSON.stringify(detail) },
      ],
    }),
  );
}

export async function getLambda() {
  if (!_lambda) {
    const { LambdaClient } = await import('@aws-sdk/client-lambda');
    _lambda = new LambdaClient({ region: env.AWS_REGION });
  }
  return _lambda;
}

/** Invoke a tool Lambda synchronously with a JSON payload; parse the JSON result. */
export async function invokeLambda(functionName, payload) {
  const lambda = await getLambda();
  const { InvokeCommand } = await import('@aws-sdk/client-lambda');
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  const text = Buffer.from(res.Payload || []).toString('utf8');
  const parsed = text ? JSON.parse(text) : {};
  if (res.FunctionError) {
    const err = new Error(`Lambda ${functionName} failed: ${parsed.errorMessage || res.FunctionError}`);
    err.name = 'LambdaInvokeError';
    throw err;
  }
  return parsed;
}

/**
 * Persist a real draft action to the Actions table (used by fleet tools when the
 * real re-planner/notify Lambdas aren't deployed, so the copilot's drafts still
 * show up in Approvals in non-mock mode instead of vanishing into the mock store).
 */
export async function createRealDraft(type, payload, runId = null) {
  const doc = await getDocClient();
  const { PutCommand, GetCommand, UpdateCommand } = await getDdbCommands();
  const { makeActionsRepo } = await import('@plumetrace/contracts/actionsRepo');
  const repo = makeActionsRepo({ doc, table: env.TABLE_ACTIONS, PutCommand, GetCommand, UpdateCommand });
  return repo.createDraft(type, payload, runId);
}

export async function getBedrock() {
  if (!_bedrock) {
    const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
    _bedrock = new BedrockRuntimeClient({ region: env.AWS_REGION });
  }
  return _bedrock;
}
