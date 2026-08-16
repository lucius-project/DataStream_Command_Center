// Manager Exception Engine — Level 2 of the /tech-performance rebuild
// (Phase 5). Deterministic, DB-only rules reading already-trusted
// metrics computed elsewhere in this app (Service Desk Health, Tech
// Performance, Call Activity) — this file interprets those signals into
// plain-English alerts, it never recomputes a core KPI itself. Every
// alert here is backed by a real query result, nothing inferred or
// guessed; anything not confidently buildable from real data (reopen
// rate, FTR decline — both need HaloPSA's per-ticket Actions history)
// is left out rather than faked. One narrow, deliberate exception:
// noChargeTicketNotLowPriority below does fetch per-ticket Actions
// (via noChargeTickets.ts), scoped tightly to yesterday's active
// tickets only — see that file's own header for the cost/rate-limit
// reasoning that keeps this the exception, not the pattern.

import { prisma } from "@/lib/prisma";
import { isBusinessHours, formatDuration } from "@/lib/dateUtils";
import { haloTicketUrl } from "@/lib/integrations/haloShared";
import { PROJECT_TICKET_TYPE_IDS } from "@/lib/integrations/halopsa";
import type { ContactDirectory } from "@/lib/integrations/contactDirectory";
import type { TicketPriority } from "@/app/generated/prisma/client";
import { getTechActionableTickets, getStaleTickets } from "./operations";
import { getUnreturnedMissedCalls } from "./callActivity";
import { getNoChargeTicketsYesterday } from "./noChargeTickets";
import type { ServiceDeskHealthSnapshot, SlaAtRiskTicket } from "./serviceDeskHealth";
import type { TechPerformance, TechOrgSummary, TechOrgLastWeek } from "./techPerformance";

export type AlertSeverity = "CRITICAL" | "WARNING" | "MONITOR";

export type ManagerAlert = {
  id: string;
  severity: AlertSeverity;
  category: string;
  issue: string;
  client: string | null;
  reference: string; // ticket id, call description, or tech name
  technician: string | null;
  // Ticket priority, when this alert is about a specific ticket — used
  // as a sort tiebreaker (see sortAlerts). null for tech/team-level
  // alerts (overload, backlog, phone trend, etc.) that have no ticket.
  priority: TicketPriority | null;
  ageMinutes: number | null;
  slaRisk: string | null;
  recommendedAction: string;
  href: string;
  // Used only for sort priority within a severity tier — 1 = affects a
  // customer directly (a specific client's ticket/call), 0 = internal
  // (team workload/capacity). Not shown in the UI.
  customerImpact: 0 | 1;
  // Real ticket title (TicketSnapshot.summary) and a direct link into the
  // HaloPSA web portal (haloTicketUrl) — populated only for the 4 alert
  // types that are actually about one specific ticket (p1p2Unattended,
  // priorityUnassigned, slaApproachingBreach, staleTicketAlerts); null for
  // every team/tech-level alert that has no single ticket to link to.
  // ticketUrl is also null if no HaloPSA credential is connected yet (no
  // instanceUrl to build a link from) — never a guessed/broken URL.
  ticketTitle: string | null;
  ticketUrl: string | null;
};

const P1P2_UNATTENDED_MINUTES = 30;
const ON_HOLD_PER_TECH_THRESHOLD = 3;
const CLIENT_SPIKE_THRESHOLD = 3;
const OVERLOAD_MIN_DELTA = 3; // must be at least this many tickets above median to flag
const OVERLOAD_RATIO = 1.5;
const PICKUP_RATE_DECLINE_PTS = 5;
const MISSING_TIME_CHECK_AFTER_HOUR = 13; // don't flag "0h logged" before early afternoon

// Project/Project Task tickets (PROJECT_TICKET_TYPE_IDS, halopsa.ts)
// live in their own project workflow, not the service desk queue these
// alert rules are tuned for — excluded from every ticket-based alert
// below. Filtered here (per alert generator), not by changing the
// shared fetchers (getTechActionableTickets/getStaleTickets/
// getSlaAtRiskTickets) themselves, since those are also read by other
// pages (Dispatch, SLA At Risk section, Tech Performance scoring) that
// should keep seeing every ticket type.
function isProjectTicket(ticketTypeId: number | null): boolean {
  return ticketTypeId !== null && PROJECT_TICKET_TYPE_IDS.has(ticketTypeId);
}

function priorityWeight(p: TicketPriority): number {
  return p === "P1" ? 0 : p === "P2" ? 1 : p === "P3" ? 2 : 3;
}

// CRITICAL: a P1/P2 ticket a technician owns the next action on with no
// recorded update in P1P2_UNATTENDED_MINUTES — the spec's own example
// ("P1 ticket has received no action for 28 minutes") is a far tighter
// window than the existing >24h SLA_BREACH AttentionFlag on Command
// Flow, which this is deliberately separate from (see this file's
// header comment).
async function p1p2Unattended(instanceUrl: string | null): Promise<ManagerAlert[]> {
  const now = new Date();
  const tickets = await getTechActionableTickets();
  const alerts: ManagerAlert[] = [];
  for (const t of tickets) {
    if (isProjectTicket(t.ticketTypeId)) continue;
    if (t.priority !== "P1" && t.priority !== "P2") continue;
    const minutesSince = Math.round((now.getTime() - (t.lastActionAt ?? t.openedAt).getTime()) / 60000);
    if (minutesSince < P1P2_UNATTENDED_MINUTES) continue;
    alerts.push({
      id: `p1p2-unattended-${t.id}`,
      severity: "CRITICAL",
      category: "Unattended priority ticket",
      issue: `${t.priority} ticket has received no action for ${formatDuration(minutesSince)}.`,
      client: t.clientName,
      reference: t.haloTicketId,
      technician: t.assignedTech,
      priority: t.priority,
      ageMinutes: minutesSince,
      slaRisk: t.respondByAt ? slaRiskText(t.respondByAt, t.respondedAt) : null,
      recommendedAction: `Check in with ${t.assignedTech} on ${t.haloTicketId}.`,
      href: "/tech-performance",
      customerImpact: 1,
      ticketTitle: t.summary,
      ticketUrl: instanceUrl ? haloTicketUrl(instanceUrl, t.haloTicketId) : null,
    });
  }
  return alerts;
}

// CRITICAL: a P1/P2 ticket nobody owns yet.
async function priorityUnassigned(instanceUrl: string | null): Promise<ManagerAlert[]> {
  const tickets = await prisma.ticketSnapshot.findMany({
    where: {
      assignedTech: "Unassigned",
      priority: { in: ["P1", "P2"] },
      ticketTypeId: { notIn: [...PROJECT_TICKET_TYPE_IDS] },
    },
  });
  return tickets.map((t) => ({
    id: `unassigned-${t.id}`,
    severity: "CRITICAL",
    category: "Unassigned priority ticket",
    issue: `${t.priority} ticket for ${t.clientName ?? "an unresolved client"} has no technician assigned.`,
    client: t.clientName,
    reference: t.haloTicketId,
    technician: null,
    priority: t.priority,
    ageMinutes: Math.round((Date.now() - t.openedAt.getTime()) / 60000),
    slaRisk: t.respondByAt ? slaRiskText(t.respondByAt, t.respondedAt) : null,
    recommendedAction: `Assign ${t.haloTicketId} to a technician.`,
    href: "/tech-performance",
    customerImpact: 1,
    ticketTitle: t.summary,
    ticketUrl: instanceUrl ? haloTicketUrl(instanceUrl, t.haloTicketId) : null,
  }));
}

// CRITICAL when the caller resolved to a known client (a real customer,
// not just an arbitrary number), WARNING otherwise — same evidence
// standard as everywhere else in this app: a confirmed customer contact
// is a stronger signal than an unresolved number that could be a wrong
// number, spam, or a non-customer.
async function missedCallNotReturned(directory: ContactDirectory | null): Promise<ManagerAlert[]> {
  const unreturned = await getUnreturnedMissedCalls(directory);
  return unreturned.map((c) => ({
    id: `unreturned-${c.id}`,
    severity: c.companyName ? "CRITICAL" : "WARNING",
    category: "Missed call not returned",
    issue: `${c.companyName ?? "A caller"} has not been called back — missed ${c.minutesSinceMissed} minutes ago.`,
    client: c.companyName,
    reference: `Call from ${c.externalNumber}`,
    technician: null,
    priority: null,
    ageMinutes: c.minutesSinceMissed,
    slaRisk: null,
    recommendedAction: `Call ${c.companyName ?? c.externalNumber} back.`,
    href: "/calls",
    customerImpact: 1,
    ticketTitle: null,
    ticketUrl: null,
  }));
}

function slaRiskText(dueAt: Date, respondedAt: Date | null): string {
  if (respondedAt) return "Response already recorded";
  const minutes = Math.round((dueAt.getTime() - Date.now()) / 60000);
  if (minutes < 0) return `Response SLA breached ${Math.abs(minutes)}m ago`;
  return `Response SLA due in ${minutes}m`;
}

// WARNING: response or resolution deadline inside the at-risk window —
// same list as the dedicated SLA At Risk section (see
// serviceDeskHealth.ts's getSlaAtRiskTickets), surfaced here too so it
// participates in the unified severity-sorted queue. Already-breached
// entries (negative minutesRemaining) are excluded here — those are
// covered by p1p2Unattended/the existing SLA_BREACH flag, not
// duplicated as a second "approaching" warning.
function slaApproachingBreach(slaAtRisk: SlaAtRiskTicket[], instanceUrl: string | null): ManagerAlert[] {
  return slaAtRisk
    .filter((t) => t.minutesRemaining >= 0 && !isProjectTicket(t.ticketTypeId))
    .map((t) => ({
      id: `sla-risk-${t.id}-${t.slaType}`,
      severity: "WARNING" as const,
      category: "SLA approaching",
      issue: `${t.clientName ?? t.haloTicketId}'s ${t.slaType} SLA is due in ${t.minutesRemaining} minutes.`,
      client: t.clientName,
      reference: t.haloTicketId,
      technician: t.assignedTech,
      priority: t.priority,
      ageMinutes: null,
      slaRisk: `${t.minutesRemaining}m remaining`,
      recommendedAction: `Prioritize ${t.haloTicketId} before its ${t.slaType} deadline.`,
      href: "/tech-performance",
      customerImpact: 1,
      ticketTitle: t.summary,
      ticketUrl: instanceUrl ? haloTicketUrl(instanceUrl, t.haloTicketId) : null,
    }));
}

// WARNING: reuses getStaleTickets (operations.ts) — a tech-actionable
// ticket with no update in >24 business hours.
async function staleTicketAlerts(instanceUrl: string | null): Promise<ManagerAlert[]> {
  const stale = await getStaleTickets();
  return stale
    .filter((t) => !isProjectTicket(t.ticketTypeId))
    .map((t) => ({
    id: `stale-${t.id}`,
    severity: "WARNING" as const,
    category: "Stale ticket",
    issue: `${t.haloTicketId} has had no update in ${Math.round(t.businessHoursSinceAction)} business hours.`,
    client: t.clientName,
    reference: t.haloTicketId,
    technician: t.assignedTech,
    priority: t.priority,
    ageMinutes: null,
    slaRisk: null,
    recommendedAction: `Follow up on ${t.haloTicketId}.`,
    href: "/tech-performance",
    customerImpact: 1,
    ticketTitle: t.summary,
    ticketUrl: instanceUrl ? haloTicketUrl(instanceUrl, t.haloTicketId) : null,
  }));
}

// A ticket with a visible no-charge ("actisbillable: false") time entry
// logged yesterday, whose priority isn't already P4/Low — per the SOP's
// own spirit, genuinely no-charge work should be triaged Low; if it
// isn't, that's worth a manager's attention. See noChargeTickets.ts for
// why this check is scoped to yesterday's active tickets and why it can
// only under-flag, never wrongly flag, a ticket.
async function noChargeTicketNotLowPriority(instanceUrl: string | null): Promise<ManagerAlert[]> {
  const tickets = await getNoChargeTicketsYesterday();
  return tickets.map((t) => ({
    id: `no-charge-${t.id}`,
    severity: "WARNING" as const,
    category: "No-charge ticket not marked Low priority",
    issue: `${t.haloTicketId} has a no-charge time entry logged yesterday but is priority ${t.priority}, not Low.`,
    client: t.clientName,
    reference: t.haloTicketId,
    technician: t.assignedTech,
    priority: t.priority,
    ageMinutes: null,
    slaRisk: null,
    recommendedAction: `If ${t.haloTicketId} is genuinely non-billable, update its priority to Low.`,
    href: "/tech-performance",
    customerImpact: 0,
    ticketTitle: t.summary,
    ticketUrl: instanceUrl ? haloTicketUrl(instanceUrl, t.haloTicketId) : null,
  }));
}

// WARNING: a tech carrying meaningfully more open tickets than the team
// median — both an absolute floor (OVERLOAD_MIN_DELTA) and a ratio
// (OVERLOAD_RATIO) must be met, so a median of 2 doesn't flag someone
// with 4 tickets as "overloaded."
function technicianOverloaded(techs: TechPerformance[]): ManagerAlert[] {
  if (techs.length < 2) return [];
  const counts = techs.map((t) => t.openCount).sort((a, b) => a - b);
  const mid = Math.floor(counts.length / 2);
  const median = counts.length % 2 === 0 ? (counts[mid - 1] + counts[mid]) / 2 : counts[mid];
  if (median <= 0) return [];

  return techs
    .filter((t) => t.openCount - median >= OVERLOAD_MIN_DELTA && t.openCount >= median * OVERLOAD_RATIO)
    .map((t) => ({
      id: `overload-${t.person}`,
      severity: "WARNING" as const,
      category: "Technician overloaded",
      issue: `${t.person} owns ${t.openCount} open tickets versus a team median of ${median}.`,
      client: null,
      reference: t.person,
      technician: t.person,
      priority: null,
      ageMinutes: null,
      slaRisk: null,
      recommendedAction: `Review ${t.person}'s queue for reassignment.`,
      href: "/tech-performance",
      customerImpact: 0,
      ticketTitle: null,
      ticketUrl: null,
    }));
}

// WARNING: net ticket change losing ground today (see
// serviceDeskHealth.ts's getNetTicketChange).
function backlogGrowing(health: ServiceDeskHealthSnapshot): ManagerAlert[] {
  if (health.netTicketChange.label !== "LOSING_GROUND") return [];
  const n = health.netTicketChange;
  return [
    {
      id: "backlog-growing",
      severity: "WARNING",
      category: "Backlog growing",
      issue: `Backlog is losing ground today — ${n.createdToday} created vs ${n.closedToday} closed.`,
      client: null,
      reference: "Team backlog",
      technician: null,
      priority: null,
      ageMinutes: null,
      slaRisk: null,
      recommendedAction: "Review dispatch priorities or reassign capacity.",
      href: "/tech-performance",
      customerImpact: 0,
      ticketTitle: null,
      ticketUrl: null,
    },
  ];
}

// WARNING: a tech carrying several on-hold tickets — not a red flag by
// itself (on-hold is often waiting on a vendor/part, not the tech's
// fault), but worth a manager's visibility if it's piling up on one person.
function excessiveOnHold(techs: TechPerformance[]): ManagerAlert[] {
  return techs
    .filter((t) => t.onHoldCount >= ON_HOLD_PER_TECH_THRESHOLD)
    .map((t) => ({
      id: `onhold-${t.person}`,
      severity: "WARNING" as const,
      category: "On-hold tickets accumulating",
      issue: `${t.person} has ${t.onHoldCount} tickets on hold.`,
      client: null,
      reference: t.person,
      technician: t.person,
      priority: null,
      ageMinutes: null,
      slaRisk: null,
      recommendedAction: `Check whether ${t.person}'s on-hold tickets are still waiting on something real.`,
      href: "/tech-performance",
      customerImpact: 0,
      ticketTitle: null,
      ticketUrl: null,
    }));
}

// WARNING: a tech with zero hours logged today, checked only after
// MISSING_TIME_CHECK_AFTER_HOUR local time (so this doesn't false-alarm
// at 9am) and only on a day that's actually a business day.
function missingTimeEntries(techs: TechPerformance[], todayIndex: number): ManagerAlert[] {
  const now = new Date();
  if (!isBusinessHours(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0))) return [];
  if (now.getHours() < MISSING_TIME_CHECK_AFTER_HOUR) return [];

  return techs
    .filter((t) => (t.dailyHours[todayIndex] ?? 0) === 0)
    .map((t) => ({
      id: `missing-time-${t.person}`,
      severity: "WARNING" as const,
      category: "Missing time entries",
      issue: `${t.person} has 0 hours logged today.`,
      client: null,
      reference: t.person,
      technician: t.person,
      priority: null,
      ageMinutes: null,
      slaRisk: null,
      recommendedAction: `Confirm ${t.person} is logging time as they work.`,
      href: "/tech-performance",
      customerImpact: 0,
      ticketTitle: null,
      ticketUrl: null,
    }));
}

// WARNING: a client opening several tickets today — a fixed threshold
// rather than a historical-baseline comparison, since this app doesn't
// yet have enough per-client daily history to know what's "normal" for
// a given client (see the discovery report's recommended daily-snapshot
// tables, not yet built).
async function clientTicketSpike(): Promise<ManagerAlert[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tickets = await prisma.ticketSnapshot.findMany({
    where: {
      openedAt: { gte: today },
      clientName: { not: null },
      ticketTypeId: { notIn: [...PROJECT_TICKET_TYPE_IDS] },
    },
    select: { clientName: true },
  });
  const counts = new Map<string, number>();
  for (const t of tickets) {
    if (!t.clientName) continue;
    counts.set(t.clientName, (counts.get(t.clientName) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= CLIENT_SPIKE_THRESHOLD)
    .map(([client, count]) => ({
      id: `spike-${client}`,
      severity: "WARNING" as const,
      category: "Client ticket spike",
      issue: `${client} has opened ${count} tickets today.`,
      client,
      reference: client,
      technician: null,
      priority: null,
      ageMinutes: null,
      slaRisk: null,
      recommendedAction: `Check whether ${client} has an underlying incident (e.g. a shared outage).`,
      href: "/tech-performance",
      customerImpact: 1,
      ticketTitle: null,
      ticketUrl: null,
    }));
}

// MONITOR: this week's inbound pickup rate below last week's by more
// than PICKUP_RATE_DECLINE_PTS — reuses the same week-over-week figures
// already computed for Tech Performance's org KPI strip, not a new
// calculation.
function phoneAnswerRateDeclining(org: TechOrgSummary, lastWeek: TechOrgLastWeek): ManagerAlert[] {
  if (org.pickupRate === null || lastWeek.pickupRate === null) return [];
  const deltaPts = (org.pickupRate - lastWeek.pickupRate) * 100;
  if (deltaPts >= -PICKUP_RATE_DECLINE_PTS) return [];
  return [
    {
      id: "pickup-declining",
      severity: "MONITOR",
      category: "Phone answer rate declining",
      issue: `Pickup rate is ${Math.round(org.pickupRate * 100)}% this week, down ${Math.abs(Math.round(deltaPts))}pts from last week.`,
      client: null,
      reference: "Team phone coverage",
      technician: null,
      priority: null,
      ageMinutes: null,
      slaRisk: null,
      recommendedAction: "Review phone coverage scheduling.",
      href: "/calls",
      customerImpact: 0,
      ticketTitle: null,
      ticketUrl: null,
    },
  ];
}

// MONITOR: team utilization pace outside the healthy 50-110% band — same
// band paceSeverity already uses elsewhere (hoursSeverity.ts), read here
// rather than recomputed.
function utilizationOutsideRange(org: TechOrgSummary, expectedHoursToDate: number): ManagerAlert[] {
  if (expectedHoursToDate <= 0) return [];
  const pct = (org.loggedHours / expectedHoursToDate) * 100;
  if (pct >= 50 && pct <= 110) return [];
  return [
    {
      id: "utilization-outside-range",
      severity: "MONITOR",
      category: "Utilization outside expected range",
      issue: `Team utilization is ${Math.round(pct)}% of pace, outside the healthy 50-110% range.`,
      client: null,
      reference: "Team utilization",
      technician: null,
      priority: null,
      ageMinutes: null,
      slaRisk: null,
      recommendedAction: pct < 50 ? "Check for missing time entries or light workload." : "Check for burnout risk or overtime.",
      href: "/tech-performance",
      customerImpact: 0,
      ticketTitle: null,
      ticketUrl: null,
    },
  ];
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, MONITOR: 2 };

// Sort: customer impact -> severity -> SLA risk (has one vs. not) ->
// priority (P1 before P4, ticketless alerts sort last) -> age (older is
// worse) -> alphabetical id for determinism. Matches the ordering the
// spec asks for (customer impact, severity, SLA risk, priority, age).
function sortAlerts(alerts: ManagerAlert[]): ManagerAlert[] {
  return [...alerts].sort((a, b) => {
    if (a.customerImpact !== b.customerImpact) return b.customerImpact - a.customerImpact;
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    const aHasSla = a.slaRisk ? 1 : 0;
    const bHasSla = b.slaRisk ? 1 : 0;
    if (aHasSla !== bHasSla) return bHasSla - aHasSla;
    const aPriority = a.priority ? priorityWeight(a.priority) : 99;
    const bPriority = b.priority ? priorityWeight(b.priority) : 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const aAge = a.ageMinutes ?? 0;
    const bAge = b.ageMinutes ?? 0;
    if (aAge !== bAge) return bAge - aAge;
    return a.id.localeCompare(b.id);
  });
}

export async function generateManagerAlerts(input: {
  health: ServiceDeskHealthSnapshot;
  slaAtRisk: SlaAtRiskTicket[];
  techs: TechPerformance[];
  org: TechOrgSummary;
  lastWeek: TechOrgLastWeek;
  todayIndex: number;
  expectedHoursToDate: number;
  directory: ContactDirectory | null;
}): Promise<ManagerAlert[]> {
  const { health, slaAtRisk, techs, org, lastWeek, todayIndex, expectedHoursToDate, directory } = input;

  // Fetched once here (not inside each ticket-alert generator) so
  // building 4 alert types' worth of ticket links costs one extra
  // primary-key lookup total, not four. Null (no credential connected
  // yet) flows through as ticketUrl: null everywhere below — never a
  // guessed link.
  const haloCredential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  const instanceUrl = haloCredential?.instanceUrl ?? null;

  const [unattended, unassigned, unreturnedCalls, stale, spike, noCharge] = await Promise.all([
    p1p2Unattended(instanceUrl),
    priorityUnassigned(instanceUrl),
    missedCallNotReturned(directory),
    staleTicketAlerts(instanceUrl),
    clientTicketSpike(),
    noChargeTicketNotLowPriority(instanceUrl),
  ]);

  const alerts: ManagerAlert[] = [
    ...unattended,
    ...unassigned,
    ...unreturnedCalls,
    ...slaApproachingBreach(slaAtRisk, instanceUrl),
    ...stale,
    ...technicianOverloaded(techs),
    ...backlogGrowing(health),
    ...excessiveOnHold(techs),
    ...missingTimeEntries(techs, todayIndex),
    ...spike,
    ...phoneAnswerRateDeclining(org, lastWeek),
    ...utilizationOutsideRange(org, expectedHoursToDate),
    ...noCharge,
  ];

  return sortAlerts(alerts);
}
