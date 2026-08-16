import { prisma } from "@/lib/prisma";
import { requireSignedIn } from "@/lib/auth/roleRank";
import { syncTicketsFromHalo, syncTeamTimeGaps } from "@/lib/integrations/halopsa";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";
import { syncRemoteSessions } from "@/lib/integrations/ninjaRmm";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import { getTechPerformance, getTechOrgKpis, syncTicketLoadHistory } from "@/lib/services/techPerformance";
import {
  getServiceDeskHealthSnapshot,
  getSlaAtRiskTickets,
  syncServiceDeskHealthDaily,
  getServiceDeskHealthWeekAgo,
  getServiceDeskHealthYesterday,
  getTicketTrend30DayTotal,
} from "@/lib/services/serviceDeskHealth";
import { generateManagerAlerts } from "@/lib/services/managerAlerts";
import { getCallAnswerRateTrend } from "@/lib/services/callActivity";
import { getOrgCoachingInsights, getTechCoachingInsights } from "@/lib/services/coaching";
import { buildMorningBrief } from "@/lib/services/morningBrief";
import { getStaleTickets } from "@/lib/services/operations";
import { getKpiSettings, getTechRoleConfigs } from "@/lib/services/kpiSettings";
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
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import {
  getTechServiceMetrics,
  getTicketsByTech,
  bucketStaleTicketsByTech,
  buildTechCardTicketData,
  computeTechPerformanceScore,
  syncTechScoreDaily,
  getTechScoreWeekAgo,
  getTechScoreTrendArrow,
  roleFor,
  serviceMetricsFor,
  ticketsFor,
  staleTicketsFor,
  type TechPerformanceScoreResult,
} from "@/lib/services/techPerformanceScore";
import { TechPerformanceRow } from "@/components/tech-performance/TechPerformanceRow";
import { TechComparisonTable, type TechComparisonEntry } from "@/components/tech-performance/TechComparisonTable";
import { TechOrgSummaryRow } from "@/components/tech-performance/TechOrgSummaryRow";
import { OrgKpiStrip } from "@/components/tech-performance/OrgKpiStrip";
import { RmmOrgSummary } from "@/components/tech-performance/RmmOrgSummary";
import { TicketHealthKpiTile } from "@/components/tech-performance/TicketHealthKpiTile";
import { Stat } from "@/components/tech-performance/shared";
import { SlaAtRiskSection } from "@/components/service-desk/SlaAtRiskSection";
import { ManagerActionQueue } from "@/components/service-desk/ManagerActionQueue";
import { CoachingSection } from "@/components/service-desk/CoachingSection";
import { MorningBriefCard } from "@/components/service-desk/MorningBriefCard";
import { InfoButton } from "@/components/shared/InfoButton";

export default async function TechPerformancePage() {
  const session = await requireSignedIn();
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
  const [
    ticketLoadSync,
    directoryResult,
    healthSnapshot,
    slaAtRisk,
    healthWeekAgo,
    healthYesterday,
    ticketTrend30Day,
    kpiSettings,
    techRoleConfigs,
    haloCredential,
  ] = await Promise.all([
    syncTicketLoadHistory(),
    // Same error-preserving pattern as app/calls/page.tsx — a failure
    // here (e.g. an expired HaloPSA token) shouldn't look identical to
    // "not connected yet," so it's folded into syncErrors below rather
    // than silently discarded.
    getContactDirectory()
      .then((directory) => ({ directory, error: undefined as string | undefined }))
      .catch((err) => ({ directory: null, error: err instanceof Error ? err.message : "Directory lookup failed." })),
    getServiceDeskHealthSnapshot(),
    getSlaAtRiskTickets(),
    getServiceDeskHealthWeekAgo(),
    getServiceDeskHealthYesterday(),
    getTicketTrend30DayTotal(),
    getKpiSettings(),
    getTechRoleConfigs(KNOWN_TECHS),
    prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } }),
  ]);
  const directory = directoryResult.directory;
  // Null when HaloPSA isn't connected yet — SlaAtRiskSection then shows
  // ticket titles as plain text instead of a link, never a guessed URL.
  const instanceUrl = haloCredential?.instanceUrl ?? null;
  const techScoreWeights = {
    serviceDelivery: kpiSettings.techWeightServiceDelivery,
    quality: kpiSettings.techWeightQuality,
    productivity: kpiSettings.techWeightProductivity,
    workManagement: kpiSettings.techWeightWorkManagement,
    phone: kpiSettings.techWeightPhone,
  };
  // Depends on directory above, so it joins the next batch rather than
  // this one — used only by coaching.ts's org-level Call Answer Rate
  // insight (Phase 11), not rendered directly on this page otherwise.
  const callAnswerRateTrend = await getCallAnswerRateTrend(directory);
  // Freezes today's already-computed healthSnapshot into
  // ServiceDeskHealthDaily (Phase 10) — a pure DB upsert on values
  // already in hand, no new query, so it runs alongside getTechPerformance
  // rather than serialized after it.
  const [{ techs, org, todayIndex, lastWeek }, healthDailySyncError] = await Promise.all([
    getTechPerformance(directory),
    syncServiceDeskHealthDaily(healthSnapshot)
      .then(() => null)
      .catch((e: unknown) => (e instanceof Error ? e.message : "Service Desk Health history sync failed.")),
  ]);
  const orgKpis = getTechOrgKpis(techs, org, lastWeek);

  // Fetched once here and reused by both the per-tech Performance Score
  // (Service Delivery/Work Management categories) and each card's own
  // stale/ticket drill-downs — same DB-only, no-extra-HaloPSA-calls
  // discipline as the rest of this page.
  const [staleTickets, ticketsByTech, remoteAnalytics, ninjaDevices] = await Promise.all([
    getStaleTickets(),
    getTicketsByTech(),
    getRemoteSessionAnalytics(),
    prisma.ninjaDevice.findMany({ select: { ninjaDeviceId: true, displayName: true } }),
  ]);
  // For Activity Timeline's remote-session entries — same lookup pattern
  // as remoteSessions.ts's own deviceById, fetched once here rather than
  // once per tech inside the render loop below.
  const deviceNameById = new Map(ninjaDevices.map((d) => [d.ninjaDeviceId, d.displayName]));
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
  // Hoisted out of the per-tech render loop (Phase 10) so each tech's
  // already-computed score can also be frozen into TechScoreDaily below,
  // rather than being recomputed a second time or written to the DB from
  // inside JSX-adjacent code — same "sync happens up top, render reads
  // already-computed data" structure this page uses everywhere else.
  const scoreByTech = new Map<Tech, TechPerformanceScoreResult>(
    techs.map((tech) => [
      tech.person as Tech,
      computeTechPerformanceScore(tech, serviceMetricsFor(serviceMetricsByTech, tech.person), roleFor(tech.person, techRoleConfigs), techScoreWeights),
    ]),
  );
  const techScoreSyncError = await Promise.all(
    techs.map((tech) => syncTechScoreDaily(tech.person, scoreByTech.get(tech.person as Tech)!)),
  )
    .then(() => null)
    .catch((e: unknown) => (e instanceof Error ? e.message : "Technician score history sync failed."));
  // "vs 7d ago" arrow on each tech's score badge — a separate read from
  // the write above (needs last week's row, not today's), same
  // "omit rather than fabricate" rule as getServiceDeskHealthWeekAgo.
  const techScoreWeekAgoByTech = new Map(
    await Promise.all(
      techs.map(async (tech) => [tech.person as Tech, await getTechScoreWeekAgo(tech.person)] as const),
    ),
  );
  // Coaching Insights & Positive Recognition (Phase 11) — a narrative
  // layer over trend data already computed above, no new metrics.
  const coachingInsights = [
    ...getOrgCoachingInsights(healthSnapshot, healthWeekAgo, callAnswerRateTrend),
    ...techs.flatMap((tech) =>
      getTechCoachingInsights(
        tech.person,
        scoreByTech.get(tech.person as Tech)!,
        techScoreWeekAgoByTech.get(tech.person as Tech) ?? null,
      ),
    ),
  ];
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
  const morningBrief = buildMorningBrief(
    healthSnapshot.healthScore,
    healthYesterday,
    ticketTrend30Day,
    healthSnapshot.responseSla.status === "available" ? healthSnapshot.responseSla.pct : null,
    kpiSettings.responseSlaGreenPct,
    kpiSettings.responseSlaYellowPct,
    alerts,
    coachingInsights,
  );
  const syncErrors = [
    ticketSync.error && `HaloPSA: ${ticketSync.error}`,
    timeGapSync.error && `HaloPSA: ${timeGapSync.error}`,
    callSync.error && `United Cloud: ${callSync.error}`,
    ticketLoadSync.error && `Ticket load history: ${ticketLoadSync.error}`,
    remoteSessionSync.error && `NinjaOne: ${remoteSessionSync.error}`,
    healthDailySyncError && `Trend history: ${healthDailySyncError}`,
    techScoreSyncError && `Trend history: ${techScoreSyncError}`,
    directoryResult.error && `Directory lookup: ${directoryResult.error}`,
  ].filter((e): e is string => Boolean(e));

  // One row-building function reused by both the manager's full-team
  // loop and the technician's own single-card view below — same data,
  // just a different slice of `techs` gets rendered through it.
  function techRow(tech: (typeof techs)[number]) {
    const role = roleFor(tech.person, techRoleConfigs);
    const serviceMetrics = serviceMetricsFor(serviceMetricsByTech, tech.person);
    const scoreResult = scoreByTech.get(tech.person as Tech)!;
    const scoreTrend = getTechScoreTrendArrow(scoreResult.score, techScoreWeekAgoByTech.get(tech.person as Tech) ?? null);
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
      deviceNameById,
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
        scoreTrend={scoreTrend}
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
  }

  // Technician: only their own card, none of the team-aggregate
  // sections below (Morning Brief, Needs Attention, SLA At Risk, Manager
  // Action Queue, Coaching, org-wide strips) — those are all
  // manager-framed signals about the whole desk, not this one person's
  // own performance.
  if (session.role === "TECHNICIAN") {
    const myTech = techs.find((t) => t.person === session.techPerson);
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <h1 className="font-display text-2xl font-semibold text-text">Your Performance</h1>
        <p className="mt-1 text-sm text-text-muted">Same scoring and drill-downs your service manager sees for you.</p>
        <div className="mt-4 flex flex-col gap-2">
          {myTech ? (
            techRow(myTech)
          ) : (
            <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
              No performance data found for your account yet.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Headline metrics only, reusing the same role/serviceMetrics/score/
  // cardData lookups techRow() makes for each card below — every
  // drilldown row here is the exact same list the matching card's own
  // DrilldownStat shows, not a second, differently-computed copy.
  const techComparisonEntries: TechComparisonEntry[] = techs.map((tech) => {
    const role = roleFor(tech.person, techRoleConfigs);
    const serviceMetrics = serviceMetricsFor(serviceMetricsByTech, tech.person);
    const scoreResult = scoreByTech.get(tech.person as Tech)!;
    const scoreTrend = getTechScoreTrendArrow(scoreResult.score, techScoreWeekAgoByTech.get(tech.person as Tech) ?? null);
    const cardData = buildTechCardTicketData(
      ticketsFor(ticketsByTech, tech.person),
      staleTicketsFor(staleByTech, tech.person),
      serviceMetrics,
    );
    return {
      person: tech.person,
      role,
      status: tech.status,
      scoreResult,
      scoreTrend,
      pacePct: tech.pacePct,
      openCount: cardData.openCount,
      openRows: cardData.openRows,
      agingCount: cardData.agingCount,
      agingRows: cardData.agingRows,
      staleCount: serviceMetrics.staleCount,
      staleRows: cardData.staleRows,
      responseSla: serviceMetrics.responseSla,
      responseMissRows: cardData.responseMissRows,
      resolutionSla: serviceMetrics.resolutionSla,
      resolutionMissRows: cardData.resolutionMissRows,
      callsInbound: tech.callsInbound,
      callsOutbound: tech.callsOutbound,
    };
  });

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Tech Performance</h1>
      <p className="mt-1 text-sm text-text-muted">
        Summary, then Ticket/Phone/RMM/Team detail and per-tech performance — everything a Service Desk Manager needs
        today.
      </p>

      <div className="mt-4">
        <MorningBriefCard brief={morningBrief} knownTechs={KNOWN_TECHS} />
      </div>

      {syncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {syncErrors.map((error, i) => (
            <div key={i}>Sync failed, showing the last synced data — {error}</div>
          ))}
        </div>
      )}

      {/* Four detail panels, same card treatment as Summary above
          (rounded-lg border + bg-panel + a small uppercase font-data
          label) instead of the plain <h2> every section further down
          this page still uses — these four sit right below Summary, so
          a visual mismatch here read as jarring in a way it wouldn't
          further down. Split by domain (ticket/phone/RMM) rather than
          the old single "Team Detail" grab-bag, so each is scannable on
          its own; Team Details is what's left over once the other three
          take their pieces — team-wide hours/pace plus the per-tech
          comparison table, neither of which is ticket/phone/RMM-specific. */}

      <div className="mt-6 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center gap-1.5">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Ticket Details</span>
          <InfoButton
            title="Ticket Details"
            what="Everything ticket-related for the whole desk in one place: the team's open/aging/P1/on-hold counts (click the Ticket Health tile for the flagged-items list), then SLA At Risk and Manager Action Queue below."
            meaning={`${org.openCount} open, ${org.p1Count} P1, ${org.agingCount} aging past 24h, ${org.onHoldCount} on hold, ${alerts.length} alert${alerts.length === 1 ? "" : "s"} flagged.`}
            calculation="Counts are whole-team totals across every known technician's tickets. See each sub-section's own info button for how its specific list is built."
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {orgKpis
            .filter((k) => k.key === "ticketHealth")
            .map((kpi) => (
              <TicketHealthKpiTile key={kpi.key} kpi={kpi} alerts={alerts} knownTechs={KNOWN_TECHS} />
            ))}
        </div>

        <div className="mt-3 font-data text-[11px]">
          <span className="flex flex-wrap gap-x-2.5">
            <Stat value={org.openCount} label="open" />
            <Stat value={org.p1Count} label="P1" tone={org.p1Count > 0 ? "critical" : undefined} />
            <Stat value={org.agingCount} label="aging" tone={org.agingCount > 0 ? "warn" : undefined} />
            <Stat value={org.onHoldCount} label="on hold" />
          </span>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <SlaAtRiskSection tickets={slaAtRisk} knownTechs={KNOWN_TECHS} instanceUrl={instanceUrl} />
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <ManagerActionQueue alerts={alerts} />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center gap-1.5">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Phone Details</span>
          <InfoButton
            title="Phone Details"
            what="Whole-team phone activity — inbound/outbound call volume, pickup rate, and average pickup time."
            meaning={`${org.callsInbound} in, ${org.callsOutbound} out, ${org.callsMissed} missed this week.`}
            calculation="Missed-call count and pickup rate are shown here (not on an individual tech's row) because a hunt-group ring can't be reliably attributed to the one technician who 'should' have answered it — it's a whole-team fact, same reasoning as the org KPI tiles above."
          />
        </div>

        <div className="mt-3">
          <OrgKpiStrip kpis={orgKpis.filter((k) => k.key === "pickupRate" || k.key === "avgPickupTime")} />
        </div>

        <div className="mt-3 font-data text-[11px]">
          <span className="flex flex-wrap gap-x-2.5">
            <Stat value={org.callsInbound} label="in" />
            <Stat value={org.callsOutbound} label="out" />
            <Stat value={org.callsMissed} label="missed" tone={org.callsMissed > 0 ? "warn" : undefined} />
            <Stat value={org.avgAnswerSeconds ?? "—"} label="avg ring (s)" />
            <Stat value={org.avgTalkMinutes} label="avg talk (min)" />
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center gap-1.5">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">RMM Details</span>
          <InfoButton
            title="RMM Details"
            what="Whole-team NinjaOne remote-session activity — sessions, unique devices touched, gross vs. deduplicated (unique) time, and which devices saw the most support this period."
            meaning={
              clientLinkCoverage.total > 0
                ? `${clientLinkCoverage.linked} of ${clientLinkCoverage.total} clients linked to NinjaOne.`
                : "No clients linked to NinjaOne yet."
            }
            calculation="Gross time sums every session's own duration; unique time merges overlapping sessions on the same device first, so simultaneous sessions aren't double-counted. Remote-session-to-ticket matching (see each tech's own card) is only possible for linked clients — link accounts from a client's own page."
          />
        </div>

        <div className="mt-3">
          <RmmOrgSummary analytics={remoteAnalytics} />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center gap-1.5">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Team Details</span>
          <InfoButton
            title="Team Details"
            what="What's left once Ticket/Phone/RMM Details take their own pieces — whole-team hours/pace, and a side-by-side comparison of every technician's headline metrics."
            meaning={`${org.loggedHours}h logged of ${org.expectedHours}h expected this week across the team.`}
            calculation="Hours are summed across every technician's logged time entries this week. The comparison table reuses each technician's own numbers from the cards further down the page — click any drillable cell for the underlying ticket list."
          />
        </div>

        <div className="mt-3">
          <OrgKpiStrip kpis={orgKpis.filter((k) => k.key === "teamUtilization")} />
        </div>

        <div className="mt-3">
          <TechOrgSummaryRow org={org} todayIndex={todayIndex} bordered={false} showTickets={false} showCalls={false} />
        </div>

        <div className="mt-3">
          <TechComparisonTable entries={techComparisonEntries} />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">{techs.map((tech) => techRow(tech))}</div>

      <div className="mt-6">
        <CoachingSection insights={coachingInsights} />
      </div>
    </div>
  );
}
