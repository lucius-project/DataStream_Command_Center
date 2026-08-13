"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import type { HealthScoreResult } from "@/lib/services/serviceDeskHealth";
import type { KpiTrend } from "@/lib/services/businessHealth";
import { HealthScoreTrendModal } from "./HealthScoreTrendModal";
import { HealthScoreBreakdownModal, scoreColor } from "./HealthScoreBreakdownModal";

// Same arrow glyph/color logic as KpiTile.tsx — Health Score isn't
// Kpi-shaped (it's a dedicated component for visual prominence, not the
// generic tile), so this is rendered inline rather than routed through
// the Kpi type, but the rule is identical.
const TREND_ARROW = { up: "↑", down: "↓", flat: "→" } as const;

function trendColorClass(trend: KpiTrend): string {
  if (trend.direction === "flat") return "text-text-faint";
  return trend.direction === trend.goodDirection ? "text-status-ok" : "text-status-critical";
}

// "Never display a mystery score" — the breakdown-opening button covers
// the whole tile except a small trend-icon button in the corner (a true
// sibling, not nested inside it — same "no interactive-inside-interactive"
// reasoning as AnswerRateTile.tsx, which is why the outer element here is
// a plain div rather than the button itself).
export function HealthScoreTile({ result, trend }: { result: HealthScoreResult; trend?: KpiTrend }) {
  const [open, setOpen] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);

  return (
    <>
      <div className="group relative rounded-lg border border-border bg-panel hover:border-accent">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full flex-col justify-between p-4 pr-9 text-left"
        >
          <div className="flex items-center justify-between">
            <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Service Desk Health</span>
            <span className="font-data text-[10px] text-text-faint underline">breakdown</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <div className={`font-display text-3xl font-semibold ${scoreColor(result.score)}`}>
              {result.score !== null ? `${result.score}/100` : "—"}
            </div>
            {trend && (
              <span className={`font-data text-[11px] font-medium ${trendColorClass(trend)}`}>
                {TREND_ARROW[trend.direction]} {trend.changeLabel}
              </span>
            )}
          </div>
          <div className="mt-2 font-data text-xs text-text-faint">
            {result.categories.filter((c) => c.score !== null).length} of {result.categories.length} categories scored
          </div>
        </button>

        <button
          type="button"
          aria-label="View health score trend"
          onClick={() => setTrendOpen(true)}
          className="absolute top-3 right-3 rounded p-1 text-text-faint hover:bg-panel-raised hover:text-text"
        >
          <TrendingUp size={13} />
        </button>
      </div>

      {trendOpen && <HealthScoreTrendModal onClose={() => setTrendOpen(false)} />}
      {open && <HealthScoreBreakdownModal result={result} onClose={() => setOpen(false)} />}
    </>
  );
}
