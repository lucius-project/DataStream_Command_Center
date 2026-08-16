"use client";

import { Modal } from "@/components/shared/Modal";
import type { AgreementCategoryGroup } from "@/lib/services/clientProfitability";

function money(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function unitMoney(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Same category-group data Client Profitability's own detail page
// builds via buildAgreementBreakdown — this modal just gives the
// Financial Summary table's Product Profit (and, with serviceProfit
// passed, Total Profit) numbers somewhere to click through to, instead
// of a second differently-computed breakdown. Was named
// ServiceProfitDetailModal until "Service"/"Product" swapped meaning
// (Service = the managed-IT labor line, Product = everything resold —
// M365/Backup/Security/Other).
export function ProductProfitDetailModal({
  clientName,
  breakdown,
  // Present only when opened from the Total Profit column — shows the
  // combined Service + Product = Total summary up top; omitted for a
  // plain Product Profit click, which just shows the category table.
  serviceProfit,
  onClose,
}: {
  clientName: string;
  breakdown: AgreementCategoryGroup[];
  serviceProfit?: number;
  onClose: () => void;
}) {
  const productProfit = breakdown.reduce((sum, g) => sum + g.monthlyProfit, 0);

  return (
    <Modal
      title={serviceProfit !== undefined ? "Total Profit" : "Product Profit"}
      subtitle={clientName}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
    >
      {serviceProfit !== undefined && (
        <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-panel-raised p-3">
          <div>
            <div className={`font-display text-base font-semibold ${serviceProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}>
              {money(serviceProfit)}
            </div>
            <div className="font-data text-[10px] text-text-faint">service profit</div>
          </div>
          <div>
            <div className={`font-display text-base font-semibold ${productProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}>
              {money(productProfit)}
            </div>
            <div className="font-data text-[10px] text-text-faint">product profit</div>
          </div>
          <div>
            <div
              className={`font-display text-base font-semibold ${serviceProfit + productProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}
            >
              {money(serviceProfit + productProfit)}
            </div>
            <div className="font-data text-[10px] text-text-faint">total profit</div>
          </div>
        </div>
      )}

      {breakdown.length > 0 ? (
        <div className="flex flex-col gap-2">
          {breakdown.map((group) => {
            const isServiceCategory = group.category === "Service";
            const showProfit = !isServiceCategory && group.monthlyValue > 0 && !group.hasUnknownCost;
            return (
              <div key={group.category} className="rounded-lg border border-border bg-panel p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-data text-xs font-medium tracking-wide text-text-muted uppercase">
                    {group.category}
                  </span>
                  <span className="flex items-center gap-1 font-data text-xs">
                    {group.monthlyValue > 0 && <span className="text-text">{unitMoney(group.monthlyValue)}/mo</span>}
                    {showProfit && (
                      <span className={group.monthlyProfit >= 0 ? "text-status-ok" : "text-status-critical"}>
                        · {unitMoney(group.monthlyProfit)} profit
                      </span>
                    )}
                    {!isServiceCategory && group.hasUnknownCost && <span className="text-text-faint">· cost unknown</span>}
                    {group.hasUnpricedItems && (
                      <span className="text-text-faint">{group.monthlyValue > 0 ? "· some unpriced" : "no pricing synced"}</span>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 font-data text-[11px] text-text-muted">
                      <span className="min-w-0 truncate">
                        {item.name}
                        {item.quantity !== 1 ? ` ×${item.quantity}` : ""}
                      </span>
                      <span className="shrink-0 text-text-faint">
                        {item.unitPrice !== null ? `${unitMoney(item.unitPrice)}/unit` : "—"}
                        {!isServiceCategory && item.unitPrice !== null && item.unitCost !== null && ` (cost ${unitMoney(item.unitCost)})`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-panel p-4 text-center text-sm text-text-muted">
          No agreement items synced yet.
        </div>
      )}

      {serviceProfit === undefined && (
        <p className="font-data text-[11px] text-text-faint">
          Service is excluded here — its real profit is hours × the admin-set service rate, not item cost; click
          the Service Profit or Total Profit column instead to see it.
        </p>
      )}
    </Modal>
  );
}
