// Shared data layer behind Huddle Mode's TechFocusSection widget AND the
// per-tech coaching email drafts (app/api/tech-performance/coaching-drafts) —
// both need the exact same "what's on this tech's plate today" computation,
// so it lives here once rather than as a UI-only copy that the email could
// silently drift from. TechFocusSection.tsx imports these for its table;
// the drafts route imports them to build each tech's email body. Neither
// consumer changes what counts or how it's prioritized.

import type { AlertSeverity, ManagerAlert } from "./managerAlerts";
import type { SlaAtRiskTicket } from "./serviceDeskHealth";
import type { CoachingInsight } from "./coaching";
import type { TicketPriority } from "@/app/generated/prisma/client";
import { formatDuration } from "@/lib/dateUtils";
import { matchKnownTech, haloTicketUrl } from "@/lib/integrations/haloShared";
import { bandHigherIsBetter } from "@/lib/kpiStatus";

export const UNASSIGNED = "Unassigned";

// A single priority scale every item type maps onto, so "order the list
// by priority" means something across three genuinely different sources
// instead of three separately-sorted blocks. 0 = drop everything else
// (breached SLA, critical alert), 1 = today's real risk (SLA due soon,
// warning alert), 2 = worth knowing (SLA due later, monitor alert),
// 3 = development, not urgent (training recommendations — a coaching
// note is never more time-sensitive than an actual ticket/SLA problem).
export type Tier = 0 | 1 | 2 | 3;

export const TIER_LABEL: Record<Tier, string> = {
  0: "Critical",
  1: "Warning",
  2: "Monitor",
  3: "Training",
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

export type FocusItem = {
  id: string;
  technician: string;
  tier: Tier;
  badge: string;
  text: string;
  href: string | null;
  priority: TicketPriority | null;
  ticketTitle: string | null;
  ticketUrl: string | null;
  // The next step per DataStream's own Service Desk SOP (Article 48,
  // "When an SLE Is at Risk or Missed" / stale-ticket / unassigned-
  // ticket / missed-call sections) — quoted/adapted from that document,
  // not invented or AI-guessed. null only for Training recommendations,
  // where the coaching statement itself already is the recommendation.
  remediation: string | null;
};

// Straight from the SOP's own "When an SLE Is at Risk or Missed"
// section (Article 48): P1/P2 resolution breaches escalate to Lucius
// with a 30-minute client update; every other breach needs an internal
// note explaining the delay; an approaching-but-not-yet-breached target
// gets a proactive client update instead.
function slaRemediation(overdue: boolean, slaType: SlaAtRiskTicket["slaType"], priority: TicketPriority): string {
  if (!overdue) {
    return "Per SOP: proactively update the client via Email User before the target is missed, with a realistic next update time.";
  }
  if (slaType === "resolution" && (priority === "P1" || priority === "P2")) {
    return "Per SOP: notify Lucius immediately. A client communication must go out within 30 minutes explaining the situation and the plan to resolve. Add an internal note explaining what caused the delay.";
  }
  return "Per SOP: add an internal note explaining what caused the delay, then work the ticket to closure or document clear next steps.";
}

// Straight from the SLA At Risk countdown — not deduped against
// "SLA approaching" alerts because alertFocusItems below drops that
// alert category entirely instead (same underlying fact, would just
// repeat the same line in different words). This is also the only
// source for already-breached tickets, since slaApproachingBreach
// (managerAlerts.ts) deliberately excludes those.
export function slaFocusItems(slaAtRisk: SlaAtRiskTicket[], knownTechs: readonly string[], instanceUrl: string | null): FocusItem[] {
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
      remediation: slaRemediation(overdue, t.slaType, t.priority),
    };
  });
}

// Adapted directly from the SOP's own sections on each of these —
// Priority Order of Work, Stale Tickets, Phone Support (missed calls),
// and Time Expectations — not invented advice. Any alert category not
// explicitly covered by the SOP (team-wide/no-single-tech categories
// like Backlog Growing or Client Ticket Spike, which never reach a
// per-tech email anyway since Unassigned is excluded from drafts) falls
// back to a generic prompt rather than guessing at SOP text that isn't
// there.
const ALERT_REMEDIATION: Record<string, string> = {
  "Unattended priority ticket":
    "Per SOP: phone calls and critical issues come first. Acknowledge and work this ticket now — if it can't be resolved today, add an internal note with clear next steps and flag coverage to the team.",
  "Unassigned priority ticket": "Per SOP: assign this ticket to a technician right away — priority tickets should not sit unassigned.",
  "Missed call not returned":
    "Per SOP: missed calls default to P1 and require a callback to triage. Respond in Teams to confirm you're taking it, then call back as soon as possible.",
  "Stale ticket": "Per SOP: a stale ticket needs to be worked and closed, or have an internal note added with clear next steps.",
  "Technician overloaded": "Flag your workload to the team/manager so tickets can be redistributed.",
  "On-hold tickets accumulating": "Review your on-hold tickets and confirm each is still genuinely waiting on something real, not just parked.",
  "Missing time entries": "Per SOP: log your time for today's work — internal time counts toward your daily target too.",
  "No-charge ticket not marked Low priority":
    "If this work is genuinely non-billable, update the ticket's priority to Low to reflect that.",
};

export function alertFocusItems(alerts: ManagerAlert[], knownTechs: readonly string[]): FocusItem[] {
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
      remediation: ALERT_REMEDIATION[a.category] ?? "Review this item and take appropriate action.",
    }));
}

// "Training recommendations" — improvement-tone Coaching Insights
// (coaching.ts) attributed to a specific technician (subject). Positive-
// tone insights stay in the separate Wins section elsewhere on this
// page; org-level insights (subject "Service Desk") have no single tech
// to attach to, so they're excluded here rather than mis-attributed.
export function trainingFocusItems(coachingInsights: CoachingInsight[], knownTechs: readonly string[]): FocusItem[] {
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
      remediation: null,
    }));
}

// Yesterday's phone/remote activity and last week's logged hours —
// shared by TechFocusSection's per-tech header row AND the coaching
// email's "Yesterday's Numbers" section, same reasoning as everything
// else in this file: one computation, two renderings. null means no
// data synced for that stat, shown as "—", never a fabricated 0.
export type TechStats = {
  lastWeekHours: number | null;
  yesterdayHours: number | null;
  yesterdayInboundCalls: number | null;
  yesterdayOutboundCalls: number | null;
  yesterdayRemoteSessions: number | null;
};

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// A full 8-hour day is the implicit expectation everywhere else hours
// are tracked in this app (expectedWeeklyHours defaults to 40 = 5×8,
// see kpiSettings.ts) — 7+ counts as a full day worked (small buffer for
// rounding/short breaks), 6-7.99 is a partial day worth a quick check,
// under 6 is a real gap worth asking about.
export const YESTERDAY_HOURS_GREEN = 7;
export const YESTERDAY_HOURS_YELLOW = 6;

export type TechFocusGroup = { technician: string; items: FocusItem[] };

// All three sources arrive pre-sorted within their own tier already
// (slaAtRisk by minutesRemaining, alerts by sortAlerts' customer-impact/
// severity rule) — a stable sort by tier alone preserves that relative
// order without inventing a single fabricated score across three
// unrelated units (minutes, severity rank, coaching relevance).
export function groupByTechnician(items: FocusItem[]): TechFocusGroup[] {
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

// Same tier colors as the app's own light theme (app/globals.css) —
// hardcoded hex, not CSS variables, because email clients don't reliably
// support either external stylesheets or custom properties, only inline
// styles. Deliberately the light palette regardless of the recipient's
// own theme preference — an email client has no dark-mode signal this
// code can read, so picking one fixed, readable palette is the only
// honest option.
const TIER_COLORS: Record<Tier, { fg: string; bg: string }> = {
  0: { fg: "#dc2626", bg: "#fef2f2" }, // status-critical
  1: { fg: "#d97706", bg: "#fffbeb" }, // status-warn
  2: { fg: "#2563eb", bg: "#eff6ff" }, // status-info
  3: { fg: "#4f46e5", bg: "#eef2ff" }, // accent
};

// Green added alongside the four tier colors above, for the "Yesterday's
// Numbers" section's hours-logged pill only (bandHigherIsBetter against
// YESTERDAY_HOURS_GREEN/YELLOW) — the priority list itself never uses
// green, since nothing in it is ever "good news" by construction (it's
// the list of things that need attention).
const GREEN = { fg: "#16a34a", bg: "#f0fdf4" };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function badgeHtml(text: string, tier: Tier): string {
  const { fg, bg } = TIER_COLORS[tier];
  return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:${bg};color:${fg};font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;">${escapeHtml(text)}</span>`;
}

function statPillHtml(label: string, value: string, color?: { fg: string; bg: string }): string {
  const style = color
    ? `background:${color.bg};color:${color.fg};`
    : "background:#f4f4f5;color:#18181b;";
  return `
    <td style="padding:4px;">
      <div style="${style}border-radius:6px;padding:8px 10px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.03em;opacity:.75;">${escapeHtml(label)}</div>
        <div style="font-size:15px;font-weight:700;margin-top:2px;">${escapeHtml(value)}</div>
      </div>
    </td>`;
}

// "Yesterday's Numbers" — the same four mini-stats TechFocusSection
// shows beside the tech's name in the UI (hours, inbound/outbound
// calls, remote sessions), reformatted as a small stat strip at the top
// of the email. Shown even when every value is "—" (nothing synced),
// same honesty rule as everywhere else — never a fabricated number.
function statsHtml(stats: TechStats | undefined): string {
  if (!stats) return "";
  let hoursColor: { fg: string; bg: string } | undefined;
  if (stats.yesterdayHours !== null) {
    const band = bandHigherIsBetter(stats.yesterdayHours, YESTERDAY_HOURS_GREEN, YESTERDAY_HOURS_YELLOW);
    hoursColor = band === "green" ? GREEN : band === "yellow" ? TIER_COLORS[1] : TIER_COLORS[0];
  }
  return `
    <h3 style="font-size:13px;color:#52525b;text-transform:uppercase;letter-spacing:.03em;margin:20px 0 8px;">Yesterday's Numbers</h3>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        ${statPillHtml("Hours Logged", stats.yesterdayHours !== null ? `${round1(stats.yesterdayHours)}h` : "—", hoursColor)}
        ${statPillHtml("Inbound Calls", stats.yesterdayInboundCalls !== null ? `${stats.yesterdayInboundCalls}` : "—")}
        ${statPillHtml("Outbound Calls", stats.yesterdayOutboundCalls !== null ? `${stats.yesterdayOutboundCalls}` : "—")}
        ${statPillHtml("Remote Sessions", stats.yesterdayRemoteSessions !== null ? `${stats.yesterdayRemoteSessions}` : "—")}
      </tr>
    </table>`;
}

// HTML rendering for the coaching email drafts — same content, order,
// and tier colors as the tech's table in Huddle Mode, styled inline
// (email clients need inline styles, not classes/stylesheets) since a
// draft the owner reviews and edits is far more useful looking like the
// widget they already recognize than as a flat text list. Structured as
// good-morning greeting -> yesterday's numbers -> priority items with
// SOP remediation -> an appreciative close, per the user's own framing:
// this is meant to help the tech and DataStream do great work, not read
// as a surveillance report. Still just a draft, not a finished,
// unreviewable template — every fact traces straight back to the same
// FocusItem/TechStats the UI renders, and every remediation line is
// adapted from the SOP itself, never invented.
export function formatFocusItemsAsEmailHtml(technician: string, items: FocusItem[], stats: TechStats | undefined): string {
  const rows = items
    .map((item, i) => {
      const priorityHtml = item.priority ? ` <b>[${escapeHtml(item.priority)}]</b>` : "";
      const ticketHtml = item.ticketTitle
        ? `<div style="margin-top:4px;font-size:12px;">${
            item.ticketUrl
              ? `<a href="${escapeHtml(item.ticketUrl)}" style="color:#4f46e5;">${escapeHtml(item.ticketTitle)}</a>`
              : escapeHtml(item.ticketTitle)
          }</div>`
        : "";
      const remediationHtml = item.remediation
        ? `<div style="margin-top:6px;padding:6px 8px;background:#f4f4f5;border-left:3px solid #d4d4d8;font-size:12px;"><b>Coaching:</b> ${escapeHtml(item.remediation)}</div>`
        : "";
      return `
        <tr style="border-top:1px solid #e4e4e7;">
          <td style="padding:8px 10px;vertical-align:top;color:#a1a1aa;font-size:12px;">${i + 1}</td>
          <td style="padding:8px 10px;vertical-align:top;">
            ${badgeHtml(item.badge, item.tier)}${priorityHtml}
            <div style="margin-top:6px;font-size:13px;color:#18181b;">${escapeHtml(item.text)}</div>
            ${ticketHtml}
            ${remediationHtml}
          </td>
        </tr>`;
    })
    .join("");

  const prioritiesHtml =
    items.length > 0
      ? `
      <h3 style="font-size:13px;color:#52525b;text-transform:uppercase;letter-spacing:.03em;margin:20px 0 8px;">Today's Priorities</h3>
      <table style="width:100%;border-collapse:collapse;">
        ${rows}
      </table>`
      : `
      <h3 style="font-size:13px;color:#52525b;text-transform:uppercase;letter-spacing:.03em;margin:20px 0 8px;">Today's Priorities</h3>
      <p style="background:#f0fdf4;color:#16a34a;padding:10px 12px;border-radius:6px;font-size:13px;">Nothing flagged for you today — great work keeping everything on track!</p>`;

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#18181b;max-width:640px;">
      <p>Good morning ${escapeHtml(technician)},</p>
      <p style="color:#52525b;">Hope you're doing well! Here's your quick update for today — yesterday's numbers and anything worth a look before you dive in. We really appreciate the work you put in every day; it's what keeps DataStream's service desk world-class.</p>
      ${statsHtml(stats)}
      ${prioritiesHtml}
      <p style="margin-top:20px;color:#18181b;">Thank you for everything you do for our clients and the team — it doesn't go unnoticed. Keep up the great work!</p>
      <p style="color:#18181b;">— Lucius</p>
      <p style="margin-top:16px;color:#a1a1aa;font-size:11px;">Generated from live HaloPSA data via the DataStream Command Center — review before sending.</p>
    </div>`;
}
