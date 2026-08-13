"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { bandHigherIsBetter, STATUS_DOT } from "@/lib/kpiStatus";
import type { TechScoreTrend } from "@/lib/services/techPerformanceScore";

// Same 80/60 bands TechScoreBadge.tsx's own scoreColor uses. Port of
// HealthScoreTrendModal's Bars pattern (components/service-desk/), per
// technician instead of org-wide.
function dayBarClass(score: number | null): string {
  if (score === null) return "bg-border-strong";
  return STATUS_DOT[bandHigherIsBetter(score, 80, 60)];
}

function Bars({ days }: { days: TechScoreTrend["days"] }) {
  return (
    <div className="flex items-end gap-1">
      {days.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-data text-[9px] text-text-faint">{d.score ?? "—"}</span>
          <div
            className="relative flex h-24 w-full items-end overflow-hidden rounded-sm bg-panel-raised"
            title={d.score !== null ? `${d.label}: ${d.score}/100` : `${d.label}: no history yet`}
          >
            <div
              className={`w-full rounded-sm ${dayBarClass(d.score)}`}
              style={{ height: `${d.score ?? 6}%`, minHeight: d.score === null ? "6%" : undefined }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TechScoreTrendModal({ person, onClose }: { person: string; onClose: () => void }) {
  const [trend, setTrend] = useState<TechScoreTrend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tech-performance/score-trend?person=${encodeURIComponent(person)}`)
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
  }, [person]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-border bg-panel p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-base font-semibold text-text">{person} — Performance Score Trend</div>
            <div className="mt-0.5 font-data text-[11px] text-text-faint">Daily performance score, last 30 days</div>
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
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <Bars days={trend.days} />
              </div>
            </div>
            <div className="font-data text-[11px] text-text-faint">
              Gray bars mean no history was recorded that day — this table only started tracking recently, so
              history builds up going forward rather than being backfilled.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
