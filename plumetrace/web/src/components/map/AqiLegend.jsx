/**
 * OWNER    : Tanmay
 * DUE      : D1 16:00
 * TASK     :
 *   Legend from lib/aqi.js.
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import { AQI_BANDS } from '../../lib/aqi';

export default function AqiLegend() {
  return (
    <div className="pt-glass rounded-[var(--radius-lg)] p-3.5 text-sm w-[13.5rem] shadow-xl">
      <div className="font-semibold mb-2.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        AQI · PM2.5 <span className="normal-case tracking-normal">(µg/m³)</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {AQI_BANDS.map((band) => (
          <div key={band.label} className="flex items-center gap-2.5">
            <span
              className="w-3.5 h-3.5 rounded-[4px] shrink-0 ring-1 ring-inset ring-foreground/15"
              style={{ backgroundColor: band.color }}
            />
            <span className="text-muted-foreground tabular-nums w-14 text-[11px]">
              {band.min}–{band.max === 9999 ? '+' : band.max}
            </span>
            <span className="text-[11px] font-medium">{band.label}</span>
          </div>
        ))}
        {/* no-data treatment, matching the faint slate fill used on the map */}
        <div className="flex items-center gap-2.5 pt-1.5 mt-1 border-t border-border/60">
          <span className="w-3.5 h-3.5 rounded-[4px] shrink-0 ring-1 ring-inset ring-foreground/15 bg-muted-foreground/40" />
          <span className="text-[11px] text-muted-foreground">No data</span>
        </div>
      </div>
    </div>
  );
}
