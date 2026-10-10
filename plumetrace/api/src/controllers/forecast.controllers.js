/**
 * OWNER    : Yasho2
 * DUE      : D2 12:00
 * TASK     :
 *   Real implementations: summary.json from S3 (latest pointer outputs/latest.json), Forecast via GSI byRun filtered by valid_hour + bbox -> H3 polygons GeoJSON (h3-js cellToBoundary), StationForecast query, Attribution query, trajectories.geojson filtered by station, outputs/skill/latest.json. Cache S3 reads 60 s in-memory.
 * DONE WHEN: Responses validate against contracts (api/tests/contract.test.js).
 * GUIDE    : docs/team/YASHO2.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : WIP   (mock path tested D1; real S3/DynamoDB path verifies at CP1 D2)
 */
import { cellToBoundary } from 'h3-js';
import env from '../libs/env.js';
import * as mock from '../libs/mockStore.js';
import { getDocClient, getDdbCommands, getS3 } from '../libs/aws.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { AppError } from '../middlewares/error.middlewares.js';

/* ----------------------- small 60 s S3 JSON cache ----------------------- */
const _cache = new Map(); // key -> { at, value }
async function getS3Json(key, ttlMs = 60_000) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const s3 = await getS3();
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const res = await s3.send(new GetObjectCommand({ Bucket: env.BUCKET, Key: key }));
  const value = JSON.parse(await res.Body.transformToString());
  _cache.set(key, { at: Date.now(), value });
  return value;
}

/** Resolve the latest run_id via the outputs/latest.json pointer (D-10). */
async function latestPointer() {
  return getS3Json('outputs/latest.json');
}

/* --------- service functions (reused by agent/tools/shared.tools.js) -------- */
export const svcSummary = async (runId) => {
  if (env.MOCK_MODE) return mock.getSummary();
  const run = runId || (await latestPointer()).run_id;
  return getS3Json(`outputs/run=${run}/summary.json`);
};

export const svcForecast = async ({ run_id, valid_hour, bbox } = {}) => {
  if (env.MOCK_MODE) return mock.getForecastGeoJSON({ valid_hour, bbox });

  const run = run_id || (await latestPointer()).run_id;
  if (!valid_hour) throw new AppError(400, 'validation_error', 'valid_hour is required for /forecast');

  const doc = await getDocClient();
  const { QueryCommand } = await getDdbCommands();
  const { Items = [] } = await doc.send(new QueryCommand({
    TableName: env.TABLE_FORECAST,
    IndexName: 'byRun',
    // GSI byRun (deployed): PK run_id, SK valid_hour. One hour = all h3 cells.
    KeyConditionExpression: 'run_id = :r AND valid_hour = :vh',
    ExpressionAttributeValues: { ':r': run, ':vh': valid_hour },
  }));

  let box = null;
  if (bbox) { const [w, s, e, n] = bbox.split(',').map(Number); box = { w, s, e, n }; }

  const features = Items.map((it) => {
    const ring = cellToBoundary(it.h3, true); // [lon,lat], GeoJSON order
    if (ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) ring.push(ring[0]);
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        h3: it.h3, run_id: run, valid_hour, lead_h: it.lead_h,
        pm25: it.pm25 ?? null, pm25_p10: it.pm25_p10 ?? null, pm25_p90: it.pm25_p90 ?? null,
        fire_share: it.fire_share ?? null, fire_share_p10: it.fire_share_p10 ?? null, fire_share_p90: it.fire_share_p90 ?? null,
        top_sources: it.top_sources ?? [], hpbl_m: it.hpbl_m ?? null,
      },
    };
  }).filter((f) => {
    if (!box) return true;
    return f.geometry.coordinates[0].some(([lon, lat]) => lon >= box.w && lon <= box.e && lat >= box.s && lat <= box.n);
  });

  return { type: 'FeatureCollection', run_id: run, valid_hour, features };
};

export const svcStation = async (id, runId) => {
  if (env.MOCK_MODE) return mock.getStationSeries(id);
  const run = runId || (await latestPointer()).run_id;
  const doc = await getDocClient();
  const { QueryCommand } = await getDdbCommands();
  const { Items = [] } = await doc.send(new QueryCommand({
    TableName: env.TABLE_STATION_FORECAST,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :run)',
    ExpressionAttributeValues: { ':pk': `station#${id}`, ':run': run },
  }));
  if (!Items.length) return null;
  Items.sort((a, b) => a.lead_h - b.lead_h);
  const series = Items.map((it) => ({
    valid_hour: it.valid_hour, lead_h: it.lead_h,
    pm25_p10: it.pm25_p10, pm25_p50: it.pm25_p50, pm25_p90: it.pm25_p90,
    fire_share_p10: it.fire_share_p10, fire_share_p50: it.fire_share_p50, fire_share_p90: it.fire_share_p90,
    obs_pm25: it.obs_pm25 ?? null,
  }));
  return {
    station_id: id, station_name: Items[0].station_name ?? id,
    lat: Items[0].lat ?? 0, lon: Items[0].lon ?? 0,
    run_id: run, issued_at: Items[0].issued_at ?? series[0]?.valid_hour, series,
  };
};

export const svcAttribution = async (date) => {
  if (env.MOCK_MODE) return mock.getAttribution(date);
  date = date || new Date().toISOString().slice(0, 10); // default to today when omitted
  const doc = await getDocClient();
  const { QueryCommand } = await getDdbCommands();
  const { Items = [] } = await doc.send(new QueryCommand({
    TableName: env.TABLE_ATTRIBUTION,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `date#${date}` },
  }));
  const run = (await latestPointer()).run_id;
  const districts = Items.map((it) => ({
    district: it.district,
    share_p10: it.share_p10, share_p50: it.share_p50, share_p90: it.share_p90,
    fire_count: it.fire_count, frp_sum_mw: it.frp_sum_mw,
    trend_7d: it.trend_7d ?? 0, receptor_stations: it.receptor_stations ?? [],
  }));
  return { date, run_id: run, districts };
};

export const svcTrajectories = async (station, runId) => {
  if (env.MOCK_MODE) return mock.getTrajectories(station);
  const run = runId || (await latestPointer()).run_id;
  const fc = await getS3Json(`outputs/run=${run}/trajectories.geojson`);
  if (!station) return fc;
  return { type: 'FeatureCollection', run_id: fc.run_id, features: fc.features.filter((f) => f.properties.station_id === station) };
};

export const svcSkill = async (/* days */) => {
  if (env.MOCK_MODE) return mock.getSkill();
  return getS3Json('outputs/skill/latest.json');
};

export const svcFires = async (runId) => {
  if (env.MOCK_MODE) return mock.getFires();
  const run = runId || (await latestPointer()).run_id;
  return getS3Json(`outputs/run=${run}/fires_48h.geojson`);
};

/* ------------------------------- handlers --------------------------------- */
export const getLatestRun = asyncHandler(async (_req, res) => res.json(await svcSummary()));

export const getForecast = asyncHandler(async (req, res) => {
  const { run_id, valid_hour, bbox } = req.validatedQuery || {};
  res.json(await svcForecast({ run_id, valid_hour, bbox }));
});

export const getStationForecast = asyncHandler(async (req, res) => {
  const series = await svcStation(req.params.id, req.validatedQuery?.run_id);
  if (!series) throw new AppError(404, 'not_found', `No forecast for station ${req.params.id}`);
  res.json(series);
});

export const getAttribution = asyncHandler(async (req, res) => {
  res.json(await svcAttribution((req.validatedQuery || {}).date));
});

export const getTrajectories = asyncHandler(async (req, res) => {
  res.json(await svcTrajectories(req.query.station));
});

export const getFires = asyncHandler(async (req, res) => {
  res.json(await svcFires(req.query.run_id));
});

export const getSkill = asyncHandler(async (req, res) => {
  const { days } = req.validatedQuery || { days: 7 };
  res.json(await svcSkill(days));
});
