"use client";

import { useState } from "react";
import Link from "next/link";
import { LaborMonthlyTrendModal, type LaborMonthlyPoint } from "@/components/companyProfile/LaborMonthlyTrendModal";
import { ProductProfitDetailModal } from "./ProductProfitDetailModal";
import type { AgreementCategoryGroup } from "@/lib/services/clientProfitability";

function money(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function unitMoney(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Service = the managed-IT labor line (Managed Essential IT, hours ×
// the admin-set rate). Product = every resold category combined (M365,
// Backup, Security, Other), each with real HaloPSA catalog cost. Named
// this way (was "Labor"/"Service") since it reads more accurately for
// an MSP: labor delivered is a service, licenses/backup/security tools
// are products with a real wholesale cost.
export type FinancialSummaryRow = {
  id: string;
  name: string;
  effectiveHourlyRate: number | null;
  serviceProfit: number;
  productProfit: number;
  totalProfit: number;
  effectiveRateTrend: LaborMonthlyPoint[];
  serviceProfitTrend: LaborMonthlyPoint[];
  agreementBreakdown: AgreementCategoryGroup[];
};

type OpenModal = { clientId: string; kind: "rate" | "service" | "product" | "total" } | null;

// Every number in the Financial Summary table is backed by a real list
// or trend a manager can drill into — same "never a bare number with
// nothing behind it" rule as DrilldownStat elsewhere in this app. One
// shared modal-open state for the whole table (keyed by client + which
// column) rather than per-row state, since only one popup is ever open
// at a time regardless of how many client rows exist.
export function FinancialSummaryTable({ rows }: { rows: FinancialSummaryRow[] }) {
  const [open, setOpen] = useState<OpenModal>(null);
  const activeRow = open ? rows.find((r) => r.id === open.clientId) : undefined;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-panel">
        <table className="w-full min-w-[560px] text-left font-data text-xs">
          <caption className="sr-only">Client financial summary, ranked by total profit</caption>
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th scope="col" className="py-1.5 pr-3 pl-3 font-normal">Client</th>
              <th scope="col" className="py-1.5 pr-3 font-normal">Hourly rate</th>
              <th scope="col" className="py-1.5 pr-3 font-normal">Service profit</th>
              <th scope="col" className="py-1.5 pr-3 font-normal">Product profit</th>
              <th scope="col" className="py-1.5 pr-3 font-normal">Total profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border hover:bg-panel-raised">
                <td className="py-1.5 pr-3 pl-3">
                  <Link href={`/clients/${row.id}`} className="text-text hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="py-1.5 pr-3">
                  <button
                    type="button"
                    onClick={() => setOpen({ clientId: row.id, kind: "rate" })}
                    className="text-text-muted hover:text-text hover:underline"
                  >
                    {row.effectiveHourlyRate !== null ? `${unitMoney(row.effectiveHourlyRate)}/hr` : "—"}
                  </button>
                </td>
                <td className="py-1.5 pr-3">
                  <button
                    type="button"
                    onClick={() => setOpen({ clientId: row.id, kind: "service" })}
                    className={`hover:underline ${row.serviceProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}
                  >
                    {money(row.serviceProfit)}
                  </button>
                </td>
                <td className="py-1.5 pr-3">
                  <button
                    type="button"
                    onClick={() => setOpen({ clientId: row.id, kind: "product" })}
                    className={`hover:underline ${row.productProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}
                  >
                    {money(row.productProfit)}
                  </button>
                </td>
                <td className="py-1.5 pr-3">
                  <button
                    type="button"
                    onClick={() => setOpen({ clientId: row.id, kind: "total" })}
                    className={`font-semibold hover:underline ${row.totalProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}
                  >
                    {money(row.totalProfit)}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeRow && open?.kind === "rate" && (
        <LaborMonthlyTrendModal
          title="Effective Hourly Rate Trend"
          points={activeRow.effectiveRateTrend}
          formatValue={(v) => `${unitMoney(v)}/hr`}
          footnote="Managed Essential IT (the Service agreement line) ÷ that month's trailing 3-month average logged hours. History builds up going forward from whenever this was first synced, never backfilled."
          onClose={() => setOpen(null)}
        />
      )}
      {activeRow && open?.kind === "service" && (
        <LaborMonthlyTrendModal
          title="Service Profit Trend"
          points={activeRow.serviceProfitTrend}
          formatValue={(v) => money(v)}
          positiveIsGood
          footnote="Managed Essential IT minus that month's hours logged × the service hourly rate in effect at the time (Admin Settings) — frozen per month, so a later rate change doesn't rewrite past months."
          onClose={() => setOpen(null)}
        />
      )}
      {activeRow && open?.kind === "product" && (
        <ProductProfitDetailModal
          clientName={activeRow.name}
          breakdown={activeRow.agreementBreakdown}
          onClose={() => setOpen(null)}
        />
      )}
      {activeRow && open?.kind === "total" && (
        <ProductProfitDetailModal
          clientName={activeRow.name}
          breakdown={activeRow.agreementBreakdown}
          serviceProfit={activeRow.serviceProfit}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
