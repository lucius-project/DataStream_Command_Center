import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/roleRank";
import { getClientProfile } from "@/lib/services/companyProfile";
import { fetchNinjaOrganizations } from "@/lib/integrations/ninjaRmm";
import { fetchCustomers } from "@/lib/integrations/quickbooks";
import { rollingAverageHours, buildAgreementBreakdown, getClientLaborTrend } from "@/lib/services/clientProfitability";
import { getKpiSettings } from "@/lib/services/kpiSettings";
import { LinkAccountsPanel } from "@/components/companyProfile/LinkAccountsPanel";
import { EffectiveHourlyRateTile } from "@/components/companyProfile/EffectiveHourlyRateTile";
import { ServiceProfitTile } from "@/components/companyProfile/ServiceProfitTile";
import { BackgroundSync } from "@/components/shared/BackgroundSync";

function money(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Per-unit agreement item prices keep cents (unlike the aggregate
// revenue/cost/profit figures above, which round to whole dollars) — a
// $12.50/unit item rounding to "$13" would misrepresent the real rate.
function unitMoney(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function CompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("CEO");
  const { id } = await params;

  // No QuickBooks/NinjaOne seat-reconciliation call on this render —
  // that moved to app/api/clients/[id]/sync/route.ts, fired by
  // <BackgroundSync> right after the page paints from whatever's already
  // in the database. fetchNinjaOrganizations/fetchCustomers stay inline
  // (same as tech-performance's getContactDirectory) — they feed the
  // account-linking panel directly for this render, not a persisted sync.
  const [syncStatus, client, ninjaOrganizations, quickbooksCustomers, kpiSettings, laborTrend] = await Promise.all([
    prisma.syncStatus.findUnique({ where: { id: `clientDetail:${id}` } }),
    getClientProfile(id),
    fetchNinjaOrganizations().catch(() => []),
    fetchCustomers().catch(() => []),
    getKpiSettings(),
    getClientLaborTrend(id),
  ]);

  if (!client) notFound();

  const syncErrors = syncStatus?.lastError ? syncStatus.lastError.split(" · ") : [];
  const clientAvg = rollingAverageHours(client.monthlyHours);
  const agreementBreakdown = buildAgreementBreakdown(client.agreementItems);
  const agreementValue = agreementBreakdown.reduce((sum, g) => sum + g.monthlyValue, 0);
  // Service (the managed-IT labor line) always contributes 0 here by
  // design (its real profit is hours × rate, shown separately by the
  // Service Profit tile below) — this is purely the resold-product
  // categories' revenue minus their real HaloPSA catalog cost (e.g.
  // Fortress Security, DataStream Protect).
  const productProfit = agreementBreakdown.reduce((sum, g) => sum + g.monthlyProfit, 0);
  const effectiveRateTrend = laborTrend.map((row) => ({ yearMonth: row.yearMonth, value: row.effectiveHourlyRate }));
  const serviceProfitTrend = laborTrend.map((row) => ({ yearMonth: row.yearMonth, value: row.laborProfit }));

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <Link href="/clients" className="font-data text-xs text-text-faint hover:text-text">
          ← Client Profitability
        </Link>
        <BackgroundSync
          syncPath={`/api/clients/${id}/sync`}
          lastSyncedAt={syncStatus?.lastSyncedAt?.toISOString() ?? null}
          hadLastError={Boolean(syncStatus?.lastError)}
        />
      </div>
      <h1 className="mt-2 font-display text-2xl font-semibold text-text">{client.name}</h1>
      <p className="mt-1 text-sm text-text-muted">
        {client.hoursThisMonth}h logged this month
        {clientAvg.monthsCovered > 0 && (
          <>
            {" "}
            · {clientAvg.avgHoursPerMonth}h avg/mo ({clientAvg.monthsCovered}{" "}
            {clientAvg.monthsCovered === 1 ? "mo" : "mos"} synced)
          </>
        )}{" "}
        · {client.agreementItems.length}{" "}
        {client.agreementItems.length === 1 ? "agreement item" : "agreement items"}
      </p>

      {syncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {syncErrors.map((error, i) => (
            <div key={i}>Sync failed, showing the last synced data: {error}</div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <div>
          <div className="font-display text-sm font-medium text-text">IT Service Agreement</div>
          {agreementBreakdown.length > 0 ? (
            <div className="mt-2 flex flex-col gap-2">
              {agreementBreakdown.map((group) => {
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
              <div className="flex items-center justify-between rounded-lg border border-border-strong bg-panel-raised px-3 py-2">
                <span className="font-data text-xs font-medium text-text">Agreement value</span>
                <span className="font-display text-sm font-semibold text-text">{unitMoney(agreementValue)}/mo</span>
              </div>
              {productProfit !== 0 && (
                <div className="flex items-center justify-between rounded-lg border border-border-strong bg-panel-raised px-3 py-2">
                  <span className="font-data text-xs font-medium text-text">
                    Product profit <span className="text-text-faint">(resold categories)</span>
                  </span>
                  <span
                    className={`font-display text-sm font-semibold ${productProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}
                  >
                    {unitMoney(productProfit)}/mo
                  </span>
                </div>
              )}
              {laborTrend.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <EffectiveHourlyRateTile trend={effectiveRateTrend} />
                  <ServiceProfitTile trend={serviceProfitTrend} />
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-border bg-panel p-4 text-center text-sm text-text-muted">
              No agreement items synced yet.
            </div>
          )}
        </div>

        <div>
          <div className="font-display text-sm font-medium text-text">Financials</div>
          {client.financials ? (
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-border bg-panel p-4 sm:grid-cols-4">
              <div>
                <div className="font-display text-lg font-semibold text-text">
                  {money(client.financials.revenueThisMonth)}
                </div>
                <div className="font-data text-[11px] text-text-faint">revenue this month</div>
              </div>
              <div>
                <div className="font-display text-lg font-semibold text-text">
                  {money(client.financials.laborCost)}
                </div>
                <div className="font-data text-[11px] text-text-faint">
                  {kpiSettings.laborHourlyRate > 0
                    ? `service cost (${unitMoney(kpiSettings.laborHourlyRate)}/hr × ${client.hoursThisMonth}h)`
                    : "service cost (rate not set — see Admin Settings)"}
                </div>
              </div>
              <div>
                <div className="font-display text-lg font-semibold text-text">
                  {money(client.financials.itemRevenue - client.financials.itemCost)}
                </div>
                <div className="font-data text-[11px] text-text-faint">item margin</div>
              </div>
              <div>
                <div
                  className={`font-display text-lg font-semibold ${client.financials.netProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}
                >
                  {money(client.financials.netProfit)}
                </div>
                <div className="font-data text-[11px] text-text-faint">net profit</div>
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-border bg-panel p-4 text-center text-sm text-text-muted">
              {client.quickbooksCustomerId
                ? "No QuickBooks data synced yet."
                : "Link a QuickBooks customer below to see revenue, service cost, and profit."}
            </div>
          )}
        </div>

        <div>
          <div className="font-display text-sm font-medium text-text">Seat reconciliation</div>
          {client.seatChecks.length > 0 ? (
            <div className="mt-2 flex flex-col gap-2">
              {client.seatChecks.map((check) => {
                const mismatch = check.installedCount !== check.billedQuantity;
                return (
                  <div
                    key={check.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-panel p-3"
                  >
                    <span className="text-sm text-text">{check.tool}</span>
                    <span
                      className={`font-data text-xs ${mismatch ? "text-status-critical" : "text-status-ok"}`}
                    >
                      {check.installedCount} installed / {check.billedQuantity} billed
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-border bg-panel p-4 text-center text-sm text-text-muted">
              {client.ninjaOrganizationId
                ? "No NinjaRMM data synced yet."
                : "Link a NinjaRMM organization below to check installed vs. billed seats."}
            </div>
          )}
        </div>

        <LinkAccountsPanel
          clientId={client.id}
          clientName={client.name}
          ninjaOrganizationId={client.ninjaOrganizationId}
          quickbooksCustomerId={client.quickbooksCustomerId}
          ninjaOrganizations={ninjaOrganizations}
          quickbooksCustomers={quickbooksCustomers}
        />
      </div>
    </div>
  );
}
