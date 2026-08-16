"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { LaborMonthlyTrendModal, type LaborMonthlyPoint } from "./LaborMonthlyTrendModal";

function money2(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Managed Essential IT (the Service agreement line, see
// categorizeAgreementItem) ÷ trailing 3-month average hours — what the
// business is effectively getting paid per hour of work on this
// client's fixed-fee agreement. No inherent "good" direction here (that
// depends on the business's own cost target), so the trend bars stay a
// neutral color rather than red/green.
export function EffectiveHourlyRateTile({ trend }: { trend: LaborMonthlyPoint[] }) {
  const [open, setOpen] = useState(false);
  const current = trend[trend.length - 1] ?? null;

  return (
    <>
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-panel p-3">
        <div className="flex items-center justify-between gap-1.5">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Effective Hourly Rate</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Effective Hourly Rate trend"
            className="text-text-faint hover:text-text"
          >
            <TrendingUp size={13} />
          </button>
        </div>
        <div className="font-display text-xl font-semibold text-text">
          {current?.value !== null && current?.value !== undefined ? `${money2(current.value)}/hr` : "—"}
        </div>
        <div className="font-data text-[11px] text-text-faint">
          Managed Essential IT ÷ trailing 3-mo avg hours
        </div>
      </div>
      {open && (
        <LaborMonthlyTrendModal
          title="Effective Hourly Rate Trend"
          points={trend}
          formatValue={(v) => `${money2(v)}/hr`}
          footnote="Managed Essential IT (the Service agreement line) ÷ that month's trailing 3-month average logged hours. Only starts from whenever this was first synced — HaloPSA has no record of what a line item cost in the past, so history builds up going forward, never backfilled."
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
