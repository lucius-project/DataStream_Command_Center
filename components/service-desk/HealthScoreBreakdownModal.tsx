"use client";

import { X } from "lucide-react";
import type { HealthScoreResult } from "@/lib/services/serviceDeskHealth";

export function scoreColor(score: number | null): string {
  if (score === null) return "text-text-faint";
  if (score >= 80) return "text-status-ok";
  if (score >= 60) return "text-status-warn";
  return "text-status-critical";
}

// Same 80/60 thresholds as scoreColor, as an explicit word rather than
// relying on color alone — color-blind-safe, and answers "good or bad"
// at a glance without doing the 80/60 math in your head.
function scoreStatusLabel(score: number | null): string {
  if (score === null) return "No data";
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Watch";
  return "Needs Attention";
}

function scoreStatusPillClass(score: number | null): string {
  if (score === null) return "border-border-strong bg-panel-raised text-text-faint";
  if (score >= 80) return "border-status-ok/40 bg-status-ok-dim text-status-ok";
  if (score >= 60) return "border-status-warn/40 bg-status-warn-dim text-status-warn";
  return "border-status-critical/40 bg-status-critical-dim text-status-critical";
}

// Each category's exact contribution to the 100-point score is
// weightPct% of its own score (see computeHealthScore, serviceDeskHealth.ts —
// score = sum(category.score * category.weightPct / 100)), so "points
// lost" from a category is just that same formula run against what it's
// missing out of 100. This is arithmetic on already-computed numbers,
// not a new calculation — same "AI never calculates core KPIs" rule,
// just applied one level deeper (explaining a number, not inventing one).
function pointsLost(score: number, weightPct: number): number {
  return Math.round(((weightPct * (100 - score)) / 100) * 10) / 10;
}

// Shared breakdown modal — used by both HealthScoreTile.tsx (the main
// Service Desk Health tile on the KPI grid) and MorningBriefCard.tsx's
// Service Health tile. Same content either place: "never display a
// mystery score" means clicking either tile has to lead here, not two
// different explanations of the same number.
export function HealthScoreBreakdownModal({ result, onClose }: { result: HealthScoreResult; onClose: () => void }) {
  // The category costing the score the most points, if any — null when
  // the score is already 100 (nothing to blame) or unavailable.
  const biggestDrag = result.categories
    .filter((c): c is typeof c & { score: number } => c.score !== null)
    .map((c) => ({ ...c, lost: pointsLost(c.score, c.weightPct) }))
    .sort((a, b) => b.lost - a.lost)[0];
  const hasDrag = biggestDrag && biggestDrag.lost > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
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
            onClick={onClose}
            className="rounded p-1 text-text-faint hover:bg-panel-raised hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="font-data text-[11px] text-text-faint">
          A single weighted score combining Responsiveness, Resolution, Workload, and Phone into one number — the
          answer to &quot;how&apos;s the team doing right now,&quot; before drilling into any one category. 80+ is
          Healthy, 60-79 is Watch, below 60 is Needs Attention.
        </div>

        {result.score !== null && (
          <div
            className={`rounded-md border p-2.5 text-sm ${
              hasDrag
                ? "border-status-warn/40 bg-status-warn-dim text-status-warn"
                : "border-status-ok/40 bg-status-ok-dim text-status-ok"
            }`}
          >
            {hasDrag
              ? `${biggestDrag.label} is the biggest drag on today's score — costing about ${biggestDrag.lost} of the ${100 - result.score} missing point${100 - result.score === 1 ? "" : "s"}.`
              : "Every scored category is Healthy — nothing is dragging today's score down."}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {result.categories.map((c) => (
            <div key={c.key} className="rounded-md border border-border bg-panel-raised p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-medium text-text">{c.label}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-data text-[10px] font-semibold tracking-wide uppercase ${scoreStatusPillClass(c.score)}`}
                >
                  {scoreStatusLabel(c.score)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-data text-[11px] text-text-faint">{c.detail}</span>
                <span className={`shrink-0 font-data text-sm font-semibold ${scoreColor(c.score)}`}>
                  {c.score !== null ? `${c.score}/100` : "—"}
                  <span className="ml-1 text-[11px] font-normal text-text-faint">· {c.weightPct}% weight</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="font-data text-[11px] text-text-faint">
          Weights rebalance proportionally when a category has no data yet (e.g. no calls today) — an unavailable
          category is excluded, not scored as zero.
        </div>
      </div>
    </div>
  );
}
