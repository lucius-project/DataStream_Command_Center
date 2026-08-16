"use client";

import { useEffect, useState } from "react";
import { bandHigherIsBetter, STATUS_DOT } from "@/lib/kpiStatus";
import type { PhoneAnswerTrend } from "@/lib/services/serviceDeskHealth";
import { Modal } from "@/components/shared/Modal";

// Colored against the trend's own greenPct/yellowPct — the fixed 99/97
// executive band (PHONE_ANSWER_GREEN_PCT/YELLOW_PCT, serviceDeskHealth.ts),
// not the live, admin-editable Call Answer Rate KPI threshold. Same
// reasoning the tile itself already follows: this line must read the
// same regardless of how that other setting is retuned.
function dayBarClass(pct: number | null, greenPct: number, yellowPct: number): string {
  if (pct === null) return "bg-border-strong";
  return STATUS_DOT[bandHigherIsBetter(pct, greenPct, yellowPct)];
}

function Bars({ trend }: { trend: PhoneAnswerTrend }) {
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

export function PhoneAnswerTrendModal({ onClose }: { onClose: () => void }) {
  const [trend, setTrend] = useState<PhoneAnswerTrend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/service-desk/phone-answer-trend")
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
    <Modal title="Phone Answer Trend" subtitle="Daily inbound answer %, last 30 days" onClose={onClose} maxWidthClassName="max-w-2xl">
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
            Green at or above {trend.greenPct}%, yellow at or above {trend.yellowPct}% — a fixed executive bar,
            deliberately stricter than (and independent from) the admin-editable Call Answer Rate KPI threshold on
            the main dashboard. Gray bars mean no history was recorded that day; this table only started tracking
            recently, so history builds up going forward rather than being backfilled.
          </div>
        </>
      )}
    </Modal>
  );
}
