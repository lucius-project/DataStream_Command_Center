// Small presentational pieces shared between TechPerformanceRow (one
// per tech) and TechOrgSummaryRow (the all-techs rollup) — same visual
// vocabulary for both so the summary reads as "the same shape, totaled."

import type { TechStatus } from "@/lib/services/techPerformance";

export function Stat({ value, label, tone }: { value: number | string; label: string; tone?: "warn" | "critical" }) {
  const toneClass = tone === "critical" ? "text-status-critical" : tone === "warn" ? "text-status-warn" : "text-text";
  return (
    <span>
      {/* text-muted, not text-faint — this label is what makes the
          adjacent number meaningful ("5 open" vs. just "5"), not a
          decorative caption, and text-faint fails WCAG AA contrast. */}
      <span className={toneClass}>{value}</span> <span className="text-text-muted">{label}</span>
    </span>
  );
}

// Small uppercase group header, matching KpiTile's label style
// (components/business-health/KpiTile.tsx) for the same visual
// vocabulary across pages. A real heading (not just styled text) so
// screen-reader heading-navigation can jump between a tech card's
// Tickets/Calls/Service/etc. sub-sections, same reasoning as promoting
// each tech's own name to a heading in TechPerformanceRow.
export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="font-data text-[10px] tracking-wide text-text-muted uppercase">{children}</h4>;
}

const STATUS_PILL_CLASS: Record<TechStatus, string> = {
  green: "border-status-ok/40 bg-status-ok-dim text-status-ok",
  yellow: "border-status-warn/40 bg-status-warn-dim text-status-warn",
  red: "border-status-critical/40 bg-status-critical-dim text-status-critical",
};

const STATUS_LABEL: Record<TechStatus, string> = {
  green: "On track",
  yellow: "Needs attention",
  red: "Falling behind",
};

export function StatusPill({ status }: { status: TechStatus }) {
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 font-data text-[10px] font-semibold tracking-wide uppercase ${STATUS_PILL_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKDAY_FULL_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Flat daily timesheet threshold — all time entries (client tickets and
// internal/non-billable ones alike; nothing filters those out in
// computeWeeklyHoursByTech) count toward this, not just billable client
// work. A day at or above this is green, below is red.
const DAILY_HOURS_THRESHOLD = 6;

// dailyHours is always Mon-Fri order (see getTechPerformance) — no Date
// objects involved here, so no timezone/hydration risk pairing it with a
// fixed label array. `todayIndex` (0=Mon..4=Fri, see todayWeekdayIndex in
// dateUtils.ts) marks which days have actually happened — a day that
// hasn't arrived yet shows 0h because there's nothing to log, not
// because the tech is behind, so it renders neutral instead of red.
// `indent` aligns it under a leading rank badge on a per-tech row
// (default) — the org summary row has no rank badge, so it passes
// indent={false} to sit flush left instead.
export function DailyHoursBars({
  dailyHours,
  todayIndex,
  indent = true,
}: {
  dailyHours: number[];
  todayIndex: number;
  indent?: boolean;
}) {
  const max = Math.max(DAILY_HOURS_THRESHOLD, ...dailyHours, 1);
  const thresholdPct = Math.min(100, (DAILY_HOURS_THRESHOLD / max) * 100);

  return (
    <div className={`mt-2.5 flex items-end gap-2.5 ${indent ? "pl-9" : ""}`}>
      {WEEKDAY_LABELS.map((label, i) => {
        const hours = dailyHours[i] ?? 0;
        const heightPct = Math.min(100, (hours / max) * 100);
        const isFuture = i > todayIndex;
        const barClass = isFuture
          ? "bg-border-strong"
          : hours >= DAILY_HOURS_THRESHOLD
            ? "bg-status-ok"
            : "bg-status-critical";
        const fullLabel = WEEKDAY_FULL_LABELS[i];
        const statusWord = isFuture ? "not yet due" : hours >= DAILY_HOURS_THRESHOLD ? "met threshold" : "below threshold";
        return (
          <div key={label} className="flex flex-col items-center gap-1" title={`${label}: ${hours}h`}>
            <div className="relative flex h-9 w-3.5 items-end overflow-hidden rounded-sm bg-panel-raised">
              <div
                className="absolute inset-x-0 border-t border-dashed border-border-strong"
                style={{ bottom: `${thresholdPct}%` }}
              />
              <div className={`w-full rounded-sm ${barClass}`} style={{ height: `${heightPct}%` }} />
              {/* The bar's pass/fail color is otherwise the only signal —
                  this gives screen readers (and anyone else who can't
                  rely on the hover-only title tooltip) the same info in
                  words, without changing anything visually. */}
              <span className="sr-only">
                {fullLabel}: {hours} hours — {statusWord}
              </span>
            </div>
            <span className="font-data text-[9px] text-text-faint">{label[0]}</span>
          </div>
        );
      })}
    </div>
  );
}
