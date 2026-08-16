"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { LaborMonthlyTrendModal, type LaborMonthlyPoint } from "./LaborMonthlyTrendModal";

function money(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Managed Essential IT revenue minus service cost (hours × the admin-set
// KpiSettings.laborHourlyRate, shown in Admin Settings as "Service
// hourly rate") — is this fixed-fee client actually profitable once
// real hours worked are weighed against the flat monthly fee, distinct
// from Financials' own net profit (which nets the *whole* QuickBooks
// invoice against QuickBooks-item cost, not just the service line
// specifically). Was called "Labor Profit" until the business renamed
// this to "Service" for clarity against the separate "Product Profit"
// (see ProductProfitDetailModal) covering the resold-product categories.
export function ServiceProfitTile({ trend }: { trend: LaborMonthlyPoint[] }) {
  const [open, setOpen] = useState(false);
  const current = trend[trend.length - 1] ?? null;
  const value = current?.value ?? null;

  return (
    <>
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-panel p-3">
        <div className="flex items-center justify-between gap-1.5">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Service Profit</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Service Profit trend"
            className="text-text-faint hover:text-text"
          >
            <TrendingUp size={13} />
          </button>
        </div>
        <div
          className={`font-display text-xl font-semibold ${
            value === null ? "text-text" : value >= 0 ? "text-status-ok" : "text-status-critical"
          }`}
        >
          {value !== null ? money(value) : "—"}
        </div>
        <div className="font-data text-[11px] text-text-faint">Managed Essential IT − hours × service rate</div>
      </div>
      {open && (
        <LaborMonthlyTrendModal
          title="Service Profit Trend"
          points={trend}
          formatValue={(v) => money(v)}
          positiveIsGood
          footnote="Managed Essential IT (the Service agreement line) minus that month's hours logged × the service hourly rate in effect at the time (Admin Settings) — frozen per month, so a later rate change doesn't rewrite past months. Only starts from whenever this was first synced; history builds up going forward, never backfilled."
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
