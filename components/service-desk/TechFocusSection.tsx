import type { ManagerAlert } from "@/lib/services/managerAlerts";
import type { SlaAtRiskTicket } from "@/lib/services/serviceDeskHealth";
import type { CoachingInsight } from "@/lib/services/coaching";
import { InfoButton } from "@/components/shared/InfoButton";
import { GenerateCoachingDraftsButton } from "./GenerateCoachingDraftsButton";
import { FocusTable } from "./FocusTable";
import {
  slaFocusItems,
  alertFocusItems,
  trainingFocusItems,
  groupByTechnician,
  round1,
  YESTERDAY_HOURS_GREEN,
  YESTERDAY_HOURS_YELLOW,
  type TechStats,
} from "@/lib/services/techFocus";
import { bandHigherIsBetter, STATUS_TEXT } from "@/lib/kpiStatus";

export type { TechStats };

function MiniStat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded border border-border-strong bg-panel-raised px-2 py-1">
      <span className="font-data text-[8px] tracking-wide text-text-faint uppercase">{label}</span>
      <span className={`font-data text-xs font-semibold ${valueClassName ?? "text-text"}`}>{value}</span>
    </div>
  );
}

function TechStatsRow({ stats }: { stats: TechStats }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <MiniStat label="Last Wk" value={stats.lastWeekHours !== null ? `${round1(stats.lastWeekHours)}h` : "—"} />
      <MiniStat
        label="Yesterday"
        value={stats.yesterdayHours !== null ? `${round1(stats.yesterdayHours)}h` : "—"}
        valueClassName={
          stats.yesterdayHours !== null
            ? STATUS_TEXT[bandHigherIsBetter(stats.yesterdayHours, YESTERDAY_HOURS_GREEN, YESTERDAY_HOURS_YELLOW)]
            : undefined
        }
      />
      <MiniStat label="Inbound" value={stats.yesterdayInboundCalls !== null ? `${stats.yesterdayInboundCalls}` : "—"} />
      <MiniStat label="Outbound" value={stats.yesterdayOutboundCalls !== null ? `${stats.yesterdayOutboundCalls}` : "—"} />
      <MiniStat label="Remote" value={stats.yesterdayRemoteSessions !== null ? `${stats.yesterdayRemoteSessions}` : "—"} />
    </div>
  );
}

// Huddle Mode only — one large widget per technician (plus Unassigned
// for anything with no single owner) instead of three separate sections
// a manager has to cross-reference. Combines SLA At Risk, Needs
// Attention/Manager Alerts, and per-tech Training Recommendations
// (improvement-tone Coaching Insights) into a single priority-ordered
// list per person — a huddle works through people one at a time, so
// "everything for Miguel, worst first" beats three parallel lists that
// all need mentally re-sorting by person anyway. The main
// /tech-performance page keeps its three separate, severity-first
// sections (fits a manager scanning for the worst problem rather than
// working a roster). Item-building/grouping logic lives in
// lib/services/techFocus.ts, shared with the coaching email drafts
// route so both show exactly the same thing.
export function TechFocusSection({
  alerts,
  slaAtRisk,
  coachingInsights,
  knownTechs,
  techStats,
  instanceUrl,
}: {
  alerts: ManagerAlert[];
  slaAtRisk: SlaAtRiskTicket[];
  coachingInsights: CoachingInsight[];
  knownTechs: readonly string[];
  techStats: Map<string, TechStats>;
  instanceUrl: string | null;
}) {
  const items = [
    ...slaFocusItems(slaAtRisk, knownTechs, instanceUrl),
    ...alertFocusItems(alerts, knownTechs),
    ...trainingFocusItems(coachingInsights, knownTechs),
  ];
  const groups = groupByTechnician(items);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <h2 className="font-display text-sm font-medium text-text-muted">Today&apos;s Priorities</h2>
          <InfoButton
            title="Today's Priorities"
            what="Everything worth raising in the huddle, one large widget per technician, ordered worst-first within each: SLA-at-risk tickets, every flagged Manager Alert, and that tech's training recommendations, combined into a single priority-ordered list instead of three separate sections to cross-reference."
            meaning={`${items.length} item${items.length === 1 ? "" : "s"} across ${groups.length} group${groups.length === 1 ? "" : "s"}.`}
            calculation="Priority order: Critical alerts and already-breached SLAs first, then Warning alerts and SLAs due within 60 minutes, then Monitor alerts and SLAs due later, then Training recommendations last (a coaching note is never more urgent than an actual ticket problem). SLA items come straight from the SLA At Risk countdown; alert items are the same rule-based Manager Alerts checks used elsewhere, minus the 'SLA approaching' category (generated from the same SLA At Risk list, so including it again would repeat the same fact). Training recommendations are improvement-tone Coaching Insights attributed to that technician. Items with no single technician (unassigned tickets, team-wide alerts) are grouped under Unassigned, shown last. The small stats beside each name (Last Wk / Yesterday hours, Inbound / Outbound calls, Remote sessions) are context, not priority items — a dash means nothing synced for that stat, never a fabricated zero. Yesterday's hours is colored: 7+ green, 6-7.99 yellow, below 6 red."
          />
        </span>
        <GenerateCoachingDraftsButton />
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          Nothing needs attention right now.
        </div>
      ) : (
        groups.map(({ technician, items: techItems }) => {
          const stats = techStats.get(technician);
          return (
            <div key={technician} className="rounded-lg border border-border bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-text">{technician}</h3>
                  {stats && <TechStatsRow stats={stats} />}
                </div>
                <span className="shrink-0 font-data text-xs text-text-faint">
                  {techItems.length} item{techItems.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3">
                <FocusTable items={techItems} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
