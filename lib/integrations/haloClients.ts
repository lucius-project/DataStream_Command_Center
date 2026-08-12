// HaloPSA clients, agreement contracts, and time-worked-this-month —
// powers the Client Profitability dashboard. Kept separate from halopsa.ts
// (tickets) since it's a different data domain, sharing only the token
// helper and the small parsing utilities in haloShared.ts.
//
// Field mappings below are confirmed against real /api/Client,
// /api/ClientContract, and /api/Actions responses (not guesses) — the raw
// first result is still logged on every sync as a quick sanity check if
// the instance's shape ever drifts.

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getHaloAccessToken, KNOWN_TECHS, type Tech } from "./halopsa";
import {
  firstString,
  firstNumber,
  mapHaloDate,
  fetchHaloActionsForTicket,
  fetchHaloClients,
  fetchHaloClientContracts,
  fetchHaloTicketHistory,
  mapWithConcurrency,
  matchKnownTech,
  withComputeThrottle,
  HOURS_THROTTLE_MS,
} from "./haloShared";

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// timetaken is already denominated in hours (confirmed against real data:
// values like 5.41666... = 5h25m, 1.75 = 1h45m — clean quarter-hour billing
// increments, not a minutes count), so this only rounds, no /60 conversion.
function roundHours(hours: number): number {
  return Math.round(hours * 10) / 10;
}

// Sums time entries from Actions this month, grouped by the ticket's client
// (via TicketSnapshot.haloClientId, populated by the ticket sync), both as a
// per-client total and a per-client-per-tech breakdown (same agent-name
// matching as Team Time Gaps — see matchKnownTech).
//
// /api/Actions has no global/date-filtered query (confirmed against the
// live API: it returns record_count: 0 unless scoped to a ticket_id), so
// this fetches per open ticket rather than once. The client is already
// known per ticket (TicketSnapshot.haloClientId) before any Actions call,
// so aggregation goes straight to client — no separate ticket→client
// lookup pass needed like the old global-fetch version required.
async function computeHoursThisMonthByClient(
  instanceUrl: string,
  accessToken: string,
): Promise<{ hoursByClient: Map<string, number>; hoursByClientAndTech: Map<string, Map<Tech, number>> }> {
  const tickets = await prisma.ticketSnapshot.findMany({
    select: { haloTicketId: true, haloClientId: true },
  });

  const actionsPerTicket = await Promise.all(
    tickets.map(async (t) => ({
      haloClientId: t.haloClientId,
      actions: await fetchHaloActionsForTicket(instanceUrl, accessToken, t.haloTicketId),
    })),
  );

  const sampleActions = actionsPerTicket.find((t) => t.actions.length > 0)?.actions;
  if (sampleActions) {
    console.log("HaloPSA raw action sample (first result, for field-mapping reference):", JSON.stringify(sampleActions[0]));
  }

  const monthStart = startOfMonth();
  const rawHoursByClient = new Map<string, number>();
  const rawHoursByClientAndTech = new Map<string, Map<Tech, number>>();

  for (const { haloClientId, actions } of actionsPerTicket) {
    if (!haloClientId) continue;

    for (const raw of actions) {
      const actionDate = firstString(raw, ["datetime", "actiondate", "date"]);
      if (actionDate) {
        const d = new Date(actionDate);
        if (!Number.isNaN(d.getTime()) && d < monthStart) continue;
      }
      const hours = firstNumber(raw, ["timetaken", "actiontime", "time_taken"]) ?? 0;
      if (hours <= 0) continue;

      rawHoursByClient.set(haloClientId, (rawHoursByClient.get(haloClientId) ?? 0) + hours);

      const agentName = firstString(raw, ["agent", "who", "staff", "assignedto", "agentname"]);
      const tech = agentName ? matchKnownTech(agentName, KNOWN_TECHS) : undefined;
      if (tech) {
        const byTech = rawHoursByClientAndTech.get(haloClientId) ?? new Map<Tech, number>();
        byTech.set(tech, (byTech.get(tech) ?? 0) + hours);
        rawHoursByClientAndTech.set(haloClientId, byTech);
      }
    }
  }

  const hoursByClient = new Map<string, number>();
  for (const [clientId, hours] of rawHoursByClient) {
    hoursByClient.set(clientId, roundHours(hours));
  }

  const hoursByClientAndTech = new Map<string, Map<Tech, number>>();
  for (const [clientId, techHoursRaw] of rawHoursByClientAndTech) {
    const techHours = new Map<Tech, number>();
    for (const [tech, hours] of techHoursRaw) {
      techHours.set(tech, roundHours(hours));
    }
    hoursByClientAndTech.set(clientId, techHours);
  }

  return { hoursByClient, hoursByClientAndTech };
}

export async function syncClientProfitability(): Promise<{ synced: number; error?: string }> {
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) {
    return { synced: 0 };
  }

  try {
    const clientSecret = decryptToken(credential.encryptedClientSecret);
    const accessToken = await getHaloAccessToken(credential.instanceUrl, credential.clientId, clientSecret);

    const [rawClients, rawContracts, { hoursByClient, hoursByClientAndTech }] = await Promise.all([
      fetchHaloClients(credential.instanceUrl, accessToken),
      fetchHaloClientContracts(credential.instanceUrl, accessToken),
      withComputeThrottle(
        "hoursThisMonthByClient",
        HOURS_THROTTLE_MS,
        () => computeHoursThisMonthByClient(credential.instanceUrl, accessToken),
      ),
    ]);

    if (rawClients.length > 0) {
      console.log("HaloPSA raw client sample (first result, for field-mapping reference):", JSON.stringify(rawClients[0]));
    }
    if (rawContracts.length > 0) {
      console.log("HaloPSA raw client-contract sample (first result, for field-mapping reference):", JSON.stringify(rawContracts[0]));
    }

    const liveClientIds: string[] = [];
    for (const raw of rawClients) {
      const haloClientId = firstString(raw, ["id", "client_id"]);
      if (!haloClientId) continue;
      const name = firstString(raw, ["name", "client_name"]) || "(unnamed client)";
      liveClientIds.push(haloClientId);

      const client = await prisma.client.upsert({
        where: { haloClientId },
        update: { name, hoursThisMonth: hoursByClient.get(haloClientId) ?? 0 },
        create: { haloClientId, name, hoursThisMonth: hoursByClient.get(haloClientId) ?? 0 },
      });

      const itemsForClient = rawContracts.filter(
        (c) => firstString(c, ["client_id", "clientid"]) === haloClientId,
      );
      await prisma.agreementItem.deleteMany({ where: { clientId: client.id } });
      for (const item of itemsForClient) {
        // /api/ClientContract rows are whole contracts, not line items —
        // confirmed against a real response, no quantity field exists at
        // this level. "ref" is the contract's own name/reference;
        // contracttype_name (e.g. "Fixed") is kept as its own field so the
        // UI can badge it separately rather than baking it into the name.
        const ref = firstString(item, ["ref", "refextra"]) || "(unnamed contract)";
        const contractType = firstString(item, ["contracttype_name"]) ?? null;
        await prisma.agreementItem.create({
          data: { clientId: client.id, name: ref, contractType, quantity: 1 },
        });
      }

      const techHours = hoursByClientAndTech.get(haloClientId);
      await prisma.clientTechHours.deleteMany({ where: { clientId: client.id } });
      if (techHours) {
        for (const [tech, hours] of techHours) {
          await prisma.clientTechHours.create({ data: { clientId: client.id, tech, hours } });
        }
      }
    }

    // Consistent with ticket reconciliation: a *successful* fetch (even an
    // empty one) is meaningful and should clear stale rows. A failed fetch
    // throws before reaching here, so this never runs on an error.
    await prisma.client.deleteMany({ where: { haloClientId: { notIn: liveClientIds } } });

    return { synced: rawClients.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "HaloPSA client sync failed.";
    console.error("HaloPSA client profitability sync failed:", err);
    return { synced: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// Client Monthly Hours (persisted ledger, backfilled on demand)
// ---------------------------------------------------------------------------

function yearMonthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Backfills ClientMonthlyHours from whatever ticket history is actually
// reachable — see fetchHaloTicketHistory's caveat: HaloPSA's /api/Tickets
// hard-caps at 1000 rows with no working pagination, so on a busy instance
// this may cover a few weeks, not a full year. Deliberately not run on
// every page load (unlike hoursThisMonth/ClientTechHours): it's one Actions
// call per ticket, so triggered explicitly via POST /api/clients/sync-history.
export async function backfillClientMonthlyHours(): Promise<{ months: string[]; error?: string }> {
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) {
    return { months: [] };
  }

  try {
    const clientSecret = decryptToken(credential.encryptedClientSecret);
    const accessToken = await getHaloAccessToken(credential.instanceUrl, credential.clientId, clientSecret);

    const rawTickets = await fetchHaloTicketHistory(credential.instanceUrl, accessToken);
    const ticketClientPairs = rawTickets
      .map((raw) => ({
        ticketId: firstString(raw, ["id", "ticket_id"]),
        haloClientId: firstString(raw, ["client_id"]),
      }))
      .filter((t): t is { ticketId: string; haloClientId: string } => Boolean(t.ticketId && t.haloClientId));

    // Concurrency kept modest (not e.g. 20+) on top of haloGet's own 429
    // retry/backoff — up to ~1000 tickets in one backfill run is already
    // most of HaloPSA's 700-per-5-minute budget; firing them in a tight
    // burst makes every request likely to collide with the limit instead
    // of just some of them.
    const actionsPerTicket = await mapWithConcurrency(ticketClientPairs, 5, async (t) => ({
      haloClientId: t.haloClientId,
      actions: await fetchHaloActionsForTicket(credential.instanceUrl, accessToken, t.ticketId),
    }));

    // ClientMonthlyHours.clientId is a foreign key to our own Client rows,
    // not HaloPSA's — map haloClientId to our internal id up front.
    const clients = await prisma.client.findMany({ select: { id: true, haloClientId: true } });
    const clientIdByHalo = new Map(clients.map((c) => [c.haloClientId, c.id]));

    const hoursByClientAndMonth = new Map<string, Map<string, number>>();
    for (const { haloClientId, actions } of actionsPerTicket) {
      const clientId = clientIdByHalo.get(haloClientId);
      if (!clientId) continue;

      for (const raw of actions) {
        const actionDate = mapHaloDate(raw, ["datetime", "actiondate", "date"]);
        if (!actionDate) continue;
        const hours = firstNumber(raw, ["timetaken", "actiontime", "time_taken"]) ?? 0;
        if (hours <= 0) continue;

        const yearMonth = yearMonthOf(actionDate);
        const byMonth = hoursByClientAndMonth.get(clientId) ?? new Map<string, number>();
        byMonth.set(yearMonth, (byMonth.get(yearMonth) ?? 0) + hours);
        hoursByClientAndMonth.set(clientId, byMonth);
      }
    }

    const monthsSeen = new Set<string>();
    for (const [clientId, byMonth] of hoursByClientAndMonth) {
      for (const [yearMonth, hours] of byMonth) {
        monthsSeen.add(yearMonth);
        await prisma.clientMonthlyHours.upsert({
          where: { clientId_yearMonth: { clientId, yearMonth } },
          update: { hours: roundHours(hours) },
          create: { clientId, yearMonth, hours: roundHours(hours) },
        });
      }
    }

    return { months: Array.from(monthsSeen).sort() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "HaloPSA history backfill failed.";
    console.error("HaloPSA client monthly hours backfill failed:", err);
    return { months: [], error: message };
  }
}
