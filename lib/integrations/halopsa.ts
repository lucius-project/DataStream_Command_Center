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
  mapHaloDateOnly,
  fetchHaloAgentNames,
  fetchHaloStatusNames,
  fetchHaloTimesheet,
  fetchHaloTicketById,
  matchKnownTech,
  withComputeThrottle,
  mapWithConcurrency,
  HOURS_THROTTLE_MS,
  type RawHaloRecord,
} from "./haloShared";
import { startOfWeek, endOfWeek } from "@/lib/dateUtils";
import { generateAttentionFlagsFromTickets } from "@/lib/services/operations";
import { getTechRoleConfigs } from "@/lib/services/kpiSettings";
import type { TicketPriority } from "@/app/generated/prisma/client";

export type Tech = "Miguel" | "Cameron" | "Darryll" | "Emily";
export const KNOWN_TECHS: Tech[] = ["Miguel", "Cameron", "Darryll", "Emily"];

// HaloPSA ticket type IDs for "Project" and "Project Task" (confirmed
// live via GET /api/TicketType — both are the only two entries with
// use: "projects", distinct from ordinary service-desk tickets). Used
// by managerAlerts.ts/noChargeTickets.ts to exclude project-tracking
// tickets from Needs Attention/Manager Alerts — those are tracked in
// their own project workflow, not the service desk queue this app's
// alert rules are tuned for. Instance-specific numeric IDs, not
// something to re-derive from a name string at read time.
export const PROJECT_TICKET_TYPE_IDS: ReadonlySet<number> = new Set([5, 20]);

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
  { haloTicketId: "HALO-10243", summary: "AutoElevate approval queue backed up", status: "In Progress", priority: "P2", assignedTech: "Darryll", department: "Service Delivery", openedHoursAgo: 26, slaDueHours: 2 },
  { haloTicketId: "HALO-10233", summary: "New user onboarding — laptop imaging and setup", status: "In Progress", priority: "P3", assignedTech: "Darryll", department: "Service Delivery", openedHoursAgo: 24, slaDueHours: 24 },
  { haloTicketId: "HALO-10237", summary: "Wifi dropping intermittently — 2nd floor east wing", status: "In Progress", priority: "P3", assignedTech: "Darryll", department: "Service Delivery", openedHoursAgo: 6, slaDueHours: 18 },
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

// In-memory only (not DB-persisted like NinjaOne's refresh token) — this
// is a client_credentials machine token with no refresh token to
// protect, cheap to re-fetch on a cold start, so DB persistence would be
// unneeded complexity. Without this cache, every /tech-performance load
// did two live token exchanges (syncTicketsFromHalo + syncTeamTimeGaps
// each call this independently), which also eats into HaloPSA's
// 700-req/5-min rate limit for no benefit (see haloShared.ts's own
// comment on that limit).
let cachedToken: { token: string; expiresAt: number; instanceUrl: string; clientId: string } | null = null;

export async function getHaloAccessToken(
  instanceUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const now = Date.now();
  if (
    cachedToken &&
    cachedToken.instanceUrl === instanceUrl &&
    cachedToken.clientId === clientId &&
    cachedToken.expiresAt > now
  ) {
    return cachedToken.token;
  }

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
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("HaloPSA token response did not include an access_token.");
  }

  // 60s safety margin so a token doesn't expire mid-request right at the
  // edge of its lifetime; default to 1h if HaloPSA ever omits expires_in.
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  cachedToken = { token: data.access_token, expiresAt: now + expiresInMs - 60_000, instanceUrl, clientId };
  return data.access_token;
}

function invalidateHaloAccessToken(): void {
  cachedToken = null;
}

function isHaloAuthError(err: unknown): boolean {
  return err instanceof Error && /\(401\)/.test(err.message);
}

// Confirmed live: HaloPSA can invalidate a token before its own declared
// expires_in elapses (a fresh token request immediately after a 401
// succeeds fine) — without this, the cache above would keep serving that
// same dead token to every caller for the rest of its claimed lifetime,
// turning one bad token into a cascading failure across every HaloPSA
// call this app makes. Wraps "get a (possibly cached) token, call the
// API" — on a 401 specifically, clears the cache and retries exactly
// once with a freshly-fetched token; any other error, or a second
// failure, is a real problem and propagates rather than being swallowed.
export async function withHaloAuthRetry<T>(
  instanceUrl: string,
  clientId: string,
  clientSecret: string,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const token = await getHaloAccessToken(instanceUrl, clientId, clientSecret);
  try {
    return await fn(token);
  } catch (err) {
    if (!isHaloAuthError(err)) throw err;
    invalidateHaloAccessToken();
    const freshToken = await getHaloAccessToken(instanceUrl, clientId, clientSecret);
    return fn(freshToken);
  }
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
//
// Before deleting, each departing ticket is snapshotted into
// TicketCloseLog — see that model's comment in schema.prisma for why
// (Created-vs-Closed, Net Ticket Change, and Resolution SLA all need to
// know about tickets that just closed, which TicketSnapshot itself can't
// answer once the row is gone). Uses whatever fields are already cached
// locally — no extra HaloPSA call. Skipped for the mock/disconnected
// path (syncMockTickets never calls this), so Created/Closed/Resolution
// SLA correctly read "unavailable" rather than fabricated until a real
// HaloPSA connection exists.
async function reconcileTickets(instanceUrl: string, accessToken: string, liveHaloTicketIds: string[]): Promise<void> {
  const stale = await prisma.ticketSnapshot.findMany({
    where: { haloTicketId: { notIn: liveHaloTicketIds } },
  });
  if (stale.length === 0) return;

  const closedAt = new Date();

  // A ticket leaves the open feed either because it genuinely closed, or
  // because it was deleted (or merged — still not distinguished, see
  // TicketCloseLog's schema comment) — open_only=true can't tell those
  // apart on its own. Confirmed live: 34% of what this used to log as
  // "closed" over a 30-day window were actually deleted noise tickets
  // (device-offline alerts, UPS battery pings, bounced mail, etc.),
  // inflating Ticket Trend/Net Change/Resolution SLA. This confirms each
  // stale ticket individually via fetchHaloTicketById before deciding
  // whether it belongs in TicketCloseLog. Small, bounded fan-out — only
  // tickets that actually left the feed since the last sync, not the
  // whole backlog — same concurrency-limiting pattern as the Actions
  // fan-outs elsewhere. A lookup that errors (network/auth hiccup, not a
  // confirmed 404/deleted) falls back to the old "assume closed"
  // behavior for that one ticket rather than silently dropping it —
  // unconfirmed is closer to "probably closed" than "definitely deleted."
  const deletedById = new Map<string, boolean>(
    await mapWithConcurrency(stale, 5, async (t): Promise<[string, boolean]> => {
      try {
        const record = await fetchHaloTicketById(instanceUrl, accessToken, t.haloTicketId);
        return [t.haloTicketId, record === null || record.deleted === true];
      } catch {
        return [t.haloTicketId, false];
      }
    }),
  );

  for (const t of stale) {
    if (deletedById.get(t.haloTicketId)) continue; // deleted, not closed — no TicketCloseLog entry
    await prisma.ticketCloseLog.upsert({
      where: { haloTicketId: t.haloTicketId },
      update: {
        clientName: t.clientName,
        summary: t.summary,
        priority: t.priority,
        assignedTech: t.assignedTech,
        department: t.department,
        openedAt: t.openedAt,
        respondByAt: t.respondByAt,
        fixByAt: t.fixByAt,
        respondedAt: t.respondedAt,
        closedAt,
      },
      create: {
        haloTicketId: t.haloTicketId,
        clientName: t.clientName,
        summary: t.summary,
        priority: t.priority,
        assignedTech: t.assignedTech,
        department: t.department,
        openedAt: t.openedAt,
        respondByAt: t.respondByAt,
        fixByAt: t.fixByAt,
        respondedAt: t.respondedAt,
        closedAt,
      },
    });
  }

  // Deleted tickets still leave TicketSnapshot/AttentionFlag — they're
  // gone from HaloPSA's open feed either way, just not counted as a
  // "close" — so this cleanup stays unconditional for every stale ticket.
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
  const [rawTickets, agentNames, statusNames] = await withHaloAuthRetry(
    credential.instanceUrl,
    credential.clientId,
    clientSecret,
    (accessToken) =>
      Promise.all([
        fetchHaloTickets(credential.instanceUrl, accessToken),
        fetchHaloAgentNames(credential.instanceUrl, accessToken),
        fetchHaloStatusNames(credential.instanceUrl, accessToken),
      ]),
  );

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
    // Unmerged versions of the above, plus the actual response timestamp
    // and last-activity timestamp — all confirmed present on this same
    // list endpoint response, no extra request needed. See the field
    // comments on TicketSnapshot in schema.prisma for what each backs.
    const respondByAt = mapHaloDate(raw, ["respondbydate"]);
    const fixByAt = mapHaloDate(raw, ["fixbydate"]);
    const respondedAt = mapHaloDate(raw, ["responsedate"]);
    const lastActionAt = mapHaloDate(raw, ["lastactiondate"]);
    const ticketTypeId = firstNumber(raw, ["tickettype_id"]) ?? null;
    const haloClientId = firstString(raw, ["client_id", "clientid"]) ?? null;
    // Raw client_name off the ticket — confirmed live to be reliably
    // populated (50/50 on a real open-ticket sync) and already on this
    // same list response. See the field's comment on TicketSnapshot in
    // schema.prisma for why this is preferred over joining the Client table.
    const clientName = firstString(raw, ["client_name"]) ?? null;

    await prisma.ticketSnapshot.upsert({
      where: { haloTicketId },
      update: {
        summary,
        status,
        priority,
        assignedTech,
        department,
        ticketTypeId,
        slaDueAt,
        respondByAt,
        fixByAt,
        respondedAt,
        lastActionAt,
        haloClientId,
        clientName,
        lastUpdatedAt: new Date(),
      },
      create: {
        haloTicketId,
        summary,
        status,
        priority,
        assignedTech,
        department,
        ticketTypeId,
        openedAt,
        slaDueAt,
        respondByAt,
        fixByAt,
        respondedAt,
        lastActionAt,
        haloClientId,
        clientName,
        lastUpdatedAt: new Date(),
      },
    });
  }

  // Separate withHaloAuthRetry call (rather than reusing the token from
  // the batch above) since that token was scoped to that callback and
  // reconcileTickets' own per-ticket lookups need one in scope here.
  await withHaloAuthRetry(credential.instanceUrl, credential.clientId, clientSecret, (accessToken) =>
    reconcileTickets(credential.instanceUrl, accessToken, liveHaloTicketIds),
  );

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

function dayKey(date: Date): string {
  return date.toISOString();
}

// Monday-Friday of the current business week (see lib/dateUtils.ts) as
// midnight-normalized Date objects — the fixed set of keys DailyHours
// always writes a row for, same "every known tech/period gets a row,
// even a zero one" pattern TimeGap already uses.
function weekdayDates(): Date[] {
  const start = startOfWeek();
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

type WeeklyHours = {
  weekly: Map<Tech, number>;
  // tech -> ISO day key -> hours, Monday-Friday only.
  daily: Map<Tech, Map<string, number>>;
  // Client-chargeable portion of weekly, from HaloPSA's own
  // Timesheet.chargeable_hours field — see its own comment below for why
  // this is trustworthy despite occasionally exceeding actual_hours on a
  // single day.
  chargeableWeekly: Map<Tech, number>;
};

// Sums HaloPSA's own Timesheet rows (actual_hours) by agent name, matched
// against the four known techs — see fetchHaloTimesheet's comment in
// haloShared.ts for why this replaced summing ticket Actions. One call,
// no per-ticket fan-out, unlike the old approach (or Client
// Profitability's hoursThisMonth in haloClients.ts, which still has to
// fan out since it's asking a different question — hours *per client*,
// which Timesheet rows don't carry).
async function computeWeeklyHoursByTech(
  instanceUrl: string,
  accessToken: string,
): Promise<WeeklyHours> {
  const weekStart = startOfWeek();
  const weekEnd = endOfWeek();
  const rows = await fetchHaloTimesheet(instanceUrl, accessToken);
  if (rows.length > 0) {
    console.log("HaloPSA raw timesheet sample (first result, for field-mapping reference):", JSON.stringify(rows[0]));
  }

  const rawHoursByTech = new Map<Tech, number>();
  const rawDailyByTech = new Map<Tech, Map<string, number>>();
  const rawChargeableByTech = new Map<Tech, number>();

  for (const raw of rows) {
    // mapHaloDateOnly, not mapHaloDate — see its comment in haloShared.ts.
    // This field's time-of-day is an artifact, not the tech's actual
    // clock-in time, and converting it through local-timezone getters
    // shifts the calendar date backward on this (UTC-negative-offset)
    // instance.
    const date = mapHaloDateOnly(raw, ["date"]);
    if (!date || date < weekStart || date > weekEnd) continue;

    const agentName = firstString(raw, ["agent_name"]);
    if (!agentName) continue;
    const matched = matchKnownTech(agentName, KNOWN_TECHS);
    if (!matched) continue;

    const hours = firstNumber(raw, ["actual_hours"]) ?? 0;
    if (hours > 0) {
      rawHoursByTech.set(matched, (rawHoursByTech.get(matched) ?? 0) + hours);

      const key = dayKey(date);
      const dayMap = rawDailyByTech.get(matched) ?? new Map<string, number>();
      dayMap.set(key, (dayMap.get(key) ?? 0) + hours);
      rawDailyByTech.set(matched, dayMap);
    }

    // Tracked independently of actual_hours (not `hours > 0`-gated above)
    // — confirmed live that chargeable_hours can be nonzero on a day
    // actual_hours reads as ~0 (and can even exceed actual_hours some
    // days), since it comes from ticket time entries marked chargeable
    // rather than the timesheet's own approved daily total. Summing the
    // whole week smooths out that day-level noise into a meaningful
    // client-vs-internal split.
    const chargeableHours = firstNumber(raw, ["chargeable_hours"]) ?? 0;
    if (chargeableHours > 0) {
      rawChargeableByTech.set(matched, (rawChargeableByTech.get(matched) ?? 0) + chargeableHours);
    }
  }

  const hoursByTech = new Map<Tech, number>();
  for (const [tech, hours] of rawHoursByTech) {
    hoursByTech.set(tech, Math.round(hours * 10) / 10);
  }

  const dailyByTech = new Map<Tech, Map<string, number>>();
  for (const [tech, dayMap] of rawDailyByTech) {
    const rounded = new Map<string, number>();
    for (const [key, hours] of dayMap) {
      rounded.set(key, Math.round(hours * 10) / 10);
    }
    dailyByTech.set(tech, rounded);
  }

  const chargeableByTech = new Map<Tech, number>();
  for (const [tech, hours] of rawChargeableByTech) {
    chargeableByTech.set(tech, Math.round(hours * 10) / 10);
  }

  return { weekly: hoursByTech, daily: dailyByTech, chargeableWeekly: chargeableByTech };
}

export async function syncTeamTimeGaps(): Promise<{ synced: number; error?: string }> {
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) {
    // No live connection — leave whatever's already there (seeded fixture
    // rows) alone rather than overwriting with zeros.
    return { synced: 0 };
  }

  try {
    const clientSecret = decryptToken(credential.encryptedClientSecret);
    const { weekly: hoursByTech, daily: dailyByTech, chargeableWeekly: chargeableByTech } = await withHaloAuthRetry(
      credential.instanceUrl,
      credential.clientId,
      clientSecret,
      (accessToken) =>
        withComputeThrottle(
          "weeklyHoursByTech",
          HOURS_THROTTLE_MS,
          () => computeWeeklyHoursByTech(credential.instanceUrl, accessToken),
        ),
    );

    const periodStart = startOfWeek();
    const periodEnd = endOfWeek();
    const days = weekdayDates();
    // Per-tech, admin-editable (Phase 12, /admin) — replaces the old flat
    // EXPECTED_WEEKLY_HOURS = 40 constant applied uniformly to everyone.
    const techRoleConfigs = await getTechRoleConfigs(KNOWN_TECHS);

    for (const person of KNOWN_TECHS) {
      const loggedHours = hoursByTech.get(person) ?? 0;
      const expectedHours = techRoleConfigs.get(person)?.expectedWeeklyHours ?? 40;
      // chargeableHours stays null (not 0) when this week's sync found no
      // chargeable_hours rows at all for this tech, same "unavailable,
      // not zero" rule as everywhere else in this app — a tech who
      // genuinely logged 0 client hours this week looks identical to one
      // whose data just hasn't synced yet unless the two are told apart,
      // so this only writes a real number when the raw data had one.
      const chargeableHours = chargeableByTech.get(person) ?? null;
      const expectedChargeableHours = techRoleConfigs.get(person)?.expectedChargeableHours ?? 30;
      await prisma.timeGap.upsert({
        where: { person_periodStart: { person, periodStart } },
        // expectedHours included in `update` too (not just `create`) so
        // an admin's change takes effect on the very next page load this
        // week, not only starting next week's first sync.
        update: { loggedHours, periodEnd, expectedHours, chargeableHours, expectedChargeableHours },
        create: { person, role: "TECH", expectedHours, loggedHours, chargeableHours, expectedChargeableHours, periodStart, periodEnd },
      });

      const dayMap = dailyByTech.get(person);
      for (const date of days) {
        const hours = dayMap?.get(dayKey(date)) ?? 0;
        await prisma.dailyHours.upsert({
          where: { person_date: { person, date } },
          update: { hours },
          create: { person, date, hours },
        });
      }
    }

    return { synced: KNOWN_TECHS.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "HaloPSA team time sync failed.";
    console.error("HaloPSA team time gaps sync failed:", err);
    return { synced: 0, error: message };
  }
}
