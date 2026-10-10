/**
 * OWNER    : Tanmay
 * DUE      : D1 20:00
 * TASK     :
 *   0–72 h slider with play/pause, IST labels, drives timeStore.
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import { useEffect, useRef } from 'react';
import { useTimeStore } from '../../stores/timeStore';
import { formatIst } from '../../lib/format';
import { Play, Pause } from 'lucide-react';
import { Kbd } from '../ui/Kbd';

const TICKS = [0, 12, 24, 36, 48, 60, 72];

export default function TimeSlider() {
  const { leadH, setLeadH, playing, setPlaying, speed, getValidHour } = useTimeStore();
  const validHour = getValidHour();
  const validHourIst = validHour ? formatIst(validHour) : '';
  const timerRef = useRef(null);

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setLeadH((prev) => (prev >= 72 ? 0 : prev + speed));
      }, 500);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [playing, speed, setLeadH]);

  const pct = (leadH / 72) * 100;

  return (
    <div className="pt-glass rounded-[var(--radius-lg)] p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Forecast time</span>
          <span className="text-xs text-foreground tnum">{validHourIst || `+${leadH} h`}</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Kbd>←</Kbd><Kbd>→</Kbd> step
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause animation' : 'Play animation'}
          className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary-strong transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </button>

        <div className="relative flex-1">
          <input
            type="range"
            min="0"
            max="72"
            step="1"
            value={leadH}
            onChange={(e) => setLeadH(parseInt(e.target.value, 10))}
            aria-label="Forecast lead time in hours"
            aria-valuetext={`${leadH} hours ahead${validHourIst ? `, ${validHourIst}` : ''}`}
            className="pt-range w-full"
            style={{ '--pct': `${pct}%` }}
          />
          <div className="flex justify-between mt-1 px-0.5">
            {TICKS.map((t) => (
              <span key={t} className="text-[9px] text-muted-foreground tnum">+{t}</span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .pt-range { -webkit-appearance:none; appearance:none; height:6px; border-radius:9999px;
          background: linear-gradient(90deg, var(--color-primary) var(--pct), var(--color-muted) var(--pct)); cursor:pointer; }
        .pt-range:focus-visible { outline:2px solid var(--color-ring); outline-offset:3px; }
        .pt-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:16px; height:16px; border-radius:9999px;
          background:#fff; border:3px solid var(--color-primary); box-shadow:0 2px 6px rgba(0,0,0,.4); margin-top:0; }
        .pt-range::-moz-range-thumb { width:14px; height:14px; border-radius:9999px; background:#fff; border:3px solid var(--color-primary); box-shadow:0 2px 6px rgba(0,0,0,.4); }
      `}</style>
    </div>
  );
}
