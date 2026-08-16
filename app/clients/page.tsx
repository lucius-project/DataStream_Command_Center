import Link from "next/link";
import { requireRole } from "@/lib/auth/roleRank";
import { syncClientProfitability } from "@/lib/integrations/haloClients";
import { syncAllClientFinancials } from "@/lib/integrations/quickbooks";
import { getClientProfitabilityReport, rollingAverageHours, buildAgreementBreakdown } from "@/lib/services/clientProfitability";
import { getKpiSettings } from "@/lib/services/kpiSettings";
import { SyncHistoryButton } from "@/components/clients/SyncHistoryButton";
import { FinancialSummaryTable } from "@/components/clients/FinancialSummaryTable";

function monthLabel(avg: ReturnType<typeof rollingAverageHours>): string {
  if (avg.monthsCovered === 0) return "";
  return avg.earliestMonth === avg.latestMonth
    ? `${avg.earliestMonth}`
    : `${avg.earliestMonth} – ${avg.latestMonth}`;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Per-unit agreement item prices keep cents (unlike the aggregate
// revenue/cost/profit figures above, which round to whole dollars) — a
// $12.50/unit item rounding to "$13" would misrepresent the real rate.
function unitMoney(value: number): string {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function ClientsPage() {
  await requireRole("CEO");
  const [sync, financialsSync] = await Promise.all([syncClientProfitability(), syncAllClientFinancials()]);
  const [clients, kpiSettings] = await Promise.all([getClientProfitabilityReport(), getKpiSettings()]);

  const totalHours = Math.round(clients.reduce((sum, c) => sum + c.hoursThisMonth, 0) * 10) / 10;
  // Managed IT vs. Break Fix — the same "has a real agreement" signal
  // already used for the "N with agreement" stat and every other
  // agreement-derived figure on this page (Financial Summary, IT
  // Service Agreement breakdown), just used here to split the client
  // list into the two groups an MSP actually thinks in: recurring
  // managed clients vs. ad-hoc/time-and-materials ones with no contract
  // on file at all.
  const managedClients = clients.filter((c) => c.agreementItems.length > 0);
  const breakFixClients = clients.filter((c) => c.agreementItems.length === 0);
  const linkedClients = clients.filter((c) => c.financials);
  const totalRevenue = linkedClients.reduce((sum, c) => sum + c.financials!.revenueThisMonth, 0);
  const totalProfit = linkedClients.reduce((sum, c) => sum + c.financials!.netProfit, 0);
  const contractTypeCounts = new Map<string, number>();
  for (const client of clients) {
    const types = new Set(client.agreementItems.map((i) => i.contractType || "Other"));
    for (const type of types) {
      contractTypeCounts.set(type, (contractTypeCounts.get(type) ?? 0) + 1);
    }
  }

  // Combined rolling average across all clients — sum each client's
  // monthly ledger rows into one series first, then average. Window is
  // whatever the last history sync actually reached (see
  // backfillClientMonthlyHours), not assumed to be 12 months.
  const combinedMonthly = new Map<string, number>();
  for (const client of clients) {
    for (const m of client.monthlyHours) {
      combinedMonthly.set(m.yearMonth, (combinedMonthly.get(m.yearMonth) ?? 0) + m.hours);
    }
  }
  const combinedAvg = rollingAverageHours(
    Array.from(combinedMonthly, ([yearMonth, hours]) => ({ yearMonth, hours })),
  );

  // Shared card markup for both the Managed IT and Break Fix groups
  // below — same card, just two different slices of `clients` feeding
  // it, so a Break Fix client (no agreementItems) naturally renders
  // without an agreement-badges row rather than needing a second layout.
  function clientCard(client: (typeof clients)[number]) {
    const clientAvg = rollingAverageHours(client.monthlyHours);
    return (
      <Link
        key={client.id}
        href={`/clients/${client.id}`}
        className="block rounded-lg border border-border bg-panel p-4 hover:border-accent"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-base font-medium text-text">{client.name}</div>
            <div className="font-data text-xs text-text-faint">
              {client.agreementItems.length}{" "}
              {client.agreementItems.length === 1 ? "agreement item" : "agreement items"}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-xl font-semibold text-text">
              {client.hoursThisMonth}h
            </div>
            <div className="font-data text-[11px] text-text-faint">this month</div>
            {clientAvg.monthsCovered > 0 && (
              <div className="mt-0.5 font-data text-[11px] text-text-faint">
                {clientAvg.avgHoursPerMonth}h avg/mo ({clientAvg.monthsCovered}{" "}
                {clientAvg.monthsCovered === 1 ? "mo" : "mos"})
              </div>
            )}
          </div>
        </div>

        {client.techHours.length > 0 && (
          <div className="mt-2 font-data text-xs text-text-muted">
            {client.techHours.map((th, i) => (
              <span key={th.id}>
                {i > 0 && " · "}
                {th.tech} {th.hours}h
              </span>
            ))}
          </div>
        )}

        {client.agreementItems.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {client.agreementItems.map((item) => (
              <span
                key={item.id}
                className="flex items-center gap-1.5 rounded border border-border-strong bg-panel-raised px-2 py-1 font-data text-[11px] text-text-muted"
              >
                {item.name}
                {item.quantity !== 1 ? ` ×${item.quantity}` : ""}
                {item.unitPrice !== null && ` · ${unitMoney(item.unitPrice)}/unit`}
                {item.contractType && (
                  <span className="rounded-sm bg-panel px-1 py-0.5 text-text-faint">
                    {item.contractType}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {client.financials && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2">
            <div>
              <div className="font-data text-sm font-medium text-text">{money(client.financials.revenueThisMonth)}</div>
              <div className="font-data text-[10px] text-text-faint">revenue</div>
            </div>
            <div>
              <div className="font-data text-sm font-medium text-text">{money(client.financials.laborCost)}</div>
              <div className="font-data text-[10px] text-text-faint">service cost</div>
            </div>
            <div>
              <div
                className={`font-data text-sm font-medium ${client.financials.netProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}
              >
                {money(client.financials.netProfit)}
              </div>
              <div className="font-data text-[10px] text-text-faint">net profit</div>
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-border pt-2 font-data text-[11px] text-text-faint">
          View profile — full financials, agreement detail &amp; seat reconciliation →
        </div>
      </Link>
    );
  }

  // Financial Summary — Total Profit = Service Profit (Managed Essential
  // IT revenue minus hours × the admin-set service rate, see
  // ClientLaborMonthly) + Product Profit (every other agreement
  // category's revenue minus its real HaloPSA catalog cost, see
  // buildAgreementBreakdown). Neither side depends on QuickBooks, unlike
  // the revenue/net-profit figures above — this ranks every client, not
  // just QuickBooks-linked ones. ("Service"/"Product" were "Labor"/
  // "Service" until the business renamed them for clarity — internal
  // schema/service names below still say "labor", see
  // clientProfitability.ts's own comment on why those weren't renamed.)
  const financialSummary = clients
    .map((client) => {
      // client.laborMonthly comes back most-recent-first (see
      // getClientProfitabilityReport); trend charts read left-to-right
      // oldest-to-newest, same chronological order getClientLaborTrend
      // already produces for the Company Profile page's own tiles.
      const chronological = [...client.laborMonthly].reverse();
      const currentLabor = client.laborMonthly[0];
      const serviceProfit = currentLabor?.laborProfit ?? 0;
      const effectiveHourlyRate = currentLabor?.effectiveHourlyRate ?? null;
      const agreementBreakdown = buildAgreementBreakdown(client.agreementItems);
      const productProfit = agreementBreakdown.reduce((sum, g) => sum + g.monthlyProfit, 0);
      return {
        id: client.id,
        name: client.name,
        effectiveHourlyRate,
        serviceProfit,
        productProfit,
        totalProfit: serviceProfit + productProfit,
        effectiveRateTrend: chronological.map((row) => ({ yearMonth: row.yearMonth, value: row.effectiveHourlyRate })),
        serviceProfitTrend: chronological.map((row) => ({ yearMonth: row.yearMonth, value: row.laborProfit })),
        agreementBreakdown,
        hasData: Boolean(currentLabor) || client.agreementItems.length > 0,
      };
    })
    .filter((c) => c.hasData)
    .sort((a, b) => b.totalProfit - a.totalProfit);

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Client Profitability</h1>
          <p className="mt-1 text-sm text-text-muted">
            Hours worked this month by tech, contract details from HaloPSA, and revenue/cost/profit
            from QuickBooks for every linked client.
          </p>
        </div>
        <SyncHistoryButton />
      </div>

      {(sync.error || financialsSync.error) && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {sync.error && <div>HaloPSA sync failed, showing the last synced data: {sync.error}</div>}
          {financialsSync.error && <div>QuickBooks sync failed, showing the last synced data: {financialsSync.error}</div>}
        </div>
      )}

      {clients.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-4 rounded-lg border border-border bg-panel p-4">
          <div>
            <div className="font-display text-xl font-semibold text-text">{totalHours}h</div>
            <div className="font-data text-[11px] text-text-faint">total this month</div>
          </div>
          {combinedAvg.monthsCovered > 0 && (
            <div>
              <div className="font-display text-xl font-semibold text-text">
                {combinedAvg.avgHoursPerMonth}h
              </div>
              <div className="font-data text-[11px] text-text-faint">
                avg/mo · {combinedAvg.monthsCovered} {combinedAvg.monthsCovered === 1 ? "mo" : "mos"} synced (
                {monthLabel(combinedAvg)})
              </div>
            </div>
          )}
          <div>
            <div className="font-display text-xl font-semibold text-text">{clients.length}</div>
            <div className="font-data text-[11px] text-text-faint">
              clients{managedClients.length !== clients.length ? ` · ${managedClients.length} managed / ${breakFixClients.length} break fix` : ""}
            </div>
          </div>
          {linkedClients.length > 0 && (
            <>
              <div>
                <div className="font-display text-xl font-semibold text-text">{money(totalRevenue)}</div>
                <div className="font-data text-[11px] text-text-faint">
                  revenue this month · {linkedClients.length} linked
                </div>
              </div>
              <div>
                <div
                  className={`font-display text-xl font-semibold ${totalProfit >= 0 ? "text-status-ok" : "text-status-critical"}`}
                >
                  {money(totalProfit)}
                </div>
                <div className="font-data text-[11px] text-text-faint">net profit this month</div>
              </div>
            </>
          )}
          {Array.from(contractTypeCounts.entries()).map(([type, count]) => (
            <div key={type}>
              <div className="font-display text-xl font-semibold text-text">{count}</div>
              <div className="font-data text-[11px] text-text-faint">{type}</div>
            </div>
          ))}
        </div>
      )}

      {financialSummary.length > 0 && (
        <div className="mt-6">
          <div className="font-display text-sm font-medium text-text">Financial Summary</div>
          <p className="mt-0.5 font-data text-[11px] text-text-faint">
            Most to least total profit (Service Profit + Product Profit) — works for every client, not just
            QuickBooks-linked ones, since neither side depends on QuickBooks. Click any number for the trend or
            the real items behind it.
          </p>
          <div className="mt-2">
            <FinancialSummaryTable rows={financialSummary} />
          </div>
        </div>
      )}

      {clients.length > 0 && combinedAvg.monthsCovered === 0 && (
        <div className="mt-3 font-data text-xs text-text-faint">
          No monthly history synced yet — click &quot;Sync monthly history&quot; above to backfill a
          rolling average (HaloPSA&apos;s API caps how far back it can reach; the average will label
          whatever window it actually covers).
        </div>
      )}

      {linkedClients.length > 0 && kpiSettings.laborHourlyRate <= 0 && (
        <div className="mt-3 font-data text-xs text-text-faint">
          Service hourly rate isn&apos;t set — service cost and net profit below are missing that side of the
          calculation. Set it in Admin Settings for a real figure.
        </div>
      )}

      {managedClients.length > 0 && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-display text-sm font-medium text-text">Managed IT</div>
            <div className="font-data text-[11px] text-text-faint">
              {managedClients.length} {managedClients.length === 1 ? "client" : "clients"} with a contract agreement
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-3">{managedClients.map((client) => clientCard(client))}</div>
        </div>
      )}

      {breakFixClients.length > 0 && (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-display text-sm font-medium text-text">Break Fix</div>
            <div className="font-data text-[11px] text-text-faint">
              {breakFixClients.length} {breakFixClients.length === 1 ? "client" : "clients"} with no contract
              agreement on file
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-3">{breakFixClients.map((client) => clientCard(client))}</div>
        </div>
      )}

      {clients.length === 0 && !sync.error && (
        <div className="mt-6 rounded-lg border border-border bg-panel p-6 text-center text-sm text-text-muted">
          No client data yet. Once HaloPSA client read access is granted, this fills in automatically.
        </div>
      )}
    </div>
  );
}
