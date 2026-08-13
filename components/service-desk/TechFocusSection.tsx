import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ManagerAlert } from "@/lib/services/managerAlerts";
import type { SlaAtRiskTicket } from "@/lib/services/serviceDeskHealth";
import type { CoachingInsight } from "@/lib/services/coaching";
import { PriorityBadge } from "@/components/operations/PriorityBadge";
import { InfoButton } from "@/components/shared/InfoButton";
import { GenerateCoachingDraftsButton } from "./GenerateCoachingDraftsButton";
import {
  slaFocusItems,
  alertFocusItems,
  trainingFocusItems,
  groupByTechnician,
  round1,
  YESTERDAY_HOURS_GREEN,
  YESTERDAY_HOURS_YELLOW,
  type FocusItem,
  type Tier,
  type TechStats,
} from "@/lib/services/techFocus";
import { bandHigherIsBetter, STATUS_TEXT } from "@/lib/kpiStatus";

export type { TechStats };

const TIER_BADGE_CLASS: Record<Tier, string> = {
  0: "border-status-critical/40 bg-status-critical-dim text-status-critical",
  1: "border-status-warn/40 bg-status-warn-dim text-status-warn",
  2: "border-status-info/40 bg-status-info-dim text-status-info",
  3: "border-accent/40 bg-accent-dim text-accent",
};

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

// Same table convention as ManagerActionQueue.tsx (columns, border-t
// rows, font-data text-xs) — this app's one existing "spreadsheet list"
// precedent, reused here rather than a second, differently-styled table.
// Description and Ticket are separate <td> cells (not one nested inside
// the other) — a <table> cell boundary already keeps their two links
// from ever nesting, the same invalid-HTML trap the earlier card layout
// hit when both links shared one container.
function FocusTableRow({ item, rank }: { item: FocusItem; rank: number }) {
  return (
    <tr className="border-t border-border text-text">
      <td className="py-1.5 pr-3 pl-3 text-text-faint">{rank}</td>
      <td className="py-1.5 pr-3">{item.priority ? <PriorityBadge priority={item.priority} /> : <span className="text-text-faint">—</span>}</td>
      <td className="py-1.5 pr-3">
        {item.ticketTitle ? (
          item.ticketUrl ? (
            <a
              href={item.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 truncate text-accent hover:underline"
            >
              <ExternalLink size={11} className="shrink-0" />
              <span className="truncate">{item.ticketTitle}</span>
            </a>
          ) : (
            <span className="truncate text-text-faint">{item.ticketTitle}</span>
          )
        ) : (
          <span className="text-text-faint">—</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-text">
        {item.href ? (
          <Link href={item.href} className="hover:underline">
            {item.text}
          </Link>
        ) : (
          item.text
        )}
      </td>
      <td className="py-1.5 pr-3">
        {/* No whitespace-nowrap/truncate here on purpose — this column
            is deliberately narrow, so a long category name (e.g.
            "Utilization outside expected range") wraps across a couple
            lines instead of forcing the column wide or losing text to
            an ellipsis. Ticket/Breach are the columns meant to carry
            the reading width. */}
        <span
          className={`inline-block rounded border px-1 py-0.5 font-data text-[9px] font-semibold tracking-wide uppercase ${TIER_BADGE_CLASS[item.tier]}`}
        >
          {item.badge}
        </span>
      </td>
    </tr>
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
                  <span className="font-display text-base font-semibold text-text">{technician}</span>
                  {stats && <TechStatsRow stats={stats} />}
                </div>
                <span className="shrink-0 font-data text-xs text-text-faint">
                  {techItems.length} item{techItems.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                {/* table-fixed + an explicit colgroup, not auto-sized
                    columns — every tech's table is otherwise a separate
                    <table> that sizes its own columns off its own
                    content, so "#" or "Ticket" could land at a different
                    width per tech even though they're meant to line up
                    as one consistent look across the whole section. */}
                <table className="w-full min-w-[720px] table-fixed text-left font-data text-xs">
                  <colgroup>
                    {/* #, Priority, Type kept as narrow as their content
                        allows; Ticket and Breach get the rest of the
                        width — those two are what actually needs to be
                        read at a glance. */}
                    <col className="w-8" />
                    <col className="w-11" />
                    <col className="w-[36%]" />
                    <col className="w-[38%]" />
                    <col className="w-20" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border text-text-faint">
                      <th className="py-1.5 pr-3 pl-3 font-normal">#</th>
                      <th className="py-1.5 pr-3 font-normal">Priority</th>
                      <th className="py-1.5 pr-3 font-normal">Ticket</th>
                      <th className="py-1.5 pr-3 font-normal">Breach</th>
                      <th className="py-1.5 pr-3 font-normal">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techItems.map((item, i) => (
                      <FocusTableRow key={item.id} item={item} rank={i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
