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
import { withHaloAuthRetry, KNOWN_TECHS, type Tech } from "./halopsa";
import {
  firstString,
  firstNumber,
  mapHaloDate,
  fetchHaloActionsForTicket,
  fetchHaloClients,
  fetchHaloClientContracts,
  fetchHaloRecurringInvoices,
  fetchHaloRecurringInvoiceLines,
  fetchHaloItems,
  fetchHaloTicketHistory,
  mapWithConcurrency,
  matchKnownTech,
  withComputeThrottle,
  HOURS_THROTTLE_MS,
  type RawHaloRecord,
} from "./haloShared";
import { getKpiSettings } from "@/lib/services/kpiSettings";
import { buildAgreementBreakdown, computeClientLaborSnapshot, type AgreementBreakdownItem } from "@/lib/services/clientProfitability";

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

    const [rawClients, rawContracts, rawRecurringInvoices, rawItems, { hoursByClient, hoursByClientAndTech }] = await withHaloAuthRetry(
      credential.instanceUrl,
      credential.clientId,
      clientSecret,
      (accessToken) =>
        Promise.all([
          fetchHaloClients(credential.instanceUrl, accessToken),
          fetchHaloClientContracts(credential.instanceUrl, accessToken),
          fetchHaloRecurringInvoices(credential.instanceUrl, accessToken),
          fetchHaloItems(credential.instanceUrl, accessToken),
          withComputeThrottle(
            "hoursThisMonthByClient",
            HOURS_THROTTLE_MS,
            () => computeHoursThisMonthByClient(credential.instanceUrl, accessToken),
          ),
        ]),
    );

    // Real per-unit cost for each recurring invoice line, joined via its
    // own _itemid — confirmed live to be genuinely populated for resold
    // products (see AgreementItem.unitCost's schema comment). Built once
    // here, not per client.
    const itemCostById = new Map<string, number>();
    for (const item of rawItems) {
      const itemId = firstString(item, ["id"]);
      const costPrice = firstNumber(item, ["costprice"]);
      if (itemId && costPrice !== undefined && costPrice > 0) itemCostById.set(itemId, costPrice);
    }

    if (rawClients.length > 0) {
      console.log("HaloPSA raw client sample (first result, for field-mapping reference):", JSON.stringify(rawClients[0]));
    }
    if (rawContracts.length > 0) {
      console.log("HaloPSA raw client-contract sample (first result, for field-mapping reference):", JSON.stringify(rawContracts[0]));
    }

    // Real per-item pricing comes from each active recurring invoice's own
    // line items (unit_price/qty_order) — confirmed live that the bulk
    // /api/RecurringInvoice list above never includes them, only the
    // single-record detail endpoint does (fetchHaloRecurringInvoiceLines).
    // Disabled recurring invoices are superseded/cancelled billing
    // templates, not what's actually being charged today, so they're
    // skipped rather than shown as if still active. Fetched once here,
    // not per-client.
    const activeRecurringInvoices = rawRecurringInvoices.filter((r) => r.disabled !== true);
    if (activeRecurringInvoices.length > 0) {
      console.log(
        "HaloPSA raw recurring-invoice sample (first result, for field-mapping reference):",
        JSON.stringify(activeRecurringInvoices[0]),
      );
    }

    // Lines keyed by recurring invoice id, not by contract id — confirmed
    // live (Central Utility Services) that a client's real active billing
    // can be re-parented onto a contract id that never appears in that
    // client's own /api/ClientContract list at all (their original
    // contract's recurring invoice got disabled/superseded, and the
    // replacement recurring invoices are tied to a contract id
    // /api/ClientContract simply doesn't return for them). Matching lines
    // to a client by the invoice's own client_id below is the reliable
    // join; contract_id is still used, but only best-effort, for a
    // contractType label.
    const linesByRecurringInvoiceId = new Map<string, RawHaloRecord[]>();
    if (activeRecurringInvoices.length > 0) {
      const linePages = await withHaloAuthRetry(
        credential.instanceUrl,
        credential.clientId,
        clientSecret,
        (accessToken) =>
          mapWithConcurrency(activeRecurringInvoices, 5, async (rec) => {
            const recurringInvoiceId = firstString(rec, ["id"]);
            if (!recurringInvoiceId) return null;
            const lines = await fetchHaloRecurringInvoiceLines(credential.instanceUrl, accessToken, recurringInvoiceId);
            return { recurringInvoiceId, lines };
          }),
      );
      for (const page of linePages) {
        if (page && page.lines.length > 0) linesByRecurringInvoiceId.set(page.recurringInvoiceId, page.lines);
      }
    }

    const recurringInvoicesByHaloClientId = new Map<string, RawHaloRecord[]>();
    for (const rec of activeRecurringInvoices) {
      const recClientId = firstString(rec, ["client_id"]);
      if (!recClientId) continue;
      const list = recurringInvoicesByHaloClientId.get(recClientId) ?? [];
      list.push(rec);
      recurringInvoicesByHaloClientId.set(recClientId, list);
    }

    // Fetched once, not per client — feeds the Service Profit snapshot
    // below (hoursThisMonth × this rate), same admin-set figure used by
    // syncAllClientFinancials's own labor cost figure.
    const kpiSettings = await getKpiSettings();

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
      const primaryContractType =
        itemsForClient.length > 0 ? (firstString(itemsForClient[0], ["contracttype_name"]) ?? null) : null;
      const clientRecurringInvoices = recurringInvoicesByHaloClientId.get(haloClientId) ?? [];

      await prisma.agreementItem.deleteMany({ where: { clientId: client.id } });
      // Collected as they're created (not re-read from the DB) so the
      // labor snapshot below can categorize them with buildAgreementBreakdown
      // straight away — same values, no second query.
      const createdItems: AgreementBreakdownItem[] = [];

      async function createLineItems(lines: RawHaloRecord[], contractType: string | null) {
        for (const line of lines) {
          const itemName = firstString(line, ["item_name", "item_shortdescription"]) || "(unnamed item)";
          const quantity = firstNumber(line, ["qty_order"]) ?? 1;
          const unitPrice = firstNumber(line, ["unit_price", "item_recurring_price"]) ?? null;
          const catalogItemId = firstString(line, ["_itemid"]);
          const unitCost = catalogItemId ? (itemCostById.get(catalogItemId) ?? null) : null;
          const created = await prisma.agreementItem.create({
            data: { clientId: client.id, name: itemName, contractType, quantity, unitPrice, unitCost },
          });
          createdItems.push(created);
        }
      }

      // Pass 1: this client's own contracts, matched to a recurring
      // invoice by contract id — the common, expected case, and the only
      // one that can label each line with its own contract's type.
      const usedRecurringInvoiceIds = new Set<string>();
      for (const item of itemsForClient) {
        // /api/ClientContract rows are whole contracts, not line items —
        // confirmed against a real response, no pricing at this level.
        // "ref" is the contract's own name/reference; contracttype_name
        // (e.g. "Fixed") is kept as its own field so the UI can badge it
        // separately rather than baking it into the name.
        const ref = firstString(item, ["ref", "refextra"]) || "(unnamed contract)";
        const contractType = firstString(item, ["contracttype_name"]) ?? null;
        const contractId = firstString(item, ["id"]);
        const matchingInvoices = contractId
          ? clientRecurringInvoices.filter((rec) => firstString(rec, ["contract_id"]) === contractId)
          : [];

        let hadLines = false;
        for (const rec of matchingInvoices) {
          const recId = firstString(rec, ["id"]);
          const lines = recId ? linesByRecurringInvoiceId.get(recId) : undefined;
          if (!lines || lines.length === 0) continue;
          hadLines = true;
          if (recId) usedRecurringInvoiceIds.add(recId);
          await createLineItems(lines, contractType);
        }

        if (!hadLines) {
          // No active recurring invoice matched to this specific contract
          // (e.g. a genuine one-time/T&M engagement) — contract name
          // only, no fabricated price.
          const created = await prisma.agreementItem.create({
            data: { clientId: client.id, name: ref, contractType, quantity: 1 },
          });
          createdItems.push(created);
        }
      }

      // Pass 2: any of this client's active recurring invoices whose
      // contract_id didn't match one of their own known contracts —
      // real, currently-billed line items HaloPSA's own /api/ClientContract
      // just doesn't surface under this client (confirmed live: Central
      // Utility Services' actual billing sits on a contract id their own
      // contract list never returns). Still shown, with a best-effort
      // contractType from the client's primary contract rather than
      // dropped entirely.
      for (const rec of clientRecurringInvoices) {
        const recId = firstString(rec, ["id"]);
        if (!recId || usedRecurringInvoiceIds.has(recId)) continue;
        const lines = linesByRecurringInvoiceId.get(recId);
        if (!lines || lines.length === 0) continue;
        await createLineItems(lines, primaryContractType);
      }

      const techHours = hoursByClientAndTech.get(haloClientId);
      await prisma.clientTechHours.deleteMany({ where: { clientId: client.id } });
      if (techHours) {
        for (const [tech, hours] of techHours) {
          await prisma.clientTechHours.create({ data: { clientId: client.id, tech, hours } });
        }
      }

      // Effective Hourly Rate & Service Profit (UI names) — snapshot the
      // Service agreement line against real hours + the admin-set rate
      // for the current month, frozen so a later rate change doesn't
      // rewrite past months (see ClientLaborMonthly's schema comment).
      const laborGroup = buildAgreementBreakdown(createdItems).find((g) => g.category === "Service");
      const monthlyHoursHistory = await prisma.clientMonthlyHours.findMany({
        where: { clientId: client.id },
        select: { yearMonth: true, hours: true },
        orderBy: { yearMonth: "desc" },
        take: 3,
      });
      const laborSnapshot = computeClientLaborSnapshot({
        laborLineValue: laborGroup?.monthlyValue ?? 0,
        monthlyHoursHistory,
        hoursThisMonth: client.hoursThisMonth,
        laborHourlyRate: kpiSettings.laborHourlyRate,
      });
      const currentYearMonth = yearMonthOf(new Date());
      await prisma.clientLaborMonthly.upsert({
        where: { clientId_yearMonth: { clientId: client.id, yearMonth: currentYearMonth } },
        update: laborSnapshot,
        create: { clientId: client.id, yearMonth: currentYearMonth, ...laborSnapshot },
      });
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

    const actionsPerTicket = await withHaloAuthRetry(
      credential.instanceUrl,
      credential.clientId,
      clientSecret,
      async (accessToken) => {
        const rawTickets = await fetchHaloTicketHistory(credential.instanceUrl, accessToken);
        const ticketClientPairs = rawTickets
          .map((raw) => ({
            ticketId: firstString(raw, ["id", "ticket_id"]),
            haloClientId: firstString(raw, ["client_id"]),
          }))
          .filter((t): t is { ticketId: string; haloClientId: string } => Boolean(t.ticketId && t.haloClientId));

        // Concurrency kept modest (not e.g. 20+) on top of haloGet's own
        // 429 retry/backoff — up to ~1000 tickets in one backfill run is
        // already most of HaloPSA's 700-per-5-minute budget; firing them
        // in a tight burst makes every request likely to collide with the
        // limit instead of just some of them.
        return mapWithConcurrency(ticketClientPairs, 5, async (t) => ({
          haloClientId: t.haloClientId,
          actions: await fetchHaloActionsForTicket(credential.instanceUrl, accessToken, t.ticketId),
        }));
      },
    );

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
