import { syncTicketsFromHalo, syncTeamTimeGaps } from "@/lib/integrations/halopsa";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";
import { syncRemoteSessions } from "@/lib/integrations/ninjaRmm";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import { getTechPerformance, getTechOrgKpis, syncTicketLoadHistory } from "@/lib/services/techPerformance";
import { getServiceDeskHealthSnapshot, getSlaAtRiskTickets } from "@/lib/services/serviceDeskHealth";
import { generateManagerAlerts } from "@/lib/services/managerAlerts";
import { getStaleTickets } from "@/lib/services/operations";
import { getRemoteSessionAnalytics, type TechRemoteSummary } from "@/lib/services/remoteSessions";
import {
  getCallTicketMatches,
  callMatchesFor,
  buildCallMatchRows,
  getSessionTicketMatches,
  sessionMatchesFor,
  buildSessionMatchRows,
  getClientLinkCoverage,
  getCustomerInteractionTime,
  getTimeCoverage,
  summarizeTimeCoverage,
  buildTimeCoverageRows,
  getActivityTimeline,
} from "@/lib/services/activityCorrelation";
import type { Tech } from "@/lib/integrations/halopsa";
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
  const [ticketSync, timeGapSync, callSync, remoteSessionSync] = await Promise.all([
    syncTicketsFromHalo(),
    syncTeamTimeGaps(),
    syncCallActivity(),
    syncRemoteSessions(),
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
  const [staleTickets, ticketsByTech, remoteAnalytics] = await Promise.all([
    getStaleTickets(),
    getTicketsByTech(),
    getRemoteSessionAnalytics(),
  ]);
  // Both depend on ticketsByTech above, so they can't join the batch —
  // but each is a handful of cheap, already-synced DB reads plus (for
  // sessions) two small unpersisted NinjaOne lookups, same cost profile
  // as everything else on this page.
  const [callTicketMatches, sessionTicketMatches, clientLinkCoverage] = await Promise.all([
    getCallTicketMatches(directory, ticketsByTech),
    getSessionTicketMatches(ticketsByTech),
    getClientLinkCoverage(),
  ]);
  // Built from the two match arrays above (no extra fetch — see
  // getCustomerInteractionTime's own comment), then joined against
  // DailyHours for Time Coverage.
  const interactionByTech = getCustomerInteractionTime(callTicketMatches, sessionTicketMatches);
  const timeCoverageByTech = await getTimeCoverage(interactionByTech);
  const staleByTech = bucketStaleTicketsByTech(staleTickets);
  const serviceMetricsByTech = await getTechServiceMetrics(staleTickets);
  const remoteByTech = new Map<Tech, TechRemoteSummary>(remoteAnalytics.byTech.map((r) => [r.tech, r]));
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
    remoteSessionSync.error && `NinjaOne: ${remoteSessionSync.error}`,
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
        {clientLinkCoverage.total > 0 && (
          <p className="mt-0.5 font-data text-[11px] text-text-faint">
            {clientLinkCoverage.linked} of {clientLinkCoverage.total} clients linked to NinjaOne — remote-session-to-ticket
            matching is only possible for linked clients (link accounts from a client&apos;s own page).
          </p>
        )}
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
          // remoteByTech always has an entry for every KNOWN_TECHS member
          // (see getRemoteSessionAnalytics), so this fallback only
          // matters if the roster ever drifts out of sync — same
          // defensive pattern as techPerformanceScore.ts's *For helpers.
          const callMatches = callMatchesFor(callTicketMatches, tech.person);
          const callMatchRows = buildCallMatchRows(callMatches);
          const sessionMatches = sessionMatchesFor(sessionTicketMatches, tech.person);
          const sessionMatchRows = buildSessionMatchRows(sessionMatches);
          const timeCoverage = summarizeTimeCoverage(timeCoverageByTech.get(tech.person as Tech) ?? []);
          const timeCoverageRows = buildTimeCoverageRows(timeCoverage.days);
          const timelineEntries = getActivityTimeline(
            tech.person as Tech,
            callTicketMatches,
            sessionTicketMatches,
            ticketsByTech,
          );
          const remote = remoteByTech.get(tech.person as Tech) ?? {
            tech: tech.person as Tech,
            techLabel: tech.person,
            sessions: 0,
            failedSessions: 0,
            canceledSessions: 0,
            grossSeconds: 0,
            uniqueSeconds: 0,
            durationStatus: "unavailable" as const,
            medianDurationSeconds: null,
            p90DurationSeconds: null,
            businessHoursSessions: 0,
            afterHoursSessions: 0,
            uniqueDeviceIds: new Set<string>(),
          };
          return (
            <TechPerformanceRow
              key={tech.person}
              tech={tech}
              todayIndex={todayIndex}
              role={role}
              scoreResult={scoreResult}
              serviceMetrics={serviceMetrics}
              cardData={cardData}
              remote={remote}
              callMatchRows={callMatchRows}
              sessionMatchRows={sessionMatchRows}
              timeCoverage={timeCoverage}
              timeCoverageRows={timeCoverageRows}
              timelineEntries={timelineEntries}
            />
          );
        })}
      </div>
    </div>
  );
}
