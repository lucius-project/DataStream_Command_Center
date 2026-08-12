"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { bandHigherIsBetter, STATUS_DOT } from "@/lib/kpiStatus";
import type { CallAnswerRateTrend } from "@/lib/services/callActivity";

// Same 90/80 bands as kpiAnswerRate in businessHealth.ts — reused here so
// a month's bar color means the same thing the KPI tile's dot already
// means. STATUS_DOT's bg-* tokens double as bar-fill classes; no new
// color scale invented for this modal.
function monthBarClass(pct: number | null): string {
  if (pct === null) return "bg-border-strong";
  return STATUS_DOT[bandHigherIsBetter(pct, 90, 80)];
}

function Bars({ monthly }: { monthly: CallAnswerRateTrend["monthly"] }) {
  return (
    <div className="flex items-end gap-2">
      {monthly.map((m) => (
        <div key={m.yearMonth} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-data text-[10px] text-text-faint">{m.answerRatePct ?? "—"}</span>
          <div
            className="relative flex h-24 w-full items-end overflow-hidden rounded-sm bg-panel-raised"
            title={
              m.totalCalls > 0
                ? `${m.label}: ${m.answerRatePct}% answered (${m.totalCalls - m.missedCalls} of ${m.totalCalls})`
                : `${m.label}: no calls synced`
            }
          >
            <div
              className={`w-full rounded-sm ${monthBarClass(m.answerRatePct)}`}
              style={{ height: `${m.answerRatePct ?? 6}%`, minHeight: m.answerRatePct === null ? "6%" : undefined }}
            />
          </div>
          <span className="font-data text-[9px] text-text-faint">{m.label.split(" ")[0]}</span>
        </div>
      ))}
    </div>
  );
}

export function AnswerRateTrendModal({ onClose }: { onClose: () => void }) {
  const [trend, setTrend] = useState<CallAnswerRateTrend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/business-health/call-trend")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setTrend(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trend data.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-border bg-panel p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-base font-semibold text-text">Call Answer Rate Trend</div>
            <div className="mt-0.5 font-data text-[11px] text-text-faint">
              Real-time rolling 30 days, then month-by-month for the last 12 months
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

        {error && (
          <div className="rounded-md border border-status-critical/40 bg-status-critical-dim px-3 py-2 text-sm text-status-critical">
            {error}
          </div>
        )}

        {!error && !trend && <div className="py-8 text-center text-sm text-text-muted">Loading…</div>}

        {trend && (
          <>
            <div className="rounded-md border border-border bg-panel-raised p-3">
              <div className="font-data text-[10px] tracking-wide text-text-faint uppercase">Rolling 30 days</div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="font-display text-2xl font-semibold text-text">
                  {trend.rolling30.answerRatePct !== null ? `${trend.rolling30.answerRatePct}%` : "—"}
                </div>
                <div className="font-data text-xs text-text-faint">
                  {trend.rolling30.totalCalls > 0
                    ? `${trend.rolling30.totalCalls - trend.rolling30.missedCalls} of ${trend.rolling30.totalCalls} calls answered`
                    : "No calls in the last 30 days"}
                </div>
              </div>
            </div>

            <div>
              <div className="font-data text-[10px] tracking-wide text-text-faint uppercase">
                Month by month (last 12 months)
              </div>
              <div className="mt-2 overflow-x-auto">
                <div className="min-w-[560px]">
                  <Bars monthly={trend.monthly} />
                </div>
              </div>
              <div className="mt-2 font-data text-[11px] text-text-faint">
                Gray bars mean no calls were synced that month — United Cloud only started tracking recently, so
                history builds up going forward rather than being backfilled.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
