/**
 * OWNER    : Tanmay
 * DUE      : D2 12:00
 * TASK     :
 *   US1: map (fires, trajectories, districts, H3) + time slider, district ranking table with ranges + trend, 'Generate report' (asks Copilot / calls tool), draft queue snippet.
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import { useState } from 'react';
import { FileText, TrendingUp, Wind, Factory, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useLatestRun } from '../hooks/queries';
import PlumeMap from '../components/map/PlumeMap';
import TimeSlider from '../components/map/TimeSlider';
import AqiLegend from '../components/map/AqiLegend';
import { useCopilotStore } from '../stores/copilotStore';
import { getAqiColor, getAqiBand } from '../lib/aqi';
import { formatShare } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Stat } from '../components/ui/Stat';
import { Badge } from '../components/ui/Badge';
import { SkeletonRows } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';

function DistrictRow({ d, rank }) {
  const up = d.trend_7d > 0;
  const share = Math.round((d.share || 0) * 100);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-4 py-3 border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors">
      <span className={`grid place-items-center w-5 h-5 rounded text-[10px] font-bold tnum ${rank === 1 ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
        {rank}
      </span>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">{d.district}</span>
          <span className="text-sm tnum text-foreground">{formatShare(d.share, d.share_p10, d.share_p90)}</span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(share * 3.5, 100)}%` }} />
        </div>
      </div>
      <span className={`text-sm font-medium inline-flex items-center gap-0.5 justify-end tnum w-14 ${up ? 'text-destructive' : 'text-success'}`}>
        <TrendingUp size={13} className={up ? '' : 'rotate-180'} aria-hidden />
        {up ? '+' : ''}{Math.round(d.trend_7d * 100)}%
      </span>
    </div>
  );
}

export default function GovernmentPage() {
  const { data: run, isLoading, isError, refetch } = useLatestRun();
  const sendMessage = useCopilotStore((s) => s.sendMessage);
  const [railOpen, setRailOpen] = useState(true);

  const districts = run?.hotspot_districts || [];
  const band = getAqiBand(run?.max_pm25);

  const handleReport = () => {
    sendMessage('Generate a district report based on the latest forecast.');
    toast.success('Asked Copilot to draft a district report', { description: 'Follow the stream in Copilot.' });
  };

  const railBody = (
    <>
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">District impact</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Estimated crop-fire contribution to Delhi-NCR PM2.5</p>
        </div>
        <Button size="sm" onClick={handleReport}>
          <FileText size={14} aria-hidden /> Report
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-4">
        <Stat
          label="Peak PM2.5"
          icon={Wind}
          value={run?.max_pm25}
          unit="µg/m³"
          animate
          loading={isLoading}
          valueColor={run ? getAqiColor(run.max_pm25) : undefined}
          sub={run ? `${run.max_pm25_p10}–${run.max_pm25_p90} · ${band?.label}` : null}
        />
        <Stat
          label="Crop-fire share"
          icon={Factory}
          value={run ? `${Math.round(run.delhi_fire_share_p50 * 100)}%` : undefined}
          tone="text-primary"
          loading={isLoading}
          sub={run ? formatShare(run.delhi_fire_share_p50, run.delhi_fire_share_p10, run.delhi_fire_share_p90) : null}
        />
      </div>

      <div className="flex-1 px-5 pb-5 min-h-0">
        <div className="pt-card overflow-hidden flex flex-col">
          <div className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
            <span>#</span><span>District · fire share</span><span className="text-right">Trend 7d</span>
          </div>
          {isError ? (
            <ErrorState description="Couldn't load the latest run." onRetry={refetch} />
          ) : isLoading ? (
            <SkeletonRows rows={5} rowClassName="border-b border-border/40" />
          ) : districts.length === 0 ? (
            <EmptyState title="No district data" description="This run has no attributed hotspot districts." />
          ) : (
            districts.map((d, i) => <DistrictRow key={d.district} d={d} rank={i + 1} />)
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          Estimates are model-based with a p10–p90 range — not a verdict. Source: FIRMS · GFS · OpenAQ.
        </p>
      </div>
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      {/* Left rail (side on lg+, collapsible panel below lg) */}
      <aside className="lg:w-[380px] lg:min-w-[340px] border-b lg:border-b-0 lg:border-r border-border flex flex-col lg:overflow-auto shrink-0">
        {/* mobile collapse toggle */}
        <button
          className="lg:hidden flex items-center justify-between px-5 py-3 text-sm font-semibold"
          onClick={() => setRailOpen((v) => !v)}
          aria-expanded={railOpen}
        >
          District impact
          <ChevronDown size={18} className={`transition-transform ${railOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <div className={`${railOpen ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-h-0`}>{railBody}</div>
      </aside>

      {/* Map */}
      <div className="flex-1 relative flex flex-col min-h-0">
        <div className="flex-1 relative min-h-[380px] lg:min-h-0">
          <PlumeMap districtData={null} fireData={null} />
          <div className="absolute top-4 right-4 z-10">
            <AqiLegend />
          </div>
          <div className="absolute top-4 left-4 z-10">
            <Badge tone="brand" className="pt-glass border-0">
              Forecast · PM2.5
            </Badge>
          </div>
        </div>
        <div className="p-4 border-t border-border shrink-0 bg-background/40">
          <TimeSlider />
        </div>
      </div>
    </div>
  );
}
