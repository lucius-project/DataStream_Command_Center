import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/roleRank";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import {
  getServiceDeskHealthSnapshot,
  getServiceDeskHealthWeekAgo,
  getServiceDeskHealthYesterday,
  getTicketTrend30DayTotal,
  getSlaAtRiskTickets,
} from "@/lib/services/serviceDeskHealth";
import { getBacklogBreakdown, getStaleTickets } from "@/lib/services/operations";
import { getTechPerformance, getYesterdayHoursByPerson, getCallStatsByTechYesterday } from "@/lib/services/techPerformance";
import { getTechServiceMetrics, computeTechPerformanceScore, roleFor, serviceMetricsFor, getTechScoreWeekAgo } from "@/lib/services/techPerformanceScore";
import { generateManagerAlerts } from "@/lib/services/managerAlerts";
import { getCallAnswerRateTrend, getMissedCallRecoveryStats, getUnreturnedMissedCalls } from "@/lib/services/callActivity";
import { getRemoteSessionCountsYesterday } from "@/lib/services/remoteSessions";
import { getOrgCoachingInsights, getTechCoachingInsights } from "@/lib/services/coaching";
import { buildMorningBrief } from "@/lib/services/morningBrief";
import { getKpiSettings, getTechRoleConfigs } from "@/lib/services/kpiSettings";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import { MorningBriefCard } from "@/components/service-desk/MorningBriefCard";
import { BacklogBreakdownPanel } from "@/components/service-desk/BacklogBreakdownPanel";
import { TechFocusSection } from "@/components/service-desk/TechFocusSection";
import { TechOrgSummaryRow } from "@/components/tech-performance/TechOrgSummaryRow";
import { MissedCallRecoveryPanel } from "@/components/calls/MissedCallRecoveryPanel";
import { InsightCard } from "@/components/service-desk/CoachingSection";

// Huddle Mode — Phase 11. A condensed, read-only view of the same domain
// /tech-performance already covers, suitable for a short morning
// meeting (same "different view of the same domain gets its own page"
// pattern app/inbox/trends/page.tsx already establishes). Deliberately
// does NOT call any sync*/exchange function (syncTicketsFromHalo etc.,
// see app/tech-performance/page.tsx) — this page only reads whatever the
// main page's most recent load already synced, so opening it doesn't
// trigger a second round of external API calls just to display a
// summary. Every section below reuses an existing service/component; the
// only new code is the assembly.
export default async function TechPerformanceHuddlePage() {
  await requireRole("SERVICE_MANAGER");
  // Same error-preserving pattern as app/calls/page.tsx and the main
  // /tech-performance page — a failure here shouldn't look identical to
  // "not connected yet."
  const directoryResult = await getContactDirectory()
    .then((directory) => ({ directory, error: undefined as string | undefined }))
    .catch((err) => ({ directory: null, error: err instanceof Error ? err.message : "Directory lookup failed." }));
  const directory = directoryResult.directory;

  const [
    healthSnapshot,
    healthWeekAgo,
    healthYesterday,
    ticketTrend30Day,
    slaAtRisk,
    backlog,
    staleTickets,
    kpiSettings,
    techRoleConfigs,
    haloCredential,
  ] = await Promise.all([
    getServiceDeskHealthSnapshot(),
    getServiceDeskHealthWeekAgo(),
    getServiceDeskHealthYesterday(),
    getTicketTrend30DayTotal(),
    getSlaAtRiskTickets(),
    getBacklogBreakdown(),
    getStaleTickets(),
    getKpiSettings(),
    getTechRoleConfigs(KNOWN_TECHS),
    prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } }),
  ]);
  // Null when HaloPSA isn't connected yet — TechFocusSection then shows
  // ticket titles as plain text instead of a link, never a guessed URL.
  const instanceUrl = haloCredential?.instanceUrl ?? null;
  const techScoreWeights = {
    serviceDelivery: kpiSettings.techWeightServiceDelivery,
    quality: kpiSettings.techWeightQuality,
    productivity: kpiSettings.techWeightProductivity,
    workManagement: kpiSettings.techWeightWorkManagement,
    phone: kpiSettings.techWeightPhone,
  };

  const [
    { techs, org, todayIndex, lastWeek, lastWeekHoursByPerson },
    serviceMetricsByTech,
    callAnswerRateTrend,
    missedCallStats,
    unreturnedCalls,
    yesterdayHoursByPerson,
    yesterdayCallStatsByPerson,
    yesterdayRemoteSessionsByPerson,
  ] = await Promise.all([
    getTechPerformance(directory),
    getTechServiceMetrics(staleTickets),
    getCallAnswerRateTrend(directory),
    getMissedCallRecoveryStats(directory),
    getUnreturnedMissedCalls(directory),
    getYesterdayHoursByPerson(),
    getCallStatsByTechYesterday(directory),
    getRemoteSessionCountsYesterday(),
  ]);

  // Per-tech mini-stats shown beside each name in Today's Priorities
  // (TechFocusSection) — every source above already reads null/missing
  // as "no data," so a tech with nothing synced for a given stat shows
  // "—" there, never a fabricated 0.
  const techStats = new Map(
    KNOWN_TECHS.map((person) => [
      person,
      {
        lastWeekHours: lastWeekHoursByPerson.get(person) ?? null,
        yesterdayHours: yesterdayHoursByPerson.get(person) ?? null,
        yesterdayInboundCalls: yesterdayCallStatsByPerson.get(person)?.inbound ?? null,
        yesterdayOutboundCalls: yesterdayCallStatsByPerson.get(person)?.outbound ?? null,
        yesterdayRemoteSessions: yesterdayRemoteSessionsByPerson.get(person) ?? null,
      },
    ]),
  );

  const scoreByTech = new Map(
    techs.map((tech) => [
      tech.person as Tech,
      computeTechPerformanceScore(tech, serviceMetricsFor(serviceMetricsByTech, tech.person), roleFor(tech.person, techRoleConfigs), techScoreWeights),
    ]),
  );
  const techScoreWeekAgoByTech = new Map(
    await Promise.all(techs.map(async (tech) => [tech.person as Tech, await getTechScoreWeekAgo(tech.person)] as const)),
  );

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
  const coachingInsights = [
    ...getOrgCoachingInsights(healthSnapshot, healthWeekAgo, callAnswerRateTrend),
    ...techs.flatMap((tech) =>
      getTechCoachingInsights(tech.person, scoreByTech.get(tech.person as Tech)!, techScoreWeekAgoByTech.get(tech.person as Tech) ?? null),
    ),
  ];
  const wins = coachingInsights.filter((i) => i.tone === "positive");

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

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Huddle Mode</h1>
      <p className="mt-1 text-sm text-text-muted">Everything for a short morning meeting, on one screen.</p>

      {directoryResult.error && (
        <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          Directory lookup failed, showing numbers instead: {directoryResult.error}
        </div>
      )}

      <div className="mt-4">
        <MorningBriefCard brief={morningBrief} knownTechs={KNOWN_TECHS} huddleActive />
      </div>

      <div className="mt-6">
        <h2 className="font-display text-sm font-medium text-text-muted">Current Backlog</h2>
        <div className="mt-2">
          <BacklogBreakdownPanel backlog={backlog} staleCount={healthSnapshot.staleCount} />
        </div>
      </div>

      <div className="mt-6">
        <TechFocusSection
          alerts={alerts}
          slaAtRisk={slaAtRisk}
          coachingInsights={coachingInsights}
          knownTechs={KNOWN_TECHS}
          techStats={techStats}
          instanceUrl={instanceUrl}
        />
      </div>

      <div className="mt-6">
        <MissedCallRecoveryPanel stats={missedCallStats} unreturned={unreturnedCalls} />
      </div>

      <div className="mt-6">
        <h2 className="font-display text-sm font-medium text-text-muted">Technician Workload</h2>
        <div className="mt-2">
          <TechOrgSummaryRow org={org} todayIndex={todayIndex} />
        </div>
      </div>

      {wins.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <h2 className="font-display text-sm font-medium text-text-muted">Wins</h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {wins.map((w) => (
              <InsightCard key={w.id} insight={w} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
