/**
 * OWNER    : Khare
 * DUE      : D2 11:00
 * TASK     :
 *   Fill the template (simple {{placeholders}} or tagged template); number formatting rules from brief §7.
 * DONE WHEN: -
 * GUIDE    : docs/team/KHARE.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */

import { generateSvgMap } from './svgMap.js';

// Template inlined (esbuild bundles .js only; a separate template.html is NOT
// shipped in the Lambda package, which caused ENOENT at runtime). Keep in sync
// with template.html.
const TEMPLATE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PlumeTrace Government Report - {{DATE}}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #333; line-height: 1.4; font-size: 11pt; }
    h1, h2, h3 { color: #004488; margin-top: 0; }
    .header { border-bottom: 2px solid #004488; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: baseline; }
    .headline { background: #f0f8ff; padding: 15px; border-left: 4px solid #004488; margin-bottom: 20px; font-size: 1.1em; }
    .map-container { width: 100%; height: 300px; margin-bottom: 20px; border: 1px solid #ccc; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .section { margin-bottom: 20px; }
    .footer { font-size: 0.85em; color: #666; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 20px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page-break { page-break-before: always; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>PlumeTrace District Report</h1>
    <div>Date: {{DATE}} | District: {{DISTRICT}}</div>
  </div>
  <div class="headline">
    <strong>Key Finding:</strong> Crop residue burning in {{DISTRICT}} contributed an estimated <strong>{{CONTRIBUTION_PCT}}</strong> to Delhi's PM2.5 levels.
  </div>
  <div class="map-container">
    {{SVG_MAP}}
  </div>
  <div class="section">
    <h2>Details</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Active Fires Detected (48h)</td><td>{{FIRE_COUNT}}</td></tr>
      <tr><td>Estimated Contribution to Delhi</td><td>{{CONTRIBUTION_PCT}}</td></tr>
    </table>
  </div>
  <div class="section">
    <h2>Supportive Actions &amp; Interventions</h2>
    <p>We kindly request local authorities to deploy machinery to the following affected areas to assist farmers with sustainable residue management:</p>
    <ul>
      {{SUPPORTIVE_ACTIONS}}
    </ul>
    <p>Please note that this data is intended solely to support local communities and optimize resource allocation. No individual enforcement action should be based on these estimates.</p>
  </div>
  <div class="section footer">
    <strong>Methodology &amp; Limitations:</strong> The contribution percentage is a model-derived estimate combining satellite fire detections and HYSPLIT wind trajectories. Uncertainty remains due to cloud cover and model resolution.
    <br><br>
    <strong>Sources:</strong> FIRMS VIIRS (NASA), NOAA HYSPLIT.
  </div>
</body>
</html>`;

function formatNumber(num) {
  // Brief §7: e.g. "31 % (22–40 %)" or similar
  return Math.round(num);
}

export async function renderTemplate(district, data, htmlTemplateString) {
  // data: { firesGeojson, contributionPct, date, chcs }
  
  const svgMap = generateSvgMap(null, data.firesGeojson);
  
  const dateStr = data.date || new Date().toISOString().split('T')[0];
  const fireCount = data.firesGeojson ? data.firesGeojson.features.length : 0;
  
  // Format the contribution percentage
  const pctStr = `${formatNumber(data.contributionPct)} %`;
  
  let supportiveActionsHtml = '';
  if (data.chcs && data.chcs.length > 0) {
    for (const chc of data.chcs) {
      supportiveActionsHtml += `<li><strong>${chc.name}</strong> - Machine rental available.</li>\n`;
    }
  } else {
    supportiveActionsHtml = '<li>No nearby Custom Hiring Centres (CHCs) found in the database.</li>';
  }
  
  let html = htmlTemplateString;
  html = html.replace(/{{DATE}}/g, dateStr);
  html = html.replace(/{{DISTRICT}}/g, district);
  html = html.replace(/{{CONTRIBUTION_PCT}}/g, pctStr);
  html = html.replace(/{{FIRE_COUNT}}/g, fireCount);
  html = html.replace(/{{SVG_MAP}}/g, svgMap);
  html = html.replace(/{{SUPPORTIVE_ACTIONS}}/g, supportiveActionsHtml);
  
  return html;
}

export async function renderReport(district, data) {
  return renderTemplate(district, data, TEMPLATE_HTML);
}
