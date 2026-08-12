// HaloPSA adapter. Field names on TicketSnapshot mirror HaloPSA's real
// ticket shape, so this file is the only place that changes when going
// from mocked to live — the seam the whole architecture was built around.
//
// Mocked fixture data is the automatic fallback whenever no HaloPsaCredential
// row exists, so Operations never breaks before this is connected (same
// pattern as Inbox Command before Microsoft Graph was connected).
//
// Priority mapping (P1–P4) is a best-effort guess at common HaloPSA field
// names/conventions — it hasn't been verified against a real instance. If
// tickets come through with priorities that look wrong, check the raw
// response logged to the console on each live sync and adjust
// mapHaloPriority() below.

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import {
  normalizeInstanceUrl,
  firstString,
  firstNumber,
  mapHaloDate,
  fetchHaloActionsForTicket,
  fetchHaloAgentNames,
  fetchHaloStatusNames,
  fetchHaloTicketHistory,
  mapWithConcurrency,
  matchKnownTech,
  withComputeThrottle,
  HOURS_THROTTLE_MS,
  type RawHaloRecord,
} from "./haloShared";
import { startOfWeek, endOfWeek } from "@/lib/dateUtils";
import { generateAttentionFlagsFromTickets } from "@/lib/services/operations";
import type { TicketPriority } from "@/app/generated/prisma/client";

export type Tech = "Miguel" | "Cameron" | "Darryl" | "Emily";
export const KNOWN_TECHS: Tech[] = ["Miguel", "Cameron", "Darryl", "Emily"];

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

type MockTicket = {
  haloTicketId: string;
  summary: string;
  status: string;
  priority: TicketPriority;
  assignedTech: Tech;
  department: string;
  openedHoursAgo: number;
  slaDueHours: number; // negative = already breached
};

const MOCK_TICKETS: MockTicket[] = [
  { haloTicketId: "HALO-10235", summary: "Huntress alert — possible ransomware activity on file server", status: "In Progress", priority: "P1", assignedTech: "Miguel", department: "Service Delivery", openedHoursAgo: 0.75, slaDueHours: 0.25 },
  { haloTicketId: "HALO-10231", summary: "Server down — Whitfield Logistics primary DC", status: "In Progress", priority: "P1", assignedTech: "Miguel", department: "Service Delivery", openedHoursAgo: 3, slaDueHours: 1 },
  { haloTicketId: "HALO-10240", summary: "Billing dispute escalation — client threatening to churn", status: "In Progress", priority: "P1", assignedTech: "Emily", department: "Service Delivery", openedHoursAgo: 2, slaDueHours: 2 },
  { haloTicketId: "HALO-10238", summary: "Overnight backup job failing — Datto alert", status: "Waiting on Customer", priority: "P2", assignedTech: "Miguel", department: "Service Delivery", openedHoursAgo: 30, slaDueHours: -6 },
  { haloTicketId: "HALO-10232", summary: "VPN client not connecting for remote staff", status: "New", priority: "P2", assignedTech: "Cameron", department: "Service Delivery", openedHoursAgo: 0.5, slaDueHours: 7 },
  { haloTicketId: "HALO-10236", summary: "Email migration issue for new hire mailbox", status: "New", priority: "P2", assignedTech: "Cameron", department: "Service Delivery", openedHoursAgo: 4, slaDueHours: 4 },
  { haloTicketId: "HALO-10243", summary: "AutoElevate approval queue backed up", status: "In Progress", priority: "P2", assignedTech: "Darryl", department: "Service Delivery", openedHoursAgo: 26, slaDueHours: 2 },
  { haloTicketId: "HALO-10233", summary: "New user onboarding — laptop imaging and setup", status: "In Progress", priority: "P3", assignedTech: "Darryl", department: "Service Delivery", openedHoursAgo: 24, slaDueHours: 24 },
  { haloTicketId: "HALO-10237", summary: "Wifi dropping intermittently — 2nd floor east wing", status: "In Progress", priority: "P3", assignedTech: "Darryl", department: "Service Delivery", openedHoursAgo: 6, slaDueHours: 18 },
  { haloTicketId: "HALO-10241", summary: "Firewall rule change request — new vendor SaaS", status: "New", priority: "P3", assignedTech: "Cameron", department: "Service Delivery", openedHoursAgo: 8, slaDueHours: 40 },
  { haloTicketId: "HALO-10244", summary: "DNSFilter category block causing false positive", status: "Waiting on Customer", priority: "P3", assignedTech: "Emily", department: "Service Delivery", openedHoursAgo: 20, slaDueHours: 20 },
  { haloTicketId: "HALO-10234", summary: "Printer offline in accounting", status: "Waiting on Customer", priority: "P4", assignedTech: "Emily", department: "Service Delivery", openedHoursAgo: 48, slaDueHours: 24 },
  { haloTicketId: "HALO-10239", summary: "Software license renewal request", status: "New", priority: "P4", assignedTech: "Emily", department: "Service Delivery", openedHoursAgo: 72, slaDueHours: 48 },
  { haloTicketId: "HALO-10245", summary: "Guest wifi password rotation request", status: "New", priority: "P4", assignedTech: "Cameron", department: "Service Delivery", openedHoursAgo: 10, slaDueHours: 62 },
];

async function syncMockTickets(): Promise<{ synced: number }> {
  for (const t of MOCK_TICKETS) {
    const openedAt = hoursAgo(t.openedHoursAgo);
    await prisma.ticketSnapshot.upsert({
      where: { haloTicketId: t.haloTicketId },
      update: {
        summary: t.summary,
        status: t.status,
        priority: t.priority,
        assignedTech: t.assignedTech,
        department: t.department,
        slaDueAt: hoursFromNow(t.slaDueHours),
        lastUpdatedAt: new Date(),
      },
      create: {
        haloTicketId: t.haloTicketId,
        summary: t.summary,
        status: t.status,
        priority: t.priority,
        assignedTech: t.assignedTech,
        department: t.department,
        openedAt,
        slaDueAt: hoursFromNow(t.slaDueHours),
        lastUpdatedAt: new Date(),
      },
    });
  }
  return { synced: MOCK_TICKETS.length };
}

// ---------------------------------------------------------------------------
// Live HaloPSA API
// ---------------------------------------------------------------------------

export async function getHaloAccessToken(
  instanceUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(`${normalizeInstanceUrl(instanceUrl)}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "all",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HaloPSA token request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("HaloPSA token response did not include an access_token.");
  }
  return data.access_token;
}

async function fetchHaloTickets(instanceUrl: string, accessToken: string): Promise<RawHaloRecord[]> {
  const res = await fetch(`${normalizeInstanceUrl(instanceUrl)}/api/Tickets?open_only=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HaloPSA ticket request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  // HaloPSA's /api/Tickets can return either a bare array or { tickets: [...] }
  // depending on version/config — handle both.
  return Array.isArray(data) ? data : (data.tickets ?? []);
}

function mapHaloPriority(raw: RawHaloRecord): TicketPriority {
  const name = firstString(raw, ["priorityname", "priority_name", "priority"])?.toLowerCase();
  if (name) {
    if (/1|critical|urgent/.test(name)) return "P1";
    if (/2|high/.test(name)) return "P2";
    if (/3|medium|normal/.test(name)) return "P3";
    if (/4|low/.test(name)) return "P4";
  }
  const id = raw["priority_id"];
  if (typeof id === "number") {
    if (id <= 1) return "P1";
    if (id === 2) return "P2";
    if (id === 3) return "P3";
    return "P4";
  }
  return "P3";
}

// Removes TicketSnapshot rows that didn't come back in this sync — a ticket
// closing (or, the first time this runs, the old mock fixture rows) should
// actually disappear, not accumulate forever. Any AttentionFlag tied to a
// removed ticket is removed with it, since a flag about a ticket that no
// longer exists in the open-ticket feed doesn't stand on its own.
async function reconcileTickets(liveHaloTicketIds: string[]): Promise<void> {
  const stale = await prisma.ticketSnapshot.findMany({
    where: { haloTicketId: { notIn: liveHaloTicketIds } },
    select: { id: true },
  });
  if (stale.length === 0) return;
  const staleIds = stale.map((t) => t.id);
  await prisma.attentionFlag.deleteMany({ where: { ticketId: { in: staleIds } } });
  await prisma.ticketSnapshot.deleteMany({ where: { id: { in: staleIds } } });
}

async function syncLiveTickets(credential: {
  instanceUrl: string;
  clientId: string;
  encryptedClientSecret: string;
}): Promise<{ synced: number }> {
  const clientSecret = decryptToken(credential.encryptedClientSecret);
  const accessToken = await getHaloAccessToken(credential.instanceUrl, credential.clientId, clientSecret);
  const [rawTickets, agentNames, statusNames] = await Promise.all([
    fetchHaloTickets(credential.instanceUrl, accessToken),
    fetchHaloAgentNames(credential.instanceUrl, accessToken),
    fetchHaloStatusNames(credential.instanceUrl, accessToken),
  ]);

  if (rawTickets.length > 0) {
    console.log("HaloPSA raw ticket sample (first result, for field-mapping reference):", JSON.stringify(rawTickets[0]));
  }

  const liveHaloTicketIds: string[] = [];
  for (const raw of rawTickets) {
    const haloTicketId = firstString(raw, ["id", "ticket_id"]);
    if (!haloTicketId) continue;
    liveHaloTicketIds.push(haloTicketId);

    const summary = firstString(raw, ["summary", "subject"]) || "(no summary)";
    // Same resolution story as assignedTech below: tickets only carry a
    // numeric status_id, no status string field.
    const explicitStatus = firstString(raw, ["status", "status_name"]);
    const statusId = firstNumber(raw, ["status_id"]);
    const status = explicitStatus || (statusId !== undefined ? statusNames.get(statusId) : undefined) || "Unknown";
    const priority = mapHaloPriority(raw);
    // Tickets only carry a numeric agent_id (no name field), so the agent
    // name has to be resolved via /api/Agent — confirmed against a real
    // response, where the un-set default is literally an agent named
    // "Unassigned" (id 1), which the "Unassigned" fallback below also covers
    // if the id is missing or unmapped.
    const explicitName = firstString(raw, ["agent", "assignedto", "agentname"]);
    const agentId = firstNumber(raw, ["agent_id"]);
    const assignedTech = explicitName || (agentId !== undefined ? agentNames.get(agentId) : undefined) || "Unassigned";
    const department = firstString(raw, ["team", "department"]) || "Service Delivery";
    const openedAt = mapHaloDate(raw, ["dateoccured", "datelogged", "date_logged"]) ?? new Date();
    // "deadlinedate" exists but is a HaloPSA sentinel for "not set"
    // (literally "1900-01-01T00:00:00" on every ticket sampled) — confirmed
    // against real data, not a guess. "respondbydate" (when first response
    // is due) is the real SLA field; "fixbydate" (resolution due) as a
    // fallback for tickets without a response deadline.
    const slaDueAt = mapHaloDate(raw, ["respondbydate", "fixbydate"]);
    const haloClientId = firstString(raw, ["client_id", "clientid"]) ?? null;

    await prisma.ticketSnapshot.upsert({
      where: { haloTicketId },
      update: { summary, status, priority, assignedTech, department, slaDueAt, haloClientId, lastUpdatedAt: new Date() },
      create: { haloTicketId, summary, status, priority, assignedTech, department, openedAt, slaDueAt, haloClientId, lastUpdatedAt: new Date() },
    });
  }

  await reconcileTickets(liveHaloTicketIds);

  const openTickets = await prisma.ticketSnapshot.findMany({
    where: { haloTicketId: { in: liveHaloTicketIds } },
  });
  await generateAttentionFlagsFromTickets(openTickets);

  return { synced: rawTickets.length };
}

export async function syncTicketsFromHalo(): Promise<{ synced: number; error?: string }> {
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) {
    return syncMockTickets();
  }

  try {
    return await syncLiveTickets(credential);
  } catch (err) {
    const message = err instanceof Error ? err.message : "HaloPSA sync failed.";
    console.error("HaloPSA live sync failed:", err);
    return { synced: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// Team Time Gaps (live, once connected — no mock fallback needed since the
// seeded fixture rows already cover the disconnected case)
// ---------------------------------------------------------------------------

// Sums this week's Actions by agent name, matched against the four known
// techs (best-effort substring match — HaloPSA's agent field name and
// exact formatting haven't been confirmed against a real response yet).
//
// /api/Actions has no global/date-filtered query (confirmed: it returns
// record_count: 0 unless scoped to a ticket_id), so this fetches per
// ticket rather than once — same underlying cause as Client
// Profitability's hours computation in haloClients.ts.
//
// Scoped to tickets *touched* this week (open or closed), not
// prisma.ticketSnapshot (open tickets only) — confirmed against real data
// that most tickets close within days, so an open-only scan silently
// drops most of the week's actually-logged hours (verified: 64% of
// tickets touched in a given week were already closed, undercounting one
// tech's hours by ~70%). fetchHaloTicketHistory's ~1000-row cap covers
// several weeks, so filtering to "touched this week" is a small subset of
// it, not a fresh fan-out risk.
async function computeWeeklyHoursByTech(
  instanceUrl: string,
  accessToken: string,
): Promise<Map<Tech, number>> {
  const weekStart = startOfWeek();
  const allTickets = await fetchHaloTicketHistory(instanceUrl, accessToken);
  const ticketIds = allTickets
    .filter((t) => {
      const lastTouched = mapHaloDate(t, ["last_update", "lastactiondate", "dateoccurred"]);
      return lastTouched !== null && lastTouched >= weekStart;
    })
    .map((t) => firstString(t, ["id", "ticket_id"]))
    .filter((id): id is string => Boolean(id));

  const actionsPerTicket = await mapWithConcurrency(ticketIds, 5, (id) =>
    fetchHaloActionsForTicket(instanceUrl, accessToken, id),
  );
  const rawActions = actionsPerTicket.flat();
  if (rawActions.length > 0) {
    console.log("HaloPSA raw action sample (first result, for field-mapping reference):", JSON.stringify(rawActions[0]));
  }

  const rawHoursByTech = new Map<Tech, number>();

  for (const raw of rawActions) {
    const actionDate = mapHaloDate(raw, ["datetime", "actiondate", "date"]);
    if (actionDate && actionDate < weekStart) continue;
    const agentName = firstString(raw, ["agent", "who", "staff", "assignedto", "agentname"]);
    // timetaken is already in hours (confirmed against real data — values
    // like 1.75 = 1h45m, clean quarter-hour increments, not a minutes count).
    const hours = firstNumber(raw, ["timetaken", "actiontime", "time_taken"]) ?? 0;
    if (!agentName || hours <= 0) continue;

    const matched = matchKnownTech(agentName, KNOWN_TECHS);
    if (!matched) continue;
    rawHoursByTech.set(matched, (rawHoursByTech.get(matched) ?? 0) + hours);
  }

  const hoursByTech = new Map<Tech, number>();
  for (const [tech, hours] of rawHoursByTech) {
    hoursByTech.set(tech, Math.round(hours * 10) / 10);
  }
  return hoursByTech;
}

const EXPECTED_WEEKLY_HOURS = 40;

export async function syncTeamTimeGaps(): Promise<{ synced: number; error?: string }> {
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) {
    // No live connection — leave whatever's already there (seeded fixture
    // rows) alone rather than overwriting with zeros.
    return { synced: 0 };
  }

  try {
    const clientSecret = decryptToken(credential.encryptedClientSecret);
    const accessToken = await getHaloAccessToken(credential.instanceUrl, credential.clientId, clientSecret);
    const hoursByTech = await withComputeThrottle(
      "weeklyHoursByTech",
      HOURS_THROTTLE_MS,
      () => computeWeeklyHoursByTech(credential.instanceUrl, accessToken),
    );

    const periodStart = startOfWeek();
    const periodEnd = endOfWeek();

    for (const person of KNOWN_TECHS) {
      const loggedHours = hoursByTech.get(person) ?? 0;
      await prisma.timeGap.upsert({
        where: { person_periodStart: { person, periodStart } },
        update: { loggedHours, periodEnd },
        create: { person, role: "TECH", expectedHours: EXPECTED_WEEKLY_HOURS, loggedHours, periodStart, periodEnd },
      });
    }

    return { synced: KNOWN_TECHS.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "HaloPSA team time sync failed.";
    console.error("HaloPSA team time gaps sync failed:", err);
    return { synced: 0, error: message };
  }
}
