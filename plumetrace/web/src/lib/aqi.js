/**
 * OWNER    : Tanmay
 * DUE      : D1 14:00
 * TASK     :
 *   India NAQI PM2.5 bands (Good 0–30, Satisfactory 31–60, Moderate 61–90, Poor 91–120, Very Poor 121–250, Severe >250) -> colour (colour-blind checked), label.
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
// India NAQI PM2.5 bands. Hexes retuned for perceptual evenness and to stay
// legible on BOTH the dark map (#0a0c11) and the light map/basemap — the band
// meaning is universal, so one ramp serves both themes. Ordinal ramp — always
// shown with band order + numeric µg/m³, never colour alone. Keep in sync with
// --color-aqi-* in index.css.
export const AQI_BANDS = [
  { min: 0, max: 30, label: 'Good', color: '#2fb871' },
  { min: 31, max: 60, label: 'Satisfactory', color: '#9cc417' },
  { min: 61, max: 90, label: 'Moderate', color: '#ef9500' },
  { min: 91, max: 120, label: 'Poor', color: '#e35f1e' },
  { min: 121, max: 250, label: 'Very Poor', color: '#dc2f3c' },
  { min: 251, max: 9999, label: 'Severe', color: '#b22f7e' },
];

export function getAqiBand(pm25) {
  if (pm25 == null) return null;
  const val = Math.round(pm25);
  return AQI_BANDS.find(b => val >= b.min && val <= b.max) || AQI_BANDS[AQI_BANDS.length - 1];
}

export function getAqiColor(pm25) {
  const band = getAqiBand(pm25);
  return band ? band.color : '#888888';
}
