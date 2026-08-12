import { syncTicketsFromHalo, syncTeamTimeGaps } from "@/lib/integrations/halopsa";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import { getTechPerformance, getTechOrgKpis, syncTicketLoadHistory } from "@/lib/services/techPerformance";
import { TechPerformanceRow } from "@/components/tech-performance/TechPerformanceRow";
import { TechOrgSummaryRow } from "@/components/tech-performance/TechOrgSummaryRow";
import { OrgKpiStrip } from "@/components/tech-performance/OrgKpiStrip";

export default async function TechPerformancePage() {
  const [ticketSync, timeGapSync, callSync] = await Promise.all([
    syncTicketsFromHalo(),
    syncTeamTimeGaps(),
    syncCallActivity(),
  ]);
  // Runs after syncTicketsFromHalo (not alongside it in the batch above)
  // so this week's TicketLoadWeekly snapshot reflects freshly-synced
  // ticket data, not whatever was on disk before this page load.
  const [ticketLoadSync, directory] = await Promise.all([
    syncTicketLoadHistory(),
    getContactDirectory().catch(() => null),
  ]);
  const { techs, org, todayIndex, lastWeek } = await getTechPerformance(directory);
  const orgKpis = getTechOrgKpis(techs, org, lastWeek);
  const syncErrors = [
    ticketSync.error && `HaloPSA: ${ticketSync.error}`,
    timeGapSync.error && `HaloPSA: ${timeGapSync.error}`,
    callSync.error && `United Cloud: ${callSync.error}`,
    ticketLoadSync.error && `Ticket load history: ${ticketLoadSync.error}`,
  ].filter((e): e is string => Boolean(e));

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Tech Performance</h1>
      <p className="mt-1 text-sm text-text-muted">
        Team health at a glance, then who&apos;s excelling and who needs attention this week.
      </p>

      {syncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {syncErrors.map((error, i) => (
            <div key={i}>Sync failed, showing the last synced data — {error}</div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <OrgKpiStrip kpis={orgKpis} />
      </div>

      <div className="mt-3">
        <TechOrgSummaryRow org={org} todayIndex={todayIndex} />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {techs.map((tech) => (
          <TechPerformanceRow key={tech.person} tech={tech} todayIndex={todayIndex} />
        ))}
      </div>
    </div>
  );
}
