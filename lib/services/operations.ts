import { prisma } from "@/lib/prisma";
import { startOfWeek } from "@/lib/dateUtils";
import type { TicketSnapshot, AttentionType } from "@/app/generated/prisma/client";

const OPEN_STATUSES = ["New", "In Progress", "Waiting on Customer"];
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
