"use client";

import { useState } from "react";
import { X, TrendingUp } from "lucide-react";
import type { HealthScoreResult } from "@/lib/services/serviceDeskHealth";
import type { KpiTrend } from "@/lib/services/businessHealth";
import { HealthScoreTrendModal } from "./HealthScoreTrendModal";

function scoreColor(score: number | null): string {
  if (score === null) return "text-text-faint";
  if (score >= 80) return "text-status-ok";
  if (score >= 60) return "text-status-warn";
  return "text-status-critical";
}

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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" />
          <div className="relative flex w-full max-w-lg flex-col gap-4 rounded-lg border border-border bg-panel p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-base font-semibold text-text">Service Desk Health — Breakdown</div>
                <div className="mt-0.5 font-data text-[11px] text-text-faint">
                  Weighted composite, {result.score !== null ? `${result.score}/100` : "unavailable"}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-text-faint hover:bg-panel-raised hover:text-text"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {result.categories.map((c) => (
                <div key={c.key} className="rounded-md border border-border bg-panel-raised p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-sm font-medium text-text">{c.label}</span>
                    <span className={`font-data text-sm font-semibold ${scoreColor(c.score)}`}>
                      {c.score !== null ? `${c.score}/100` : "—"}
                      <span className="ml-1 text-[11px] font-normal text-text-faint">· {c.weightPct}% weight</span>
                    </span>
                  </div>
                  <div className="mt-1 font-data text-[11px] text-text-faint">{c.detail}</div>
                </div>
              ))}
            </div>

            <div className="font-data text-[11px] text-text-faint">
              Weights rebalance proportionally when a category has no data yet (e.g. no calls today) — an unavailable
              category is excluded, not scored as zero.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
