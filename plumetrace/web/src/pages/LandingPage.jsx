/**
 * OWNER    : Tejas
 * TASK     : Public landing page at `/` — edge-to-edge split-theme hero (smog →
 *            clean), glassmorphism live-data widgets floating on the image,
 *            live map, how-it-works, two product previews (real components on
 *            mock data), trust, architecture, footer. CTAs route to /login -> /gov.
 *            Backend wiring (useLatestRun / useFleetExposure / useSkill) is
 *            unchanged — only the presentation was redesigned.
 * STATUS   : DONE
 * GUIDE    : brief: docs/PROJECT_BRIEF.md §2.4, §7, §14
 */
import { Link } from 'react-router-dom';
import {
  Wind, ArrowRight, Radar, GitBranch, CheckSquare, Activity, ShieldCheck,
  Map as MapIcon, Bike, TrendingUp, AlertTriangle, Database, Cloud, Server,
  Workflow, Sparkles, Lock, Gauge, Leaf, Play,
} from 'lucide-react';
import PlumeMap from '../components/map/PlumeMap';
import AqiLegend from '../components/map/AqiLegend';
import DoseBar from '../components/DoseBar';
import SimulatedBadge from '../components/SimulatedBadge';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useLatestRun, useFleetExposure, useSkill } from '../hooks/queries';
import { formatShare } from '../lib/format';
import { getAqiColor, getAqiBand } from '../lib/aqi';
import heroSplit from '../assets/hero-split.png';

/* ---------------------------------------------------------------- shell ---- */

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 pt-glass border-b border-border/70">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group" aria-label="PlumeTrace home">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/20 transition-transform duration-200 group-hover:scale-105">
            <Wind size={17} strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">
            Plume<span className="text-primary">Trace</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="transition-transform duration-200 hover:scale-[1.04]">
            <Link to="/login">
              Open dashboard <ArrowRight size={15} aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-eco mb-3">
      <span className="h-1.5 w-1.5 rounded-full bg-eco" aria-hidden />
      {children}
    </div>
  );
}

/* ----------------------------------------------- hero: floating live stats -- */

function LiveStatsGlass() {
  const { data: run } = useLatestRun();
  const band = getAqiBand(run?.max_pm25);
  const items = [
    {
      label: 'Peak PM2.5',
      value: run ? run.max_pm25 : null,
      unit: 'µg/m³',
      color: run ? getAqiColor(run.max_pm25) : undefined,
      sub: run ? `${run.max_pm25_p10}–${run.max_pm25_p90} band · ${band?.label}` : null,
    },
    {
      label: 'Crop-fire share of Delhi PM2.5',
      value: run ? `${Math.round(run.delhi_fire_share_p50 * 100)}%` : null,
      color: '#7cf0b0',
      sub: run ? formatShare(run.delhi_fire_share_p50, run.delhi_fire_share_p10, run.delhi_fire_share_p90) : null,
    },
    {
      label: 'Lead time',
      value: '72',
      unit: 'hours',
      color: '#8fd8ff',
      sub: 'hourly, with ranges',
    },
  ];
  return (
    <div className="glass-strong rounded-[var(--radius-lg)] overflow-hidden grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
      {items.map((it, i) => (
        <div key={it.label} className="p-4 sm:p-5 pt-rise" style={{ animationDelay: `${280 + i * 90}ms` }}>
          <div className="text-[11px] font-medium text-white/65">{it.label}</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            {it.value == null ? (
              <div className="pt-skeleton h-8 w-16 mt-1 bg-white/10" />
            ) : (
              <span
                className="text-[1.9rem] leading-none font-extrabold tracking-tight tnum"
                style={it.color ? { color: it.color } : { color: '#fff' }}
              >
                {it.value}
              </span>
            )}
            {it.unit && <span className="text-xs text-white/55">{it.unit}</span>}
          </div>
          <div className="text-[11px] text-white/55 mt-1 tnum h-4">{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden min-h-[94vh] flex items-end">
      {/* edge-to-edge split-theme image (smog → clean) */}
      <div className="absolute inset-0 -z-10">
        <img
          src={heroSplit}
          alt="Delhi airshed — polluted skyline on the left transitioning to clean, green city on the right"
          className="w-full h-full object-cover pt-kenburns"
        />
        {/* readability scrims: dark on the left for text, fade into the page below */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/55 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/15 to-black/45" />
      </div>

      <div className="relative mx-auto max-w-6xl w-full px-4 sm:px-6 pt-28 pb-14 sm:pb-16">
        {/* floating concept pill */}
        <div
          className="glass-panel pt-float inline-flex items-center gap-2 rounded-full pl-2.5 pr-4 py-1.5 text-[13px] text-white/90 mb-7 pt-rise"
          style={{ animationDelay: '60ms' }}
        >
          <span className="grid place-items-center w-6 h-6 rounded-full bg-eco/90 text-white">
            <Leaf size={13} strokeWidth={2.4} aria-hidden />
          </span>
          From smog to cleaner skies — with data-driven action.
        </div>

        <h1
          className="max-w-3xl text-[2.6rem] leading-[1.02] sm:text-[4.1rem] sm:leading-[0.98] font-extrabold tracking-tight text-white pt-rise"
          style={{ animationDelay: '120ms' }}
        >
          Cleaner tomorrows,{' '}
          <span className="text-gradient-eco">built on data today.</span>
        </h1>

        <p
          className="mt-6 max-w-xl text-[15px] sm:text-lg text-white/80 leading-relaxed pt-rise"
          style={{ animationDelay: '180ms' }}
        >
          Know where Delhi's smoke comes from, <span className="font-semibold text-white">72 hours ahead.</span>{' '}
          PlumeTrace forecasts PM2.5 across Delhi-NCR and attributes it to its sources — crop fires, traffic,
          industry — always as an estimate with a range. Governments see accountability; fleets protect the
          people breathing it.
        </p>

        <div
          className="mt-8 flex flex-wrap items-center gap-3 pt-rise"
          style={{ animationDelay: '240ms' }}
        >
          <Button
            asChild
            size="lg"
            className="h-12 px-6 text-[15px] bg-gradient-to-br from-eco-strong to-eco text-white shadow-[0_18px_40px_-16px_var(--color-eco)] hover:from-eco hover:to-eco-deep transition-transform duration-200 hover:scale-[1.04]"
          >
            <Link to="/login">
              Open dashboard <ArrowRight size={17} aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 px-5 text-[15px] border-white/30 text-white bg-white/5 hover:bg-white/15 hover:border-white/50 transition-transform duration-200 hover:scale-[1.03]"
          >
            <a href="#how"><Play size={15} aria-hidden /> How it works</a>
          </Button>
        </div>

        <p
          className="mt-5 text-xs text-white/70 flex items-center gap-1.5 pt-rise"
          style={{ animationDelay: '300ms' }}
        >
          <ShieldCheck size={13} className="text-eco-strong" aria-hidden />
          Estimates with p10–p90 ranges, never verdicts.
        </p>

        {/* floating live-data widgets on the image */}
        <div className="mt-10">
          <LiveStatsGlass />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- live airshed -- */

function LiveMap() {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <SectionLabel>Live airshed</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">See the smoke move into Delhi.</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Back-trajectories, fire detections and the forecast PM2.5 field — animated across the 72-hour horizon.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm" className="transition-transform duration-200 hover:scale-[1.04] shrink-0">
          <Link to="/login">Open the full map <ArrowRight size={14} aria-hidden /></Link>
        </Button>
      </div>
      <div className="pt-card p-2 overflow-hidden pt-lift">
        <div className="relative h-[360px] sm:h-[500px] rounded-[calc(var(--radius-lg)-6px)] overflow-hidden min-h-0 bg-muted">
          <PlumeMap districtData={null} fireData={null} />
          <div className="absolute top-3 right-3 z-10"><AqiLegend /></div>
          <div className="absolute bottom-3 left-3 z-10 pt-glass rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary pt-pulse-dot" />
            Back-trajectories flowing into Delhi · mock run
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- problem ---- */

function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 border-t border-border">
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-8 items-start">
        <div>
          <SectionLabel>The problem</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Every winter, Delhi breathes some of the world's worst air.
          </h2>
        </div>
        <p className="text-[15px] text-muted-foreground leading-relaxed lg:pt-9">
          On the worst days, crop-residue burning upwind is estimated to contribute a large
          share of the city's PM2.5 — but by the time the smoke arrives, it's too late to act.
          PlumeTrace closes that gap: a 72-hour forecast that names the likely sources in advance,
          so decisions happen before the air turns severe rather than after.
          <span className="block mt-3 text-xs text-muted-foreground/80">
            Source-contribution figures are model estimates with ranges, not measured verdicts.
          </span>
        </p>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- how it works -- */

const STEPS = [
  { icon: Radar, title: 'Detect', body: 'Ingest FIRMS fire detections, GFS weather and OpenAQ stations across the airshed.' },
  { icon: GitBranch, title: 'Attribute', body: 'Back-trajectories + a learned model estimate each source’s share — with a p10–p90 range.' },
  { icon: CheckSquare, title: 'Act', body: 'The Copilot drafts reports, alerts and shift plans. A human approves every outbound action.' },
  { icon: Activity, title: 'Verify', body: 'Compare the forecast against what actually happened and track skill over time.' },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-4 sm:px-6 py-14 border-t border-border scroll-mt-16">
      <div className="text-center max-w-2xl mx-auto">
        <SectionLabel>How it works</SectionLabel>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Detect → Attribute → Act → Verify</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          A closed loop from raw satellite data to a human-approved action — and back to the evidence.
        </p>
      </div>
      <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="pt-card p-5 relative pt-lift group">
              <div className="flex items-center justify-between">
                <span className="grid place-items-center w-10 h-10 rounded-lg bg-eco/12 text-eco border border-eco/25 transition-transform duration-200 group-hover:scale-110">
                  <Icon size={19} strokeWidth={2.1} aria-hidden />
                </span>
                <span className="text-xs font-bold text-muted-foreground/60 tnum">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{s.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* --------------------------------------------------------- product previews */

function GovPreview() {
  const { data: run } = useLatestRun();
  const districts = (run?.hotspot_districts || []).slice(0, 4);
  return (
    <div className="rounded-[var(--radius)] border border-border bg-background/60 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3.5 py-2 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
        <span>District</span><span>Fire share</span><span className="text-right">7d</span>
      </div>
      {districts.length === 0
        ? [...Array(4)].map((_, i) => <div key={i} className="px-3.5 py-2.5"><div className="pt-skeleton h-3.5 w-full" /></div>)
        : districts.map((d, i) => (
            <div key={d.district} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3.5 py-2.5 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="grid place-items-center w-4 h-4 rounded text-[9px] font-bold bg-secondary text-muted-foreground shrink-0">{i + 1}</span>
                <span className="text-[13px] font-medium truncate">{d.district}</span>
              </div>
              <span className="text-[13px] tnum">{formatShare(d.share, d.share_p10, d.share_p90)}</span>
              <span className={`text-[13px] font-medium text-right inline-flex items-center gap-0.5 justify-end tnum ${d.trend_7d > 0 ? 'text-destructive' : 'text-success'}`}>
                <TrendingUp size={12} className={d.trend_7d > 0 ? '' : 'rotate-180'} aria-hidden />
                {d.trend_7d > 0 ? '+' : ''}{Math.round(d.trend_7d * 100)}%
              </span>
            </div>
          ))}
    </div>
  );
}

function FleetPreview() {
  const { data: fleet } = useFleetExposure('fleet_demo', '2026-10-10');
  const riders = (fleet?.riders || []).slice(0, 4);
  return (
    <div className="rounded-[var(--radius)] border border-border bg-background/60 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Rider exposure · % of budget</span>
        <SimulatedBadge size="sm" />
      </div>
      {riders.length === 0
        ? [...Array(4)].map((_, i) => <div key={i} className="px-3.5 py-2.5"><div className="pt-skeleton h-3.5 w-full" /></div>)
        : riders.map((r) => (
            <div key={r.rider_id} className="grid grid-cols-[1fr_1.4fr_auto] gap-3 items-center px-3.5 py-2.5 border-b border-border/40 last:border-0">
              <span className="text-[13px] font-medium truncate">{r.name || r.rider_id}</span>
              <DoseBar current={r.forecast_dose_pct} limit={100} />
              <span className={`text-[12px] tnum text-right w-12 ${r.over_budget ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                {Math.round(r.forecast_dose_pct)}%
              </span>
            </div>
          ))}
    </div>
  );
}

function Products() {
  const PRODUCTS = [
    {
      icon: MapIcon, tone: 'Government', title: 'Accountability, before the smoke arrives',
      body: 'Rank upwind districts by their estimated contribution, watch 7-day trends, and generate a sourced report — every number carrying its range.',
      preview: <GovPreview />, cta: 'Government dashboard',
    },
    {
      icon: Bike, tone: 'Fleet', title: 'Protection for the people outdoors',
      body: 'Forecast each rider’s pollution dose against a safe daily budget and re-plan shifts to pull the worst-exposed back under it. Data is simulated.',
      preview: <FleetPreview />, cta: 'Fleet dashboard',
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 border-t border-border">
      <SectionLabel>Two products, one forecast</SectionLabel>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight max-w-2xl">
        The same attributed forecast, pointed at two very different decisions.
      </h2>
      <div className="mt-9 grid lg:grid-cols-2 gap-5">
        {PRODUCTS.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.tone} className="pt-card p-5 sm:p-6 flex flex-col pt-lift">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/12 text-primary border border-primary/20">
                  <Icon size={18} strokeWidth={2.1} aria-hidden />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.tone}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">{p.body}</p>
              <div className="mt-5">{p.preview}</div>
              <div className="mt-5 pt-1">
                <Button asChild variant="secondary" size="sm" className="transition-transform duration-200 hover:scale-[1.04]">
                  <Link to="/login">
                    {p.cta} <ArrowRight size={14} aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- trust ---- */

function Trust() {
  const { data: skill } = useSkill(7);
  const mid = skill?.backtest?.find((b) => b.lead_bucket === '24-48');
  const coverage = mid ? Math.round(mid.coverage_p10_p90 * 100) : null;
  const vsPersistence = mid ? Math.round(mid.skill_vs_persistence * 100) : null;

  const metrics = [
    { value: coverage != null ? `${coverage}%` : '—', label: 'p10–p90 coverage at 24–48 h', note: 'target ≈ 80%' },
    { value: vsPersistence != null ? `+${vsPersistence}%` : '—', label: 'skill vs persistence at 24–48 h', note: 'backtest' },
    { value: '72 h', label: 'forecast horizon', note: 'hourly resolution' },
  ];

  const sources = [
    { name: 'NASA FIRMS', use: 'Active fire detections', licence: 'public domain' },
    { name: 'NOAA GFS', use: 'Weather & winds', licence: 'public domain' },
    { name: 'OpenAQ', use: 'Ground PM2.5 stations', licence: 'CC BY 4.0' },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 border-t border-border">
      <div className="grid lg:grid-cols-[1fr_1fr] gap-10">
        <div>
          <SectionLabel>Built to be trusted</SectionLabel>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Estimates with ranges, never verdicts.</h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-md">
            Every figure ships with a p10–p90 band and is checked against what actually happened.
            The tone toward farmers is supportive and never blaming, and no individual is ever named.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-px rounded-[var(--radius)] overflow-hidden border border-border bg-border">
            {metrics.map((m) => (
              <div key={m.label} className="bg-card p-4">
                <div className="text-xl font-extrabold tracking-tight tnum text-primary">{m.value}</div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{m.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">{m.note}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="warning" icon={AlertTriangle}>Fleet data is simulated</Badge>
            <Badge tone="neutral" icon={ShieldCheck}>DPDP-aligned · 30-day retention</Badge>
          </div>
        </div>

        <div className="pt-card p-5 sm:p-6 pt-lift">
          <h3 className="text-sm font-semibold">Data sources</h3>
          <p className="text-xs text-muted-foreground mt-1">Open, licensed, attributable.</p>
          <div className="mt-4 divide-y divide-border">
            {sources.map((s) => (
              <div key={s.name} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.use}</div>
                </div>
                <Badge tone="neutral" size="sm">{s.licence}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- architecture ---- */

function Architecture() {
  const stack = [
    { icon: Cloud, label: 'CloudFront + S3' },
    { icon: Lock, label: 'Cognito' },
    { icon: Server, label: 'API Gateway + Lambda' },
    { icon: Workflow, label: 'Step Functions' },
    { icon: Database, label: 'DynamoDB + S3' },
    { icon: Sparkles, label: 'Claude Copilot' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 border-t border-border">
      <div className="pt-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <SectionLabel>Architecture</SectionLabel>
            <h2 className="text-lg font-bold tracking-tight">Serverless on AWS, end to end.</h2>
          </div>
          <Badge tone="brand" icon={Gauge}>Scales to zero between runs</Badge>
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {stack.map((s) => {
            const Icon = s.icon;
            return (
              <span key={s.label} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-[13px] text-foreground transition-transform duration-200 hover:scale-[1.04] hover:border-primary/40">
                <Icon size={15} className="text-primary" strokeWidth={2.1} aria-hidden />
                {s.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- footer ---- */

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-7 h-7 rounded-md bg-gradient-to-br from-primary to-accent text-primary-foreground">
              <Wind size={15} strokeWidth={2.5} aria-hidden />
            </span>
            <span className="text-sm font-extrabold tracking-tight">Plume<span className="text-primary">Trace</span></span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground max-w-xs leading-relaxed">
            Source-attributed PM2.5 forecasting for Delhi-NCR. A hackathon project — figures are
            estimates with ranges, and fleet data is simulated.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/login">Open dashboard <ArrowRight size={14} aria-hidden /></Link>
          </Button>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} PlumeTrace</span>
          <span>Data: NASA FIRMS · NOAA GFS · OpenAQ</span>
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------------------------------------------- page ---- */

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main>
        <Hero />
        <LiveMap />
        <Problem />
        <HowItWorks />
        <Products />
        <Trust />
        <Architecture />
      </main>
      <Footer />
    </div>
  );
}
