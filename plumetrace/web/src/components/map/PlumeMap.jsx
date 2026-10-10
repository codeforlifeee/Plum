/**
 * OWNER    : Tanmay
 * DUE      : D1 18:00
 * TASK     :
 *   MapLibre GL (Amazon Location style URL) + deck.gl MapboxOverlay; composes the layers below; hover tooltips with ranges.
 * DONE WHEN: Mock map renders by D1 evening.
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { useTimeStore } from '../../stores/timeStore';
import { useThemeStore } from '../../stores/themeStore';
import { useLatestRun, useForecast, useTrajectories, useFires } from '../../hooks/queries';
import { createFiresLayer, createTripsLayer, createH3Layer, createDistrictsLayer } from './layers';

// Keyless Esri Canvas basemaps (no API key) so the map always renders locally, in
// a tone that matches the active theme. In prod, VITE_LOCATION_STYLE_URL points at
// Amazon Location and overrides both.
const BASEMAPS = {
  dark: {
    tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    bg: '#0a0c11',
  },
  light: {
    tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    bg: '#eef1f7',
  },
};

function buildStyle(theme) {
  const b = BASEMAPS[theme] || BASEMAPS.dark;
  return {
    version: 8,
    sources: {
      esriCanvas: {
        type: 'raster',
        tiles: [b.tiles],
        tileSize: 256,
        attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
        maxzoom: 16,
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': b.bg } },
      { id: 'esriCanvas', type: 'raster', source: 'esriCanvas', paint: { 'raster-opacity': 0.92 } },
    ],
  };
}

export default function PlumeMap({ districtData, fireData }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const { runId, getValidHour } = useTimeStore();
  const theme = useThemeStore((s) => s.theme);
  const validHour = getValidHour();

  const [currentTime, setCurrentTime] = useState(0);

  const { data: latestRun } = useLatestRun();
  const currentRunId = runId || latestRun?.run_id;
  const { data: forecastData } = useForecast(currentRunId, validHour);
  const { data: trajectoriesData } = useTrajectories(currentRunId, 'all');
  const { data: firesData } = useFires(currentRunId);

  // --- init map once ---
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const style = import.meta.env.VITE_LOCATION_STYLE_URL || buildStyle(theme);

    let map;
    try {
      map = new maplibregl.Map({ container: mapContainer.current, style, center: [76.9, 28.6], zoom: 6.4, attributionControl: false });
    } catch (e) {
      console.error('[PlumeMap] map construct failed', e);
      return;
    }
    mapRef.current = map;

    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onError: (err) => console.error('[PlumeMap] deck error', err),
    });
    overlayRef.current = overlay;
    map.addControl(overlay);

    map.on('load', () => map.resize());
    map.on('error', (e) => console.error('[PlumeMap] map error', e?.error || e));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainer.current);

    return () => { ro.disconnect(); map.remove(); mapRef.current = null; overlayRef.current = null; };
    // Init once. `theme` only seeds the first basemap; later theme changes are
    // handled by the dedicated setStyle effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- swap the basemap when the theme changes (local keyless styles only) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || import.meta.env.VITE_LOCATION_STYLE_URL) return;
    map.setStyle(buildStyle(theme));
    map.once('styledata', () => map.resize());
  }, [theme]);

  // --- animate the trips "smoke flow" ---
  useEffect(() => {
    let raf;
    const tick = () => { setCurrentTime((t) => (t + 0.15) % 72); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- push layers whenever data (or the animation clock) changes ---
  useEffect(() => {
    if (!overlayRef.current) return;
    const layers = [
      createH3Layer(forecastData, false, theme),
      createDistrictsLayer(districtData),
      createFiresLayer(fireData || firesData),
      createTripsLayer(trajectoriesData, currentTime, theme),
    ].filter(Boolean);
    overlayRef.current.setProps({ layers });
  }, [forecastData, districtData, fireData, firesData, trajectoriesData, currentTime, theme]);

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" style={{ background: (BASEMAPS[theme] || BASEMAPS.dark).bg }} />
    </div>
  );
}
