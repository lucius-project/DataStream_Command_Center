import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientProfile } from "@/lib/services/companyProfile";
import { syncClientFinancials } from "@/lib/integrations/quickbooks";
import { syncSeatReconciliation, fetchNinjaOrganizations } from "@/lib/integrations/ninjaRmm";
import { fetchCustomers } from "@/lib/integrations/quickbooks";
import { rollingAverageHours } from "@/lib/services/clientProfitability";
import { LinkAccountsPanel } from "@/components/companyProfile/LinkAccountsPanel";

function money(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function CompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [financialsSync, seatSync] = await Promise.all([
    syncClientFinancials(id),
    syncSeatReconciliation(id),
  ]);

  const [client, ninjaOrganizations, quickbooksCustomers] = await Promise.all([
    getClientProfile(id),
    fetchNinjaOrganizations().catch(() => []),
    fetchCustomers().catch(() => []),
  ]);

  if (!client) notFound();

  const syncErrors = [financialsSync.error, seatSync.error].filter((e): e is string => Boolean(e));
  const clientAvg = rollingAverageHours(client.monthlyHours);

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link href="/clients" className="font-data text-xs text-text-faint hover:text-text">
        ← Client Profitability
      </Link>
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
                <div className="font-data text-[11px] text-text-faint">labor cost (blended rate)</div>
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
                : "Link a QuickBooks customer below to see revenue, labor cost, and profit."}
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

        {client.agreementItems.length > 0 && (
          <div>
            <div className="font-display text-sm font-medium text-text">Agreement items</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {client.agreementItems.map((item) => (
                <span
                  key={item.id}
                  className="flex items-center gap-1.5 rounded border border-border-strong bg-panel-raised px-2 py-1 font-data text-[11px] text-text-muted"
                >
                  {item.name}
                  {item.quantity !== 1 ? ` ×${item.quantity}` : ""}
                  {item.contractType && (
                    <span className="rounded-sm bg-panel px-1 py-0.5 text-text-faint">{item.contractType}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

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
