/**
 * OWNER    : Khare
 * DUE      : D1 18:00
 * TASK     :
 *   Read helpers: getSummary(run_id|latest) from S3, getAttribution(date) / last N dates from DynamoDB, getFiresGeojson(run_id), getChcCentres() from static/. Use @plumetrace/contracts schemas to parse.
 * DONE WHEN: -
 * GUIDE    : docs/team/KHARE.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 *
 * Fixes (integration): read PT_BUCKET / PT_TABLE_ATTRIBUTION (the names the gov CDK
 * stack actually sets), use the Lambda's own AWS_REGION (ap-south-1) instead of a
 * hard-coded us-east-1, and resolve run_id='latest' via the outputs/latest.json
 * pointer (D-10) before reading the per-run summary/fires.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'fs/promises';
import path from 'path';

const isLocal = process.env.PT_LOCAL === '1';
const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName = () => process.env.PT_BUCKET || process.env.BUCKET_DATA;

const s3 = new S3Client({ region });
const ddbClient = new DynamoDBClient({ region });
const ddb = DynamoDBDocumentClient.from(ddbClient);

async function getJson(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
  const str = await res.Body.transformToString();
  return JSON.parse(str);
}

/** Resolve 'latest' -> real run_id via the outputs/latest.json pointer (D-10). */
export async function resolveRun(run_id) {
  if (run_id && run_id !== 'latest') return run_id;
  if (isLocal) return '2026-10-09T00Z';
  const ptr = await getJson('outputs/latest.json');
  return ptr.run_id;
}

export async function getSummary(run_id) {
  if (isLocal) {
    const raw = await fs.readFile(path.join(process.cwd(), '..', 'contracts', 'mocks', 'summary.json'), 'utf-8');
    return JSON.parse(raw);
  }
  const run = await resolveRun(run_id);
  return getJson(`outputs/run=${run}/summary.json`);
}

export async function getAttribution(date) {
  if (isLocal) {
    const raw = await fs.readFile(path.join(process.cwd(), '..', 'contracts', 'mocks', 'attribution.json'), 'utf-8');
    return JSON.parse(raw);
  }
  const table = process.env.PT_TABLE_ATTRIBUTION || process.env.TABLE_ATTRIBUTION || 'pt-dev-Attribution';
  const res = await ddb.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `date#${date}` }
  }));
  return res.Items || [];
}

export async function getFiresGeojson(run_id) {
  if (isLocal) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), '..', 'contracts', 'mocks', 'fires_48h.geojson'), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { type: 'FeatureCollection', features: [] };
    }
  }
  try {
    const run = await resolveRun(run_id);
    return await getJson(`outputs/run=${run}/fires_48h.geojson`);
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

export async function getChcCentres() {
  if (isLocal) {
    const raw = await fs.readFile(path.join(process.cwd(), '..', 'static', 'chc_centres.geojson'), 'utf-8');
    return JSON.parse(raw);
  }
  try {
    return await getJson('static/chc_centres.geojson');
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}
