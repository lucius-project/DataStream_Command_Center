"use client";

import { useState } from "react";
import { X, TrendingUp } from "lucide-react";
import type { TechPerformanceScoreResult } from "@/lib/services/techPerformanceScore";
import type { KpiTrend } from "@/lib/services/businessHealth";
import { TechScoreTrendModal } from "./TechScoreTrendModal";

function scoreColor(score: number | null): string {
  if (score === null) return "text-text-faint";
  if (score >= 80) return "text-status-ok";
  if (score >= 60) return "text-status-warn";
  return "text-status-critical";
}

// Same arrow glyph/color logic as KpiTile.tsx / HealthScoreTile.tsx —
// rendered inline rather than routed through the Kpi type, same reason.
const TREND_ARROW = { up: "↑", down: "↓", flat: "→" } as const;

function trendColorClass(trend: KpiTrend): string {
  if (trend.direction === "flat") return "text-text-faint";
  return trend.direction === trend.goodDirection ? "text-status-ok" : "text-status-critical";
}

// Compact per-tech version of Service Desk Health's HealthScoreTile —
// same "never display a mystery score" rule and same "trend button is a
// true sibling, not nested inside the breakdown button" structure (see
// HealthScoreTile.tsx's own comment on why the outer element is a plain
// div rather than the button itself).
export function TechScoreBadge({
  person,
  result,
  trend,
}: {
  person: string;
  result: TechPerformanceScoreResult;
  trend?: KpiTrend;
}) {
  const [open, setOpen] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);

  return (
    <>
      <div className="group relative flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-baseline gap-1 rounded border border-border-strong py-1 pr-5 pl-2 hover:border-accent"
        >
          <span className={`font-display text-sm font-semibold ${scoreColor(result.score)}`}>
            {result.score !== null ? result.score : "—"}
          </span>
          <span className="font-data text-[10px] text-text-faint">/100</span>
          {trend && (
            <span className={`font-data text-[10px] font-medium ${trendColorClass(trend)}`}>
              {TREND_ARROW[trend.direction]}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-label={`View ${person}'s performance score trend`}
          onClick={() => setTrendOpen(true)}
          className="absolute right-1 rounded p-0.5 text-text-faint hover:bg-panel-raised hover:text-text"
        >
          <TrendingUp size={11} />
        </button>
      </div>

      {trendOpen && <TechScoreTrendModal person={person} onClose={() => setTrendOpen(false)} />}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60" />
          <div className="relative flex w-full max-w-lg flex-col gap-4 rounded-lg border border-border bg-panel p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-base font-semibold text-text">{person} — Performance Score</div>
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
              Weights rebalance proportionally when a category has no data yet — an unavailable category (e.g. Quality,
              Phone — see below) is excluded, not scored as zero.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
