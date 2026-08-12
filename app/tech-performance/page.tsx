import { syncTicketsFromHalo, syncTeamTimeGaps } from "@/lib/integrations/halopsa";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import { getTechPerformance, getTechOrgKpis, syncTicketLoadHistory } from "@/lib/services/techPerformance";
import { getServiceDeskHealthSnapshot, getSlaAtRiskTickets } from "@/lib/services/serviceDeskHealth";
import { generateManagerAlerts } from "@/lib/services/managerAlerts";
import { getStaleTickets } from "@/lib/services/operations";
import {
  getTechServiceMetrics,
  getTicketsByTech,
  bucketStaleTicketsByTech,
  buildTechCardTicketData,
  computeTechPerformanceScore,
  roleFor,
  serviceMetricsFor,
  ticketsFor,
  staleTicketsFor,
} from "@/lib/services/techPerformanceScore";
import { TechPerformanceRow } from "@/components/tech-performance/TechPerformanceRow";
import { TechOrgSummaryRow } from "@/components/tech-performance/TechOrgSummaryRow";
import { OrgKpiStrip } from "@/components/tech-performance/OrgKpiStrip";
import { ServiceDeskHealthSection } from "@/components/service-desk/ServiceDeskHealthSection";
import { NeedsAttentionSection } from "@/components/service-desk/NeedsAttentionSection";
import { SlaAtRiskSection } from "@/components/service-desk/SlaAtRiskSection";
import { ManagerActionQueue } from "@/components/service-desk/ManagerActionQueue";

export default async function TechPerformancePage() {
  const [ticketSync, timeGapSync, callSync] = await Promise.all([
    syncTicketsFromHalo(),
    syncTeamTimeGaps(),
    syncCallActivity(),
  ]);
  // Run after syncTicketsFromHalo (not alongside it in the batch above)
  // so both this week's TicketLoadWeekly snapshot and the new Service
  // Desk Health section reflect freshly-synced ticket data, not whatever
  // was on disk before this page load.
  const [ticketLoadSync, directory, healthSnapshot, slaAtRisk] = await Promise.all([
    syncTicketLoadHistory(),
    getContactDirectory().catch(() => null),
    getServiceDeskHealthSnapshot(),
    getSlaAtRiskTickets(),
  ]);
  const { techs, org, todayIndex, lastWeek } = await getTechPerformance(directory);
  const orgKpis = getTechOrgKpis(techs, org, lastWeek);

  // Fetched once here and reused by both the per-tech Performance Score
  // (Service Delivery/Work Management categories) and each card's own
  // stale/ticket drill-downs — same DB-only, no-extra-HaloPSA-calls
  // discipline as the rest of this page.
  const [staleTickets, ticketsByTech] = await Promise.all([getStaleTickets(), getTicketsByTech()]);
  const staleByTech = bucketStaleTicketsByTech(staleTickets);
  const serviceMetricsByTech = await getTechServiceMetrics(staleTickets);
  // Sum of each tech's own pro-rated expectedHoursToDate (techPerformance.ts)
  // rather than a second weekFraction computation here — one source of
  // truth for "how far into the week are we," reused rather than redone.
  const expectedHoursToDate = techs.reduce((sum, t) => sum + t.expectedHoursToDate, 0);
  const alerts = await generateManagerAlerts({
    health: healthSnapshot,
    slaAtRisk,
    techs,
    org,
    lastWeek,
    todayIndex,
    expectedHoursToDate,
    directory,
  });
  const syncErrors = [
    ticketSync.error && `HaloPSA: ${ticketSync.error}`,
    timeGapSync.error && `HaloPSA: ${timeGapSync.error}`,
    callSync.error && `United Cloud: ${callSync.error}`,
    ticketLoadSync.error && `Ticket load history: ${ticketLoadSync.error}`,
  ].filter((e): e is string => Boolean(e));

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Tech Performance</h1>
      <p className="mt-1 text-sm text-text-muted">
        Service desk health, then team and per-tech detail — everything a Service Desk Manager needs today.
      </p>

      {syncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {syncErrors.map((error, i) => (
            <div key={i}>Sync failed, showing the last synced data — {error}</div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <ServiceDeskHealthSection snapshot={healthSnapshot} />
      </div>

      <div className="mt-6">
        <NeedsAttentionSection alerts={alerts} />
      </div>

      <div className="mt-6">
        <SlaAtRiskSection tickets={slaAtRisk} />
      </div>

      <div className="mt-6">
        <ManagerActionQueue alerts={alerts} />
      </div>

      <div className="mt-6">
        <h2 className="font-display text-sm font-medium text-text-muted">Team Detail</h2>
      </div>

      <div className="mt-3">
        <OrgKpiStrip kpis={orgKpis} />
      </div>

      <div className="mt-3">
        <TechOrgSummaryRow org={org} todayIndex={todayIndex} />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {techs.map((tech) => {
          const role = roleFor(tech.person);
          const serviceMetrics = serviceMetricsFor(serviceMetricsByTech, tech.person);
          const scoreResult = computeTechPerformanceScore(tech, serviceMetrics, role);
          const cardData = buildTechCardTicketData(
            ticketsFor(ticketsByTech, tech.person),
            staleTicketsFor(staleByTech, tech.person),
            serviceMetrics,
          );
          return (
            <TechPerformanceRow
              key={tech.person}
              tech={tech}
              todayIndex={todayIndex}
              role={role}
              scoreResult={scoreResult}
              serviceMetrics={serviceMetrics}
              cardData={cardData}
            />
          );
        })}
      </div>
    </div>
  );
}
