"use client";

import { useEffect, useState } from "react";
import { bandHigherIsBetter, STATUS_DOT } from "@/lib/kpiStatus";
import type { ResponseSlaTrend } from "@/lib/services/serviceDeskHealth";
import { Modal } from "@/components/shared/Modal";

// Colored against the trend's own greenPct/yellowPct (the live,
// admin-editable KpiSettings bands), not a hardcoded 80/60 like the
// Health/Tech Score trends — Response SLA already has its own tunable
// threshold, and a bar here should mean the same thing the live
// Response SLA tile already means for the same percentage.
function dayBarClass(pct: number | null, greenPct: number, yellowPct: number): string {
  if (pct === null) return "bg-border-strong";
  return STATUS_DOT[bandHigherIsBetter(pct, greenPct, yellowPct)];
}

function Bars({ trend }: { trend: ResponseSlaTrend }) {
  return (
    <div className="flex items-end gap-1">
      {trend.days.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-data text-[9px] text-text-faint">{d.pct !== null ? Math.round(d.pct) : "—"}</span>
          <div
            className="relative flex h-24 w-full items-end overflow-hidden rounded-sm bg-panel-raised"
            title={d.pct !== null ? `${d.label}: ${Math.round(d.pct)}%` : `${d.label}: no history yet`}
          >
            <div
              className={`w-full rounded-sm ${dayBarClass(d.pct, trend.greenPct, trend.yellowPct)}`}
              style={{ height: `${d.pct ?? 6}%`, minHeight: d.pct === null ? "6%" : undefined }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResponseSlaTrendModal({ onClose }: { onClose: () => void }) {
  const [trend, setTrend] = useState<ResponseSlaTrend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/service-desk/response-sla-trend")
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
    <Modal title="Response SLA Trend" subtitle="Daily response SLA %, last 30 days" onClose={onClose} maxWidthClassName="max-w-2xl">
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
              <Bars trend={trend} />
            </div>
          </div>
          <div className="font-data text-[11px] text-text-faint">
            Green at or above {trend.greenPct}%, yellow at or above {trend.yellowPct}% — same bands as the live
            Response SLA tile (editable on /admin). Gray bars mean no history was recorded that day; this table
            only started tracking recently, so history builds up going forward rather than being backfilled.
          </div>
        </>
      )}
    </Modal>
  );
}
