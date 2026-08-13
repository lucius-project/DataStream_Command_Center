import Link from "next/link";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import {
  getServiceDeskHealthSnapshot,
  getServiceDeskHealthWeekAgo,
  getServiceDeskHealthYesterday,
  getSlaAtRiskTickets,
} from "@/lib/services/serviceDeskHealth";
import { getBacklogBreakdown, getStaleTickets } from "@/lib/services/operations";
import { getTechPerformance } from "@/lib/services/techPerformance";
import { getTechServiceMetrics, computeTechPerformanceScore, roleFor, serviceMetricsFor, getTechScoreWeekAgo } from "@/lib/services/techPerformanceScore";
import { generateManagerAlerts } from "@/lib/services/managerAlerts";
import { getCallAnswerRateTrend, getMissedCallRecoveryStats, getUnreturnedMissedCalls } from "@/lib/services/callActivity";
import { getOrgCoachingInsights, getTechCoachingInsights } from "@/lib/services/coaching";
import { buildMorningBrief } from "@/lib/services/morningBrief";
import type { Tech } from "@/lib/integrations/halopsa";
import { MorningBriefCard } from "@/components/service-desk/MorningBriefCard";
import { BacklogBreakdownPanel } from "@/components/service-desk/BacklogBreakdownPanel";
import { SlaAtRiskSection } from "@/components/service-desk/SlaAtRiskSection";
import { NeedsAttentionSection } from "@/components/service-desk/NeedsAttentionSection";
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
  const directory = await getContactDirectory().catch(() => null);

  const [healthSnapshot, healthWeekAgo, healthYesterday, slaAtRisk, backlog, staleTickets] = await Promise.all([
    getServiceDeskHealthSnapshot(),
    getServiceDeskHealthWeekAgo(),
    getServiceDeskHealthYesterday(),
    getSlaAtRiskTickets(),
    getBacklogBreakdown(),
    getStaleTickets(),
  ]);

  const [{ techs, org, todayIndex, lastWeek }, serviceMetricsByTech, callAnswerRateTrend, missedCallStats, unreturnedCalls] =
    await Promise.all([
      getTechPerformance(directory),
      getTechServiceMetrics(staleTickets),
      getCallAnswerRateTrend(directory),
      getMissedCallRecoveryStats(directory),
      getUnreturnedMissedCalls(directory),
    ]);

  const scoreByTech = new Map(
    techs.map((tech) => [
      tech.person as Tech,
      computeTechPerformanceScore(tech, serviceMetricsFor(serviceMetricsByTech, tech.person), roleFor(tech.person)),
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
  const criticalAlerts = alerts.filter((a) => a.severity === "CRITICAL");
  const topPriorities = alerts.slice(0, 5);

  const coachingInsights = [
    ...getOrgCoachingInsights(healthSnapshot, healthWeekAgo, callAnswerRateTrend),
    ...techs.flatMap((tech) =>
      getTechCoachingInsights(tech.person, scoreByTech.get(tech.person as Tech)!, techScoreWeekAgoByTech.get(tech.person as Tech) ?? null),
    ),
  ];
  const wins = coachingInsights.filter((i) => i.tone === "positive");

  const morningBrief = buildMorningBrief(
    healthSnapshot.healthScore.score,
    healthYesterday,
    healthSnapshot.responseSla.status === "available" ? healthSnapshot.responseSla.pct : null,
    healthSnapshot.answerRate.status === "available" ? healthSnapshot.answerRate.pct : null,
    alerts,
    coachingInsights,
  );

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold text-text">Huddle Mode</h1>
        <Link href="/tech-performance" className="font-data text-xs text-text-faint hover:underline">
          ← Full Detail
        </Link>
      </div>
      <p className="mt-1 text-sm text-text-muted">Everything for a short morning meeting, on one screen.</p>

      <div className="mt-4">
        <MorningBriefCard brief={morningBrief} />
      </div>

      <div className="mt-6">
        <h2 className="font-display text-sm font-medium text-text-muted">Current Backlog</h2>
        <div className="mt-2">
          <BacklogBreakdownPanel backlog={backlog} staleCount={healthSnapshot.staleCount} />
        </div>
      </div>

      <div className="mt-6">
        <SlaAtRiskSection tickets={slaAtRisk} />
      </div>

      {criticalAlerts.length > 0 && (
        <div className="mt-6">
          <NeedsAttentionSection alerts={criticalAlerts} />
        </div>
      )}

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

      {topPriorities.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <h2 className="font-display text-sm font-medium text-text-muted">Today&apos;s Priorities</h2>
          <ol className="flex flex-col gap-1.5">
            {topPriorities.map((a, i) => (
              <li key={a.id} className="flex items-baseline gap-2 rounded-md border border-border bg-panel p-2.5 text-sm">
                <span className="font-data text-text-faint">{i + 1}.</span>
                <Link href={a.href} className="text-text hover:underline">
                  {a.issue}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
