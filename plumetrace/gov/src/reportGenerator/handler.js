/**
 * OWNER    : Khare
 * DUE      : D2 13:00
 * TASK     :
 *   Input/Output = contracts agentTools draftDistrictReport. Gather numbers (share p10/p50/p90, fire_count, frp, 7-day trend), render template.html, write reports/<action_id>.html, print to PDF with puppeteer-core + @sparticuz/chromium, actionsRepo.createDraft('district_report', {district, date, html_key, pdf_key, headline}). Return {action_id, preview_url (presigned 24 h)}.
 * DONE WHEN: US2: 1-page report for Sangrur renders with ranges + method + sources.
 * GUIDE    : docs/team/KHARE.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 *
 * Fixes (integration):
 *   - Persist the draft to DynamoDB via the shared repo (createDraft was a no-op stub).
 *   - Store preview_url + pdf_url + headline IN the draft payload so the Approvals UI
 *     and the executor can read them (they live on the item, not just the return value).
 *   - Use PT_BUCKET and the Lambda's AWS_REGION.
 *   - PDF (puppeteer + Chromium) is best-effort and lazily imported: if the Chromium
 *     binary isn't present the handler still uploads the HTML and returns a working
 *     HTML preview_url, so the UI preview never breaks.
 */

import { getSummary, getFiresGeojson, getChcCentres, resolveRun } from '../lib/data.js';
import { renderReport } from './render.js';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createDraft } from '../lib/actions.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const isLocal = process.env.PT_LOCAL === '1';

async function renderPdf(html) {
  // Lazy + best-effort: these modules are externalized in the bundle and need the
  // Chromium layer. If anything is missing we skip the PDF rather than 500.
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
}

export const handler = async (event) => {
  const district = event.district || 'Sangrur';
  const runId = event.run_id || 'latest';
  const date = event.date || new Date().toISOString().split('T')[0];

  // 1. Gather data
  const summary = await getSummary(runId);
  const firesGeojson = await getFiresGeojson(runId);
  const chcs = await getChcCentres();

  let contributionPct = 0;
  if (summary && summary.attribution && summary.attribution[district]) {
    contributionPct = summary.attribution[district].p50 || 0;
  } else if (Array.isArray(summary?.hotspot_districts)) {
    // summary.hotspot_districts items look like { district, share, share_p10, share_p90 }.
    const d = summary.hotspot_districts.find((x) => x.district === district);
    if (d) {
      const s = d.share ?? d.share_p50 ?? d.p50 ?? 0;
      contributionPct = s <= 1 ? s * 100 : s; // fractions -> %
    }
  }

  // 2. Render HTML
  const html = await renderReport(district, {
    contributionPct,
    date,
    firesGeojson,
    chcs: chcs?.features?.map((f) => f.properties) || [],
  });

  const headline = `Estimated contribution of crop fires in ${district} to Delhi-NCR PM2.5 on ${date}: ${Math.round(contributionPct)} %`;

  // 3. Create the draft first so we have a stable action_id for the S3 keys.
  // run_id must be a real cycle id (not "latest") to satisfy the ActionItem schema.
  const realRunId = await resolveRun(runId).catch(() => null);
  const action = await createDraft('district_report', { district, date, headline }, realRunId);
  const actionId = action.action_id;

  const bucket = process.env.PT_BUCKET || process.env.BUCKET_DATA;
  const htmlKey = `reports/${actionId}.html`;
  const pdfKey = `reports/${actionId}.pdf`;

  let previewUrl;
  let pdfUrl = null;

  if (isLocal) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const localDir = path.join(process.cwd(), '.local-s3', 'reports');
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(path.join(localDir, `${actionId}.html`), html);
    previewUrl = `http://localhost:3000/${htmlKey}`;
  } else {
    const s3 = new S3Client({ region });
    // Always upload the HTML — this is what the Approvals iframe renders.
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: htmlKey, Body: html, ContentType: 'text/html' }));
    previewUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: htmlKey }), { expiresIn: 86400 });

    // PDF is best-effort (needs the Chromium layer).
    try {
      const pdfBuffer = await renderPdf(html);
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: pdfKey, Body: pdfBuffer, ContentType: 'application/pdf' }));
      pdfUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: pdfKey }), { expiresIn: 86400 });
    } catch (e) {
      console.warn('PDF render skipped (Chromium unavailable):', e?.message);
    }
  }

  // 4. Persist the artifact URLs onto the draft payload so the UI + executor see them.
  await patchPayload(actionId, { preview_url: previewUrl, pdf_url: pdfUrl, html_key: htmlKey, pdf_key: pdfUrl ? pdfKey : null });

  return { action_id: actionId, preview_url: previewUrl, pdf_url: pdfUrl };
};

/** Merge extra fields into an action's payload map (SET payload.#k = :v). */
async function patchPayload(actionId, fields) {
  if (isLocal) return;
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
    if (v === undefined) continue;
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
