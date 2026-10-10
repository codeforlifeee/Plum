/**
 * OWNER    : Tanmay
 * DUE      : D1 20:00
 * TASK     :
 *   Layer factories: firesLayer (ScatterplotLayer size=FRP, colour=age), tripsLayer (TripsLayer animated by currentTime — the 'smoke flow' moment), h3Layer (H3HexagonLayer p50 colour, p10–p90 width as opacity toggle, null cells hatched/grey), districtsLayer (GeoJsonLayer by fire share).
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import { ScatterplotLayer, GeoJsonLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { getAqiColor } from '../../lib/aqi';

export function createFiresLayer(data) {
  if (!data || !data.features) return null;
  return new ScatterplotLayer({
    id: 'fires-layer',
    data: data.features,
    getPosition: d => d.geometry.coordinates,
    getRadius: d => 600 + Math.sqrt(d.properties?.frp || 0) * 450,
    radiusUnits: 'meters',
    radiusMinPixels: 2.5,
    radiusMaxPixels: 16,
    // fresh fires glow brighter; older ones fade toward deep red
    getFillColor: d => {
      const age = d.properties?.age_h ?? 0;
      const t = Math.min(age / 48, 1);
      return [255, Math.round(140 - t * 90), Math.round(40 - t * 30), 210];
    },
    stroked: true,
    getLineColor: [255, 180, 80, 120],
    lineWidthMinPixels: 0.5,
    pickable: true,
  });
}

export function createTripsLayer(data, currentTime, theme = 'dark') {
  if (!data || !data.features) return null;
  // Brand-blue trails read cleanly on the light basemap; a brighter cyan glows
  // on the dark one.
  const trailColor = theme === 'light' ? [23, 102, 214] : [120, 220, 255];
  return new TripsLayer({
    id: 'trips-layer',
    data: data.features,
    getPath: d => d.geometry.coordinates,
    // deck.gl needs NUMERIC timestamps. The contract provides ISO strings
    // (TrajectoryFeature.properties.timestamps), so convert to hours relative to
    // the path's earliest point — same unit as currentTime (leadH, 0..72).
    getTimestamps: d => {
      const ts = d.properties?.timestamps;
      if (Array.isArray(ts) && ts.length) {
        const nums = ts.map(t => (typeof t === 'number' ? t : Date.parse(t) / 3600000));
        const base = Math.min(...nums);
        return nums.map(n => n - base);
      }
      return d.geometry.coordinates.map((_, i) => i);
    },
    getColor: trailColor,
    opacity: 0.9,
    widthMinPixels: 3,
    jointRounded: true,
    capRounded: true,
    fadeTrail: true,
    trailLength: 14,           // hours
    currentTime: currentTime,
  });
}

export function createH3Layer(data, uncertaintyToggle = false, theme = 'dark') {
  if (!data || !data.features) return null;
  // Hairline cell borders: white on the dark basemap, dark slate on the light one.
  const lineColor = theme === 'light' ? [15, 22, 35, 28] : [255, 255, 255, 25];
  return new H3HexagonLayer({
    id: 'h3-layer',
    data: data.features,
    getHexagon: d => d.properties?.h3 || d.h3,
    filled: true,
    stroked: true,
    extruded: false,
    opacity: theme === 'light' ? 0.62 : 0.55,
    getLineColor: lineColor,
    lineWidthMinPixels: 0.5,
    getFillColor: d => {
      const pm25 = d.properties?.pm25 ?? d.pm25;
      if (pm25 == null) return [90, 100, 120, 55]; // "no data" cells, faint slate
      const hex = getAqiColor(pm25);
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      let alpha = 235;
      if (uncertaintyToggle) {
        const p10 = d.properties?.pm25_p10 ?? d.pm25_p10 ?? 0;
        const p90 = d.properties?.pm25_p90 ?? d.pm25_p90 ?? 0;
        alpha = Math.max(70, 255 - (p90 - p10) * 2);
      }
      return [r, g, b, alpha];
    },
    updateTriggers: { getFillColor: [uncertaintyToggle] },
    pickable: true,
  });
}

export function createDistrictsLayer(data) {
  if (!data || !data.features) return null;
  return new GeoJsonLayer({
    id: 'districts-layer',
    data,
    getFillColor: d => {
      const share = d.properties?.share_p50 || 0;
      return [255, 0, 0, share * 255];
    },
    getLineColor: [100, 100, 100, 150],
    lineWidthMinPixels: 1,
    pickable: true
  });
}
