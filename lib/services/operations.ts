import { prisma } from "@/lib/prisma";
import { startOfWeek, businessHoursElapsed } from "@/lib/dateUtils";
import type { TicketSnapshot, AttentionType } from "@/app/generated/prisma/client";

export const OPEN_STATUSES = ["New", "In Progress", "Waiting on Customer"];
const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2, P4: 3 } as const;

export async function getDispatchTickets() {
  const tickets = await prisma.ticketSnapshot.findMany({
    where: { status: { in: OPEN_STATUSES } },
  });
  return tickets.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.openedAt.getTime() - b.openedAt.getTime();
  });
}

export type TechLoad = { tech: string; openCount: number; p1Count: number; agingCount: number; onHoldCount: number };

// TicketSnapshot only ever holds tickets HaloPSA itself calls open
// (fetchHaloTickets uses open_only=true — see halopsa.ts), so anything
// outside OPEN_STATUSES here isn't closed, it's blocked on something else
// ("On Hold", "Waiting on Vendor", "Waiting on Parts", "Scheduled", etc.,
// confirmed live). Counted separately rather than folded into openCount:
// those tickets aren't sitting in a tech's active queue waiting on them,
// so mixing them in would overstate workload and misrepresent responsiveness.
async function getOnHoldTickets() {
  return prisma.ticketSnapshot.findMany({
    where: { status: { notIn: OPEN_STATUSES } },
    select: { assignedTech: true },
  });
}

export async function getLoadPerTech(): Promise<TechLoad[]> {
  const [tickets, onHoldTickets] = await Promise.all([getDispatchTickets(), getOnHoldTickets()]);
  const now = Date.now();
  const byTech = new Map<string, TechLoad>();
  const entryFor = (tech: string) =>
    byTech.get(tech) ?? { tech, openCount: 0, p1Count: 0, agingCount: 0, onHoldCount: 0 };

  for (const t of tickets) {
    const entry = entryFor(t.assignedTech);
    entry.openCount++;
    if (t.priority === "P1") entry.p1Count++;
    if (now - t.openedAt.getTime() > 24 * 60 * 60 * 1000) entry.agingCount++;
    byTech.set(t.assignedTech, entry);
  }
  for (const t of onHoldTickets) {
    const entry = entryFor(t.assignedTech);
    entry.onHoldCount++;
    byTech.set(t.assignedTech, entry);
  }

  return Array.from(byTech.values()).sort((a, b) => b.openCount - a.openCount);
}

export async function getAttentionFlags() {
  const now = new Date();
  const flags = await prisma.attentionFlag.findMany({
    where: {
      status: { not: "RESOLVED" },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    },
    include: { ticket: true },
    orderBy: { createdAt: "desc" },
  });
  return flags.sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "OPEN" ? -1 : 1;
  });
}

// One flag per (ticket, type) for the ticket's entire time in the open
// feed — deliberately not re-created after a human resolves/snoozes it,
// even if the same condition (still P1, still SLA-breached) persists on
// the next sync. "Resolved" means "I've dealt with this", not "recheck
// me in 5 minutes". The only way a ticket's flags disappear is the
// existing reconcileTickets() cascade when the ticket leaves the open
// feed entirely (closed) — see lib/integrations/halopsa.ts.
async function ensureAttentionFlag(ticketId: string, type: AttentionType, description: string): Promise<void> {
  const existing = await prisma.attentionFlag.findFirst({ where: { ticketId, type } });
  if (existing) return;
  await prisma.attentionFlag.create({
    data: { source: "TICKET", ticketId, type, description, status: "OPEN" },
  });
}

const SLA_BREACH_GRACE_HOURS = 24;

// Auto-flags P1/P2 and significantly SLA-breached tickets from a live
// HaloPSA sync. Deliberately narrower than "any open P1 or any breach" —
// a P3/P4 ticket a few minutes past its response SLA isn't worth an
// interrupt; a full day past is. Scoped to whatever tickets HaloPSA
// itself considers open (open_only=true), not the narrower OPEN_STATUSES
// used for Dispatch grouping, since e.g. an "Assigned" P1 should still
// alert.
export async function generateAttentionFlagsFromTickets(tickets: TicketSnapshot[]): Promise<void> {
  const now = new Date();
  for (const ticket of tickets) {
    if (ticket.priority === "P1" || ticket.priority === "P2") {
      await ensureAttentionFlag(
        ticket.id,
        "ESCALATION",
        `${ticket.priority} priority ticket needs dispatch attention.`,
      );
    }
    const breachHours = ticket.slaDueAt ? (now.getTime() - ticket.slaDueAt.getTime()) / (60 * 60 * 1000) : 0;
    if (breachHours > SLA_BREACH_GRACE_HOURS) {
      await ensureAttentionFlag(ticket.id, "SLA_BREACH", "Response SLA passed more than a day ago — ticket is still open.");
    }
  }
}

// Current week only — once the live sync starts writing a row per week,
// showing every historical row would list the same person multiple times.
export async function getTimeGaps() {
  const gaps = await prisma.timeGap.findMany({
    where: { periodStart: startOfWeek() },
    orderBy: { person: "asc" },
  });
  return {
    tech: gaps.filter((g) => g.role === "TECH"),
    admin: gaps.filter((g) => g.role === "ADMIN"),
  };
}

// ---------------------------------------------------------------------------
// Ticket responsibility & aging (Service Desk Health)
// ---------------------------------------------------------------------------

export type TicketResponsibility =
  | "WAITING_TECHNICIAN"
  | "WAITING_CUSTOMER"
  | "WAITING_VENDOR"
  | "SCHEDULED"
  | "ON_HOLD"
  | "UNKNOWN";

// Who owns the next action on a ticket, from its free-text HaloPSA status
// name. Confirmed live status strings on this instance: "New", "In
// Progress", "Waiting on Customer", "On Hold", "On Hold (1-Week)",
// "Waiting on Vendor", "Waiting on Parts", "Scheduled" — substring-matched
// rather than an exact list, so a differently-worded status on another
// HaloPSA instance still classifies sensibly instead of silently landing
// in UNKNOWN. Deliberately independent of OPEN_STATUSES above (which
// groups "Waiting on Customer" with New/In Progress for the Dispatch
// pane's existing grouping) — a ticket waiting on the customer is not a
// technician workload item for aging/stale purposes, even though
// Dispatch still lists it as "open."
export function classifyResponsibility(status: string): TicketResponsibility {
  const s = status.toLowerCase();
  if (s.includes("waiting on customer")) return "WAITING_CUSTOMER";
  if (s.includes("waiting on vendor") || s.includes("waiting on parts")) return "WAITING_VENDOR";
  if (s.includes("scheduled")) return "SCHEDULED";
  if (s.includes("on hold")) return "ON_HOLD";
  if (s.includes("new") || s.includes("in progress") || s.includes("assigned")) return "WAITING_TECHNICIAN";
  return "UNKNOWN";
}

export type BacklogBreakdown = {
  total: number;
  waitingTechnician: number;
  waitingCustomer: number;
  waitingVendor: number;
  scheduled: number;
  onHold: number;
  unknown: number;
  unassigned: number;
};

// Covers every currently-open ticket (all of TicketSnapshot, not just
// OPEN_STATUSES) bucketed by who owns the next action — the "Backlog
// Health" breakdown a Service Desk Manager needs, distinct from
// getLoadPerTech's per-tech workload counts above.
export async function getBacklogBreakdown(): Promise<BacklogBreakdown> {
  const tickets = await prisma.ticketSnapshot.findMany({ select: { status: true, assignedTech: true } });
  const breakdown: BacklogBreakdown = {
    total: tickets.length,
    waitingTechnician: 0,
    waitingCustomer: 0,
    waitingVendor: 0,
    scheduled: 0,
    onHold: 0,
    unknown: 0,
    unassigned: 0,
  };
  for (const t of tickets) {
    switch (classifyResponsibility(t.status)) {
      case "WAITING_TECHNICIAN":
        breakdown.waitingTechnician++;
        break;
      case "WAITING_CUSTOMER":
        breakdown.waitingCustomer++;
        break;
      case "WAITING_VENDOR":
        breakdown.waitingVendor++;
        break;
      case "SCHEDULED":
        breakdown.scheduled++;
        break;
      case "ON_HOLD":
        breakdown.onHold++;
        break;
      default:
        breakdown.unknown++;
    }
    if (t.assignedTech === "Unassigned") breakdown.unassigned++;
  }
  return breakdown;
}

// Only tickets a technician actually owns the next action on — a ticket
// sitting three business days in "Waiting on Customer" isn't a
// technician failing to act (see classifyResponsibility).
export async function getTechActionableTickets(): Promise<TicketSnapshot[]> {
  const tickets = await prisma.ticketSnapshot.findMany();
  return tickets.filter((t) => classifyResponsibility(t.status) === "WAITING_TECHNICIAN");
}

const STALE_BUSINESS_HOURS = 24;

export type StaleTicket = TicketSnapshot & { businessHoursSinceAction: number };

// A tech-actionable ticket with no recorded update in >24 business hours.
// Uses lastActionAt (falling back to openedAt for a ticket with no
// recorded action yet) via businessHoursElapsed (dateUtils.ts) — the
// same shared business-hours engine used everywhere else, not a second
// wall-clock calculation. lastActionAt is *any* update on the ticket
// (see its comment on TicketSnapshot in schema.prisma), not specifically
// a technician action, so this is a reasonable approximation kept cheap
// enough to run on every page load — not an exact "no technician touched
// this" claim. Refining it to a true technician-action signal would need
// the per-ticket Actions fetch, which stale detection deliberately avoids.
export async function getStaleTickets(): Promise<StaleTicket[]> {
  const now = new Date();
  const techActionable = await getTechActionableTickets();
  return techActionable
    .map((t) => ({ ...t, businessHoursSinceAction: businessHoursElapsed(t.lastActionAt ?? t.openedAt, now) }))
    .filter((t) => t.businessHoursSinceAction > STALE_BUSINESS_HOURS)
    .sort((a, b) => b.businessHoursSinceAction - a.businessHoursSinceAction);
}

export type AgingBucket = "0-4h" | "4-8h" | "8-24h" | "1-3d" | "3-7d" | "7d+";

// 8:30am-5:00pm business day = 8.5 hours — used only to convert elapsed
// business hours into "business days" for the day-granularity buckets
// below the 24-hour mark, so "1-3 days" continues naturally from where
// "8-24h" leaves off rather than using a separately-counted calendar-day
// definition that could disagree with the hour buckets at the boundary.
const BUSINESS_HOURS_PER_DAY = 8.5;

function agingBucketOf(businessHours: number): AgingBucket {
  if (businessHours < 4) return "0-4h";
  if (businessHours < 8) return "4-8h";
  if (businessHours < 24) return "8-24h";
  const days = businessHours / BUSINESS_HOURS_PER_DAY;
  if (days < 3) return "1-3d";
  if (days < 7) return "3-7d";
  return "7d+";
}

export type TechActionableAging = {
  total: number;
  byBucket: Record<AgingBucket, number>;
  // Tickets in the three oldest buckets (1-3d/3-7d/7d+) — the count a
  // manager actually needs to act on; 0-4h/4-8h/8-24h are same-day and
  // not yet a concern.
  agingOver24h: number;
};

// Tech-actionable tickets only (see getTechActionableTickets), bucketed
// by business hours elapsed since openedAt — this is *ticket age*, not
// time-since-last-action (that's getStaleTickets, a different question:
// "has anyone looked at this recently" vs. "how long has this existed").
export async function getTechActionableAging(): Promise<TechActionableAging> {
  const now = new Date();
  const tickets = await getTechActionableTickets();
  const byBucket: Record<AgingBucket, number> = {
    "0-4h": 0,
    "4-8h": 0,
    "8-24h": 0,
    "1-3d": 0,
    "3-7d": 0,
    "7d+": 0,
  };
  for (const t of tickets) {
    const bucket = agingBucketOf(businessHoursElapsed(t.openedAt, now));
    byBucket[bucket]++;
  }
  const agingOver24h = byBucket["1-3d"] + byBucket["3-7d"] + byBucket["7d+"];
  return { total: tickets.length, byBucket, agingOver24h };
}
