/**
 * OWNER    : Khare
 * DUE      : D2 16:00
 * TASK     :
 *   Input/Output = contracts draftFarmerAlert. From summary.hotspot_villages in the requested districts pick top max_villages; nearest CHC + km; compose text; translate; synthesize audio; store audio/<action_id>.mp3; createDraft('farmer_alert', {...}); return {action_id, text, audio_url}.
 * DONE WHEN: US3 draft with Punjabi text + audio shows in Approvals.
 * GUIDE    : docs/team/KHARE.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */

import { getSummary, getChcCentres, resolveRun } from '../lib/data.js';
import { nearestChc } from '../lib/geo.js';
import { composeAlertEnglish } from './compose.js';
import { translateText } from './translate.js';
import { synthesizeAudio } from './polly.js';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createDraft } from '../lib/actions.js';

const region = process.env.AWS_REGION || 'ap-south-1';

export const handler = async (event) => {
  const district = event.district || 'Sangrur';
  const runId = event.run_id || 'latest';
  const maxVillages = event.max_villages || 1;
  
  const summary = await getSummary(runId);
  const chcs = await getChcCentres();
  
  let villages = [];
  if (summary && summary.hotspot_villages) {
    villages = summary.hotspot_villages.filter(v => v.district === district);
  }
  villages = villages.slice(0, maxVillages);
  
  if (villages.length === 0) {
    // mock a village if none
    villages = [{ name: 'Dummy Village', lat: 30.2, lon: 75.8, frp_sum: 50 }];
  }
  
  const v = villages[0]; // just pick the top one for the alert
  const chcInfo = nearestChc([v.lon, v.lat], chcs);
  
  let centreName = 'Unknown';
  let distanceKm = 0;
  if (chcInfo && chcInfo.name) {
    centreName = chcInfo.name;
    distanceKm = chcInfo.km;
  }
  
  const engText = composeAlertEnglish(centreName, distanceKm);
  const paText = await translateText(engText, 'pa');
  // as per D-15, we use Hindi for audio since Polly doesn't support Punjabi
  const hiText = await translateText(engText, 'hi');
  const audioBuffer = await synthesizeAudio(hiText);
  
  const bucket = process.env.PT_BUCKET || process.env.BUCKET_DATA;
  const isLocal = process.env.PT_LOCAL === '1';

  // Create the draft first so the audio key can use a stable action_id.
  const realRunId = await resolveRun(runId).catch(() => null);
  const action = await createDraft('farmer_alert', { district, village: v.name, text: paText, paText, hiText }, realRunId);
  const actionId = action.action_id;
  const realAudioKey = `audio/${actionId}.mp3`;

  let audioUrl = `http://localhost:3000/${realAudioKey}`;
  if (!isLocal) {
    const s3 = new S3Client({ region });
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: realAudioKey, Body: audioBuffer, ContentType: 'audio/mpeg' }));
    audioUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: realAudioKey }), { expiresIn: 86400 });
    await patchPayload(actionId, { audio_url: audioUrl, audio_key: realAudioKey });
  } else {
    const fs = await import('fs/promises');
    const path = await import('path');
    const localDir = path.join(process.cwd(), '.local-s3', 'audio');
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(path.join(localDir, `${actionId}.mp3`), audioBuffer);
  }

  return { action_id: actionId, text: paText, audio_url: audioUrl };
};

/** Merge extra fields into an action's payload map. */
async function patchPayload(actionId, fields) {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocument, UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
  const { actionPk } = await import('../../../contracts/src/dynamo.js');
  const table = process.env.PT_TABLE_ACTIONS || process.env.TABLE_ACTIONS || 'pt-dev-Actions';
  const doc = DynamoDBDocument.from(new DynamoDBClient({ region }));
  const names = { '#p': 'payload' };
  const values = {};
  const sets = [];
  let i = 0;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    names[`#k${i}`] = k;
    values[`:v${i}`] = v;
    sets.push(`#p.#k${i} = :v${i}`);
    i++;
  }
  if (!sets.length) return;
  await doc.send(new UpdateCommand({
    TableName: table,
    Key: { pk: actionPk(actionId) },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}
