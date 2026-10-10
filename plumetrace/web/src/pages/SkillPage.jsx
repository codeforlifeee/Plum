/**
 * OWNER    : Tanmay
 * DUE      : D3 12:00
 * TASK     :
 *   US5/AC3/AC4: forecast vs actual line charts per station with p10–p90 band (recharts), metrics table by lead bucket, backtest vs live tabs, persistence baseline.
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import { useState } from 'react';
import { ComposedChart, Area, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Info, LineChart as LineChartIcon, Table as TableIcon } from 'lucide-react';
import { useSkill, useStation, useLatestRun } from '../hooks/queries';
import { useThemeStore } from '../stores/themeStore';
import { SegmentedControl } from '../components/ui/Tabs';
import { Stat } from '../components/ui/Stat';
import { Table, THead, TBody, Tr } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';

const STATION_ID = '1420'; // Anand Vihar

// Chart palette resolved per theme so the grid, axes and observed points stay
// legible on both the dark and the light card surface.
const CHART = {
  dark:  { brand: '#4aa8ff', obs: '#eef2f9', obsStroke: '#121826', grid: '#273145', axis: '#9aa3b7' },
  light: { brand: '#1766d6', obs: '#0f1623', obsStroke: '#ffffff', grid: '#dde3ee', axis: '#576074' },
};

function ChartTooltip({ active, payload, label, c }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold mb-1 tnum">+{label} h lead</div>
      <div className="flex items-center gap-2 tnum">
        <span className="w-2 h-2 rounded-full" style={{ background: c.brand }} />
        Median <span className="text-foreground font-medium">{Math.round(p.p50)}</span> µg/m³
      </div>
      {Array.isArray(p.range) && (
        <div className="text-muted-foreground tnum mt-0.5 ml-4">p10–p90: {Math.round(p.range[0])}–{Math.round(p.range[1])}</div>
      )}
      {p.actual != null && (
        <div className="flex items-center gap-2 tnum mt-1">
          <span className="w-2 h-2 rounded-full ring-2 ring-popover" style={{ background: c.obs }} />
          Observed <span className="text-foreground font-medium">{Math.round(p.actual)}</span> µg/m³
        </div>
      )}
    </div>
  );
}

function Legend({ c }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded-full" style={{ background: c.brand }} /> Median forecast</span>
      <span className="flex items-center gap-1.5"><span className="w-4 h-2 rounded-sm" style={{ background: c.brand, opacity: 0.18 }} /> p10–p90</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-background" style={{ background: c.obs }} /> Observed</span>
    </div>
  );
}

export default function SkillPage() {
  const [mode, setMode] = useState('live');
  const [view, setView] = useState('chart');
  const { data: skill } = useSkill(7);
  const { data: run } = useLatestRun();
  const { data: station } = useStation(STATION_ID, run?.run_id);
  const theme = useThemeStore((s) => s.theme);
  const c = CHART[theme] || CHART.dark;

  const chartData = (station?.series || []).map((p) => ({
    time: p.lead_h,
    p50: p.pm25_p50,
    range: [p.pm25_p10, p.pm25_p90],
    actual: p.obs_pm25 ?? null,
  }));

  const buckets = skill?.[mode] || [];
  const avg = (key) => (buckets.length ? buckets.reduce((s, b) => s + b[key], 0) / buckets.length : null);
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const signed = (x) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`);

  const avgCoverage = avg('coverage_p10_p90');
  const avgSkill = avg('skill_vs_persistence');
  const avgSevere = avg('severe_hit_rate');

  return (
    <div className="p-5 sm:p-6 max-w-6xl mx-auto h-full flex flex-col gap-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forecast skill</h1>
          <p className="text-sm text-muted-foreground mt-0.5">How well the forecast tracks reality — the honest numbers.</p>
        </div>
        <SegmentedControl
          ariaLabel="Evaluation mode"
          value={mode}
          onChange={setMode}
          options={[{ value: 'backtest', label: 'Backtest' }, { value: 'live', label: 'Live' }]}
        />
      </div>

      {/* trust stat tiles */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="p10–p90 coverage" value={pct(avgCoverage)} tone="text-primary" sub="target ≈ 80%" />
        <Stat label="Skill vs persistence" value={signed(avgSkill)} tone={avgSkill >= 0 ? 'text-success' : 'text-destructive'} sub="higher is better" />
        <Stat label="Severe hit rate" value={pct(avgSevere)} tone="text-foreground" sub=">250 µg/m³ events" />
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/50 border border-border rounded-[var(--radius)] px-3 py-2">
        <Info size={14} className="text-primary mt-0.5 shrink-0" aria-hidden />
        <span>
          {mode === 'backtest'
            ? 'Backtest uses reanalysis weather (ERA5) — optimistic, because the weather is known.'
            : 'Live uses GFS forecast weather — the honest operating condition.'}
        </span>
      </div>

      {/* chart / table */}
      <div className="pt-card flex flex-col flex-1 min-h-[420px]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <div>
            <h2 className="font-semibold text-sm">Station forecast vs observed — {station?.station_name || `#${STATION_ID}`}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">PM2.5 µg/m³ across the 72-hour horizon</p>
          </div>
          <div className="flex items-center gap-3">
            <Legend c={c} />
            <SegmentedControl
              ariaLabel="Chart or table view"
              size="sm"
              value={view}
              onChange={setView}
              options={[{ value: 'chart', label: 'Chart', icon: LineChartIcon }, { value: 'table', label: 'Table', icon: TableIcon }]}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 p-4">
          {chartData.length === 0 ? (
            <EmptyState title="No series data" description="This station has no forecast series for the current run." />
          ) : view === 'chart' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.brand} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={c.brand} stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.6} />
                <XAxis
                  dataKey="time" tickLine={false} axisLine={{ stroke: c.grid }}
                  tick={{ fill: c.axis, fontSize: 11 }}
                  tickFormatter={(v) => `+${v}h`} label={{ value: 'Lead time', position: 'insideBottom', offset: -2, fill: c.axis, fontSize: 11 }}
                />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 11 }} width={40} />
                <Tooltip content={<ChartTooltip c={c} />} cursor={{ stroke: c.brand, strokeOpacity: 0.4, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="range" stroke="none" fill="url(#band)" name="p10–p90" isAnimationActive={false} />
                <Line type="monotone" dataKey="p50" stroke={c.brand} strokeWidth={2} dot={false} name="Median" />
                <Scatter dataKey="actual" fill={c.obs} stroke={c.obsStroke} strokeWidth={2} name="Observed" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full overflow-auto">
              <Table>
                <THead><tr><th>Lead</th><th>Median</th><th>p10</th><th>p90</th><th>Observed</th></tr></THead>
                <TBody>
                  {chartData.map((d) => (
                    <Tr key={d.time}>
                      <td className="tnum">+{d.time} h</td>
                      <td className="tnum">{Math.round(d.p50)}</td>
                      <td className="tnum text-muted-foreground">{Math.round(d.range[0])}</td>
                      <td className="tnum text-muted-foreground">{Math.round(d.range[1])}</td>
                      <td className="tnum">{d.actual != null ? Math.round(d.actual) : '—'}</td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* metrics by lead bucket */}
      <div className="pt-card">
        <div className="px-5 pt-4 pb-1">
          <h2 className="font-semibold text-sm">Metrics by lead time <span className="text-muted-foreground font-normal">({mode})</span></h2>
        </div>
        <div className="px-3 pb-3">
          <Table>
            <THead>
              <tr><th>Lead</th><th>MAE</th><th>RMSE</th><th>Coverage</th><th>Skill vs persistence</th><th>Severe hit</th><th>n</th></tr>
            </THead>
            <TBody>
              {buckets.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No skill data yet.</td></tr>
              ) : (
                buckets.map((b) => (
                  <Tr key={b.lead_bucket}>
                    <td className="font-medium">{b.lead_bucket} h</td>
                    <td className="tnum">{b.mae}</td>
                    <td className="tnum">{b.rmse}</td>
                    <td className="tnum">{pct(b.coverage_p10_p90)}</td>
                    <td className={`tnum font-medium ${b.skill_vs_persistence >= 0 ? 'text-success' : 'text-destructive'}`}>{signed(b.skill_vs_persistence)}</td>
                    <td className="tnum">{pct(b.severe_hit_rate)}</td>
                    <td className="tnum text-muted-foreground">{b.n.toLocaleString()}</td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
