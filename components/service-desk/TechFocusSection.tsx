import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { AlertSeverity, ManagerAlert } from "@/lib/services/managerAlerts";
import type { SlaAtRiskTicket } from "@/lib/services/serviceDeskHealth";
import type { CoachingInsight } from "@/lib/services/coaching";
import type { TicketPriority } from "@/app/generated/prisma/client";
import { PriorityBadge } from "@/components/operations/PriorityBadge";
import { InfoButton } from "@/components/shared/InfoButton";
import { formatDuration } from "@/lib/dateUtils";
import { matchKnownTech, haloTicketUrl } from "@/lib/integrations/haloShared";
import { bandHigherIsBetter, STATUS_TEXT } from "@/lib/kpiStatus";

const UNASSIGNED = "Unassigned";

// A single priority scale every item type maps onto, so "order the list
// by priority" means something across three genuinely different sources
// instead of three separately-sorted blocks. 0 = drop everything else
// (breached SLA, critical alert), 1 = today's real risk (SLA due soon,
// warning alert), 2 = worth knowing (SLA due later, monitor alert),
// 3 = development, not urgent (training recommendations — a coaching
// note is never more time-sensitive than an actual ticket/SLA problem).
type Tier = 0 | 1 | 2 | 3;

const TIER_BADGE_CLASS: Record<Tier, string> = {
  0: "border-status-critical/40 bg-status-critical-dim text-status-critical",
  1: "border-status-warn/40 bg-status-warn-dim text-status-warn",
  2: "border-status-info/40 bg-status-info-dim text-status-info",
  3: "border-accent/40 bg-accent-dim text-accent",
};

const SEVERITY_TIER: Record<AlertSeverity, Tier> = { CRITICAL: 0, WARNING: 1, MONITOR: 2 };

const SLA_TYPE_LABEL: Record<SlaAtRiskTicket["slaType"], string> = {
  response: "Response SLA",
  resolution: "Resolution SLA",
};

// Same 60-minute "due soon" cutoff SlaAtRiskSection.tsx already uses for
// its own warn-vs-default styling — one definition of "soon," not two.
const SLA_DUE_SOON_MINUTES = 60;

// TicketSnapshot.assignedTech (and ManagerAlert.technician, which is
// read straight from it) carries HaloPSA's raw agent name — e.g. "Cameron
// Clark" — while KNOWN_TECHS, TechPerformance.person, and Coaching
// Insight subjects all use the short canonical form ("Cameron"). Without
// normalizing here, the same person would silently split across two
// group keys (a ticket-derived "Cameron Clark" card with none of that
// tech's Training recommendations or per-tech stats, which are keyed by
// "Cameron") — this is the same matchKnownTech fuzzy-match every other
// tech-attribution path in this app already goes through, not a new
// rule invented for this component.
function normalizeTechnician(raw: string, knownTechs: readonly string[]): string {
  return matchKnownTech(raw, knownTechs) ?? raw;
}

// Yesterday's phone/remote activity and last week's logged hours — pure
// context alongside the priority list, not itself a priority item (no
// tier, no card). null means no data synced for that stat, shown as
// "—", never a fabricated 0 (see huddle/page.tsx's own comment on this).
export type TechStats = {
  lastWeekHours: number | null;
  yesterdayHours: number | null;
  yesterdayInboundCalls: number | null;
  yesterdayOutboundCalls: number | null;
  yesterdayRemoteSessions: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// A full 8-hour day is the implicit expectation everywhere else hours
// are tracked in this app (expectedWeeklyHours defaults to 40 = 5×8,
// see kpiSettings.ts) — 7+ counts as a full day worked (small buffer for
// rounding/short breaks), 6-7.99 is a partial day worth a quick check,
// under 6 is a real gap worth asking about in the huddle.
const YESTERDAY_HOURS_GREEN = 7;
const YESTERDAY_HOURS_YELLOW = 6;

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

type FocusItem = {
  id: string;
  technician: string;
  tier: Tier;
  badge: string;
  text: string;
  href: string | null;
  priority: TicketPriority | null;
  ticketTitle: string | null;
  ticketUrl: string | null;
};

// Straight from the SLA At Risk countdown — not deduped against
// "SLA approaching" alerts because alertFocusItems below drops that
// alert category entirely instead (same underlying fact, would just
// repeat the same line in different words). This is also the only
// source for already-breached tickets, since slaApproachingBreach
// (managerAlerts.ts) deliberately excludes those.
function slaFocusItems(slaAtRisk: SlaAtRiskTicket[], knownTechs: readonly string[], instanceUrl: string | null): FocusItem[] {
  return slaAtRisk.map((t) => {
    const overdue = t.minutesRemaining < 0;
    const duration = formatDuration(Math.abs(t.minutesRemaining));
    const tier: Tier = overdue ? 0 : t.minutesRemaining <= SLA_DUE_SOON_MINUTES ? 1 : 2;
    return {
      id: `sla-${t.id}-${t.slaType}`,
      technician: normalizeTechnician(t.assignedTech, knownTechs),
      tier,
      badge: SLA_TYPE_LABEL[t.slaType],
      text: overdue ? `Breached ${duration} ago` : `Due in ${duration}`,
      href: "/operations",
      priority: t.priority,
      ticketTitle: t.summary,
      ticketUrl: instanceUrl ? haloTicketUrl(instanceUrl, t.haloTicketId) : null,
    };
  });
}

function alertFocusItems(alerts: ManagerAlert[], knownTechs: readonly string[]): FocusItem[] {
  return alerts
    .filter((a) => a.category !== "SLA approaching")
    .map((a) => ({
      id: a.id,
      technician: a.technician ? normalizeTechnician(a.technician, knownTechs) : UNASSIGNED,
      tier: SEVERITY_TIER[a.severity],
      badge: a.category,
      text: a.issue,
      href: a.href,
      priority: a.priority,
      ticketTitle: a.ticketTitle,
      ticketUrl: a.ticketUrl,
    }));
}

// "Training recommendations" — improvement-tone Coaching Insights
// (coaching.ts) attributed to a specific technician (subject). Positive-
// tone insights stay in the separate Wins section elsewhere on this
// page; org-level insights (subject "Service Desk") have no single tech
// to attach to, so they're excluded here rather than mis-attributed.
function trainingFocusItems(coachingInsights: CoachingInsight[], knownTechs: readonly string[]): FocusItem[] {
  const techSet = new Set(knownTechs);
  return coachingInsights
    .filter((i) => i.tone === "improvement" && techSet.has(i.subject))
    .map((i) => ({
      id: i.id,
      technician: i.subject,
      tier: 3 as const,
      badge: "Training",
      text: i.statement,
      href: i.href ?? null,
      priority: null,
      ticketTitle: null,
      ticketUrl: null,
    }));
}

// All three sources arrive pre-sorted within their own tier already
// (slaAtRisk by minutesRemaining, alerts by sortAlerts' customer-impact/
// severity rule) — a stable sort by tier alone preserves that relative
// order without inventing a single fabricated score across three
// unrelated units (minutes, severity rank, coaching relevance).
function groupByTechnician(items: FocusItem[]) {
  const map = new Map<string, FocusItem[]>();
  for (const item of items) {
    if (!map.has(item.technician)) map.set(item.technician, []);
    map.get(item.technician)!.push(item);
  }
  return [...map.entries()]
    .map(([technician, techItems]) => ({
      technician,
      items: [...techItems].sort((a, b) => a.tier - b.tier),
    }))
    .sort((a, b) => {
      const aUnassigned = a.technician === UNASSIGNED ? 1 : 0;
      const bUnassigned = b.technician === UNASSIGNED ? 1 : 0;
      if (aUnassigned !== bUnassigned) return aUnassigned - bUnassigned;
      return b.items.length - a.items.length;
    });
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
// working a roster).
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
      <span className="flex items-center gap-1.5">
        <h2 className="font-display text-sm font-medium text-text-muted">Today&apos;s Priorities</h2>
        <InfoButton
          title="Today's Priorities"
          what="Everything worth raising in the huddle, one large widget per technician, ordered worst-first within each: SLA-at-risk tickets, every flagged Manager Alert, and that tech's training recommendations, combined into a single priority-ordered list instead of three separate sections to cross-reference."
          meaning={`${items.length} item${items.length === 1 ? "" : "s"} across ${groups.length} group${groups.length === 1 ? "" : "s"}.`}
          calculation="Priority order: Critical alerts and already-breached SLAs first, then Warning alerts and SLAs due within 60 minutes, then Monitor alerts and SLAs due later, then Training recommendations last (a coaching note is never more urgent than an actual ticket problem). SLA items come straight from the SLA At Risk countdown; alert items are the same rule-based Manager Alerts checks used elsewhere, minus the 'SLA approaching' category (generated from the same SLA At Risk list, so including it again would repeat the same fact). Training recommendations are improvement-tone Coaching Insights attributed to that technician. Items with no single technician (unassigned tickets, team-wide alerts) are grouped under Unassigned, shown last. The small stats beside each name (Last Wk / Yesterday hours, Inbound / Outbound calls, Remote sessions) are context, not priority items — a dash means nothing synced for that stat, never a fabricated zero. Yesterday's hours is colored: 7+ green, 6-7.99 yellow, below 6 red."
        />
      </span>
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
