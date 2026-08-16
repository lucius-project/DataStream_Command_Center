"use client";

import { useEffect, useState } from "react";
import { bandHigherIsBetter, STATUS_DOT } from "@/lib/kpiStatus";
import type { ServiceDeskHealthTrend } from "@/lib/services/serviceDeskHealth";
import { Modal } from "@/components/shared/Modal";

// Same 80/60 bands HealthScoreBreakdownModal.tsx's own scoreColor uses —
// same pattern TechScoreTrendModal.tsx ports for the per-technician
// trend, just org-wide here.
function dayBarClass(score: number | null): string {
  if (score === null) return "bg-border-strong";
  return STATUS_DOT[bandHigherIsBetter(score, 80, 60)];
}

function Bars({ days }: { days: ServiceDeskHealthTrend["days"] }) {
  return (
    <div className="flex items-end gap-1">
      {days.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-data text-[9px] text-text-faint">{d.healthScore ?? "—"}</span>
          <div
            className="relative flex h-24 w-full items-end overflow-hidden rounded-sm bg-panel-raised"
            title={d.healthScore !== null ? `${d.label}: ${d.healthScore}%` : `${d.label}: no history yet`}
          >
            <div
              className={`w-full rounded-sm ${dayBarClass(d.healthScore)}`}
              style={{ height: `${d.healthScore ?? 6}%`, minHeight: d.healthScore === null ? "6%" : undefined }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HealthScoreTrendModal({ onClose }: { onClose: () => void }) {
  const [trend, setTrend] = useState<ServiceDeskHealthTrend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/service-desk/health-trend")
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
    <Modal title="Service Desk Health Trend" subtitle="Daily health score, last 30 days" onClose={onClose} maxWidthClassName="max-w-2xl">
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
    </Modal>
  );
}
