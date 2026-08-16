// No-charge ticket detection — flags a ticket if it has a visible
// non-billable ("no charge," HaloPSA's own actisbillable=false flag on
// a logged Action) time entry from yesterday, and its priority isn't
// already P4/Low. Per the SOP's own spirit, a genuinely no-charge piece
// of work should be triaged as Low priority; if it isn't, that's worth
// a manager's attention.
//
// Deliberately incomplete, and that's the safe direction to be wrong
// in: HaloPSA's Actions API excludes Internal Notes (confirmed —
// they're sensitive/private and not exposed this way), so a ticket
// whose only no-charge time was logged via an Internal Note will be
// silently missed here. That can only under-flag, never wrongly flag a
// ticket that isn't actually no-charge — a false negative, not a false
// positive. This is why no hour *total* is computed anywhere in this
// app from Actions data (see this session's own investigation) — an
// existence check ("does at least one visible no-charge action exist")
// stays honest under that gap; a sum would not.
//
// Candidate ticket set is tickets with recent activity (lastActionAt on
// or after yesterday), not the whole backlog — same per-ticket Actions
// fan-out cost discipline as Client Profitability's hours-per-client
// and Team Time Gaps' hours-per-week computations (both use
// fetchHaloActionsForTicket, one HaloPSA request per candidate ticket;
// HaloPSA rate-limits at 700 requests per rolling 5 minutes, confirmed
// hit in practice per haloShared.ts's own comment).

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { withHaloAuthRetry, PROJECT_TICKET_TYPE_IDS } from "@/lib/integrations/halopsa";
import { fetchHaloActionsForTicket, mapHaloDate, withComputeThrottle, HOURS_THROTTLE_MS } from "@/lib/integrations/haloShared";
import { startOfToday } from "@/lib/dateUtils";
import type { TicketPriority } from "@/app/generated/prisma/client";

export type NoChargeTicket = {
  id: string;
  haloTicketId: string;
  summary: string;
  clientName: string | null;
  assignedTech: string;
  priority: TicketPriority;
};

async function computeNoChargeTickets(): Promise<NoChargeTicket[]> {
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) return [];

  const yesterday = startOfToday();
  yesterday.setDate(yesterday.getDate() - 1);
  const todayStart = startOfToday();

  // Already Low priority — nothing to flag, so skip the Actions fetch
  // entirely for these (cheaper, and correctness-neutral: a P4 ticket
  // can never fail this check).
  const candidates = await prisma.ticketSnapshot.findMany({
    where: {
      lastActionAt: { gte: yesterday },
      priority: { not: "P4" },
      // Project/Project Task tickets aren't service-desk work this alert
      // is tuned for — see PROJECT_TICKET_TYPE_IDS's own comment.
      ticketTypeId: { notIn: [...PROJECT_TICKET_TYPE_IDS] },
    },
  });
  if (candidates.length === 0) return [];

  const clientSecret = decryptToken(credential.encryptedClientSecret);

  return withHaloAuthRetry(credential.instanceUrl, credential.clientId, clientSecret, async (accessToken) => {
    const results: NoChargeTicket[] = [];
    for (const ticket of candidates) {
      const actions = await fetchHaloActionsForTicket(credential.instanceUrl, accessToken, ticket.haloTicketId);
      const hasNoCharge = actions.some((a) => {
        if (a.actisbillable !== false) return false;
        const dt = mapHaloDate(a, ["datetime"]);
        return dt !== null && dt >= yesterday && dt < todayStart;
      });
      if (hasNoCharge) {
        results.push({
          id: ticket.id,
          haloTicketId: ticket.haloTicketId,
          summary: ticket.summary,
          clientName: ticket.clientName,
          assignedTech: ticket.assignedTech,
          priority: ticket.priority,
        });
      }
    }
    return results;
  });
}

export async function getNoChargeTicketsYesterday(): Promise<NoChargeTicket[]> {
  return withComputeThrottle("noChargeTicketsYesterday", HOURS_THROTTLE_MS, computeNoChargeTickets);
}
