import { syncTicketsFromHalo, syncTeamTimeGaps } from "@/lib/integrations/halopsa";
import { getDispatchTickets, getLoadPerTech, getAttentionFlags, getTimeGaps } from "@/lib/services/operations";
import { OperationsView } from "@/components/operations/OperationsView";

export default async function OperationsPage() {
  const [ticketSync, timeGapSync] = await Promise.all([syncTicketsFromHalo(), syncTeamTimeGaps()]);
  const [tickets, load, flags, timeGaps] = await Promise.all([
    getDispatchTickets(),
    getLoadPerTech(),
    getAttentionFlags(),
    getTimeGaps(),
  ]);
  const syncErrors = [ticketSync.error, timeGapSync.error].filter((e): e is string => Boolean(e));

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Operations</h1>
      <p className="mt-1 text-sm text-text-muted">
        Dispatch load and what needs you personally, from HaloPSA-shaped data.
      </p>
      {syncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {syncErrors.map((error, i) => (
            <div key={i}>HaloPSA sync failed, showing the last synced data: {error}</div>
          ))}
        </div>
      )}
      <div className="mt-6">
        <OperationsView tickets={tickets} load={load} flags={flags} timeGaps={timeGaps} />
      </div>
    </div>
  );
}
