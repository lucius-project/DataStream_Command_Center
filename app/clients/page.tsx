import Link from "next/link";
import { requireRole } from "@/lib/auth/roleRank";
import { syncClientProfitability } from "@/lib/integrations/haloClients";
import { getClientProfitabilityReport, rollingAverageHours } from "@/lib/services/clientProfitability";
import { SyncHistoryButton } from "@/components/clients/SyncHistoryButton";

function monthLabel(avg: ReturnType<typeof rollingAverageHours>): string {
  if (avg.monthsCovered === 0) return "";
  return avg.earliestMonth === avg.latestMonth
    ? `${avg.earliestMonth}`
    : `${avg.earliestMonth} – ${avg.latestMonth}`;
}

export default async function ClientsPage() {
  await requireRole("CEO");
  const sync = await syncClientProfitability();
  const clients = await getClientProfitabilityReport();

  const totalHours = Math.round(clients.reduce((sum, c) => sum + c.hoursThisMonth, 0) * 10) / 10;
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

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Client Profitability</h1>
          <p className="mt-1 text-sm text-text-muted">
            Hours worked this month, by tech, against agreement type — from HaloPSA. Profitability
            math lands once QuickBooks is connected.
          </p>
        </div>
        <SyncHistoryButton />
      </div>

      {sync.error && (
        <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          HaloPSA sync failed, showing the last synced data: {sync.error}
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
            <div className="font-data text-[11px] text-text-faint">clients</div>
          </div>
          {Array.from(contractTypeCounts.entries()).map(([type, count]) => (
            <div key={type}>
              <div className="font-display text-xl font-semibold text-text">{count}</div>
              <div className="font-data text-[11px] text-text-faint">{type}</div>
            </div>
          ))}
        </div>
      )}

      {clients.length > 0 && combinedAvg.monthsCovered === 0 && (
        <div className="mt-3 font-data text-xs text-text-faint">
          No monthly history synced yet — click &quot;Sync monthly history&quot; above to backfill a
          rolling average (HaloPSA&apos;s API caps how far back it can reach; the average will label
          whatever window it actually covers).
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {clients.map((client) => {
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
                    {item.contractType && (
                      <span className="rounded-sm bg-panel px-1 py-0.5 text-text-faint">
                        {item.contractType}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 border-t border-border pt-2 font-data text-[11px] text-text-faint">
              View profile — financials &amp; seat reconciliation →
            </div>
          </Link>
          );
        })}

        {clients.length === 0 && !sync.error && (
          <div className="rounded-lg border border-border bg-panel p-6 text-center text-sm text-text-muted">
            No client data yet. Once HaloPSA client read access is granted, this fills in
            automatically.
          </div>
        )}
      </div>
    </div>
  );
}
