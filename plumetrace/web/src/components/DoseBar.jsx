/**
 * OWNER    : Tanmay
 * DUE      : D2 12:00
 * TASK     :
 *   % of budget bar; >100 % red, before/after variant.
 * DONE WHEN: -
 * GUIDE    : docs/team/TANMAY.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 *
 * Track is scaled so 100 % of budget sits at ~72 % of the width, leaving room to
 * visualise over-budget doses up to ~140 %. A hairline marks the 100 % budget line.
 */
const FULL = 140; // % of budget mapped to the full track width

export default function DoseBar({ current = 0, proposed, limit = 100 }) {
  const toPct = (v) => Math.max(0, Math.min((v / FULL) * 100, 100));
  const budgetLine = (limit / FULL) * 100;
  const currentW = toPct(current);
  const proposedW = proposed !== undefined && proposed !== null ? toPct(proposed) : null;
  const currentOver = current > limit;
  const proposedOver = proposed > limit;

  return (
    <div className="relative w-full h-2.5 rounded-full bg-muted overflow-hidden">
      {/* proposed (after re-plan) — drawn behind, success tint */}
      {proposedW !== null && (
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${proposedOver ? 'bg-destructive/35' : 'bg-success/45'}`}
          style={{ width: `${proposedW}%` }}
          aria-hidden
        />
      )}
      {/* current dose */}
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[var(--ease-out)] ${
          currentOver ? 'bg-destructive' : 'bg-primary'
        }`}
        style={{ width: `${currentW}%` }}
      />
      {/* 100% budget line */}
      <div
        className="absolute inset-y-0 w-px bg-foreground/45"
        style={{ left: `${budgetLine}%` }}
        aria-hidden
        title="Budget (100%)"
      />
    </div>
  );
}
