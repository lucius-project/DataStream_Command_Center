// Cross-System Activity — Phase 9 of the /tech-performance rebuild.
// Correlates United Cloud calls and NinjaOne remote sessions against
// currently-open HaloPSA tickets (TicketSnapshot — this app never keeps
// a historical ticket table, see its schema comment), using only the
// signals actually available: technician identity (already unified by
// name across all three systems — see contactDirectory.ts and
// matchKnownTech), client identity (phone->company for calls,
// Client.ninjaOrganizationId for sessions), and time proximity to a
// ticket's own timestamps.
//
// CONFIRMED is deliberately not a tier — see MatchTier below. HaloPSA's
// ticket data (the list endpoint; ticket detail is never fetched, see
// TicketSnapshot's schema comment) carries no per-ticket contact/phone
// field, and NinjaOne's /v2/activities payload carries no ticket
// reference of any kind (confirmed against ninjaRmm.ts's own
// field-mapping comments). Every match here is inference from tech +
// client + timing, never a direct foreign-key join.

import { prisma } from "@/lib/prisma";
import { startOfWeek, endOfWeek, weekdayIndexOf } from "@/lib/dateUtils";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import { matchKnownTech } from "@/lib/integrations/haloShared";
import { fetchNinjaUsers } from "@/lib/integrations/ninjaRmm";
import type { ContactDirectory } from "@/lib/integrations/contactDirectory";
import { excludeFalseMisses } from "./callActivity";
import { mergeIntervalSeconds } from "./remoteSessions";
import type { TechCardRow } from "./techPerformanceScore";
import type { CallRecord, RemoteSession, TicketSnapshot } from "@/app/generated/prisma/client";

// CONFIRMED is intentionally omitted from this type, not just unused —
// see the file header. Adding a CONFIRMED case here should require
// re-deriving why it wasn't reachable when this was written, not a
// casual addition.
export type MatchTier = "HIGH" | "POSSIBLE" | "UNMATCHED";

const TIGHT_WINDOW_MINUTES = 15;
const LOOSE_WINDOW_MINUTES = 120;
// Two candidate tickets within this many minutes of each other are
// treated as a tie — picking either one silently would be a small
// fabrication (see the file header's "never a direct foreign-key join"),
// so a tie caps the tier at POSSIBLE and is flagged via `ambiguous`
// rather than resolved by an arbitrary tie-break.
const AMBIGUOUS_DELTA_MINUTES = 2;

export type CallTicketMatch = {
  call: CallRecord;
  tech: Tech | null;
  ticket: TicketSnapshot | null;
  tier: MatchTier;
  ambiguous: boolean;
  // Company resolved from the call's own phone number via
  // contactDirectory.ts — null if unresolved, distinct from a resolved
  // client that simply doesn't match any candidate ticket.
  clientResolved: string | null;
};

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

// A ticket's closest plausible "was being worked on" instant relative to
// the call — either when it was opened or its last recorded activity,
// whichever is nearer. lastActionAt is any update (not necessarily a
// technician action — see TicketSnapshot's own schema comment), so this
// is an honest approximation, same caveat as everywhere else that field
// is used.
function ticketTimeDeltaMinutes(call: CallRecord, ticket: TicketSnapshot): number {
  const touch = ticket.lastActionAt ?? ticket.openedAt;
  return Math.min(minutesBetween(call.startAt, ticket.openedAt), minutesBetween(call.startAt, touch));
}

// Pure matching function — takes already-fetched calls/tickets/directory
// so it can be unit-exercised and reused without a DB round trip. See
// getCallTicketMatches below for the live, DB-backed entry point actually
// wired into the page.
export function matchCallsToTickets(
  calls: CallRecord[],
  ticketsByTech: Map<Tech, TicketSnapshot[]>,
  directory: ContactDirectory | null,
): CallTicketMatch[] {
  // Same false-miss/duplicate-leg stripping every other call metric on
  // this page already applies (see callActivity.ts) — without it, a
  // hunt-group's losing legs would each generate their own (spurious)
  // match attempt for what was really one real call.
  const eligible = directory ? excludeFalseMisses(calls, directory) : calls;

  return eligible.map((call) => {
    const tech = (call.internalExtension && directory?.extensionToTech.get(call.internalExtension)) || null;
    const clientResolved = (call.externalNumber && directory?.phoneToCompany.get(call.externalNumber)) || null;

    if (!tech) {
      return { call, tech: null, ticket: null, tier: "UNMATCHED", ambiguous: false, clientResolved };
    }

    // If the call's client is known, only consider that tech's tickets
    // for the same client (or tickets with no client name recorded, since
    // that's "unknown," not "different") — a resolved client that
    // conflicts with a candidate ticket rules that ticket out entirely
    // rather than falling back to a weaker match against the wrong client.
    const candidates = (ticketsByTech.get(tech) ?? [])
      .filter((t) => !clientResolved || !t.clientName || t.clientName.toLowerCase() === clientResolved.toLowerCase())
      .map((t) => ({ ticket: t, delta: ticketTimeDeltaMinutes(call, t) }))
      .filter((c) => c.delta <= LOOSE_WINDOW_MINUTES)
      .sort((a, b) => a.delta - b.delta);

    if (candidates.length === 0) {
      return { call, tech, ticket: null, tier: "UNMATCHED", ambiguous: false, clientResolved };
    }

    const best = candidates[0];
    const ambiguous = candidates.length > 1 && candidates[1].delta - best.delta < AMBIGUOUS_DELTA_MINUTES;
    const clientConfirmed = Boolean(
      clientResolved && best.ticket.clientName && clientResolved.toLowerCase() === best.ticket.clientName.toLowerCase(),
    );
    const tier: MatchTier = !ambiguous && clientConfirmed && best.delta <= TIGHT_WINDOW_MINUTES ? "HIGH" : "POSSIBLE";

    return { call, tech, ticket: best.ticket, tier, ambiguous, clientResolved };
  });
}

// Live entry point — fetches this business week's calls (same default
// window getCallStatsByTech in techPerformance.ts already uses) and runs
// them through matchCallsToTickets. ticketsByTech and directory are
// passed in rather than re-fetched: both are already computed once per
// page load (see app/tech-performance/page.tsx) and reused here, same
// no-duplicate-fetch discipline as the rest of this page.
export async function getCallTicketMatches(
  directory: ContactDirectory | null,
  ticketsByTech: Map<Tech, TicketSnapshot[]>,
  range: { start: Date; end: Date } = { start: startOfWeek(), end: endOfWeek() },
): Promise<CallTicketMatch[]> {
  const calls = await prisma.callRecord.findMany({
    where: { startAt: { gte: range.start, lte: range.end } },
  });
  return matchCallsToTickets(calls, ticketsByTech, directory);
}

export function callMatchesFor(matches: CallTicketMatch[], person: string): CallTicketMatch[] {
  const tech = KNOWN_TECHS.find((t) => t === person);
  return tech ? matches.filter((m) => m.tech === tech) : [];
}

// Row shape matches components/tech-performance/DrilldownStat.tsx's
// DrilldownRow (same structural-typing pattern buildTechCardTicketData
// already uses in techPerformanceScore.ts) — only matched calls (a
// resolved ticket) are shown, UNMATCHED calls have nothing to drill into.
export function buildCallMatchRows(matches: CallTicketMatch[]): TechCardRow[] {
  return matches
    .filter((m): m is CallTicketMatch & { ticket: TicketSnapshot } => m.ticket !== null)
    .map((m) => ({
      id: m.call.id,
      primary: m.ticket.haloTicketId,
      secondary: m.ticket.clientName ?? undefined,
      tertiary: `${m.tier}${m.ambiguous ? " · ambiguous" : ""} · call ${m.call.startAt.toLocaleString()} — inferred from tech/client/timing, not confirmed`,
      href: "/tech-performance",
    }));
}

// ---------------------------------------------------------------------------
// Remote Session <-> Ticket matching
// ---------------------------------------------------------------------------
//
// Same inference-only approach as calls (never CONFIRMED — see file
// header), using an ID-based join instead of a phone lookup:
// session.ninjaDeviceId -> NinjaDevice.organizationId ->
// Client.ninjaOrganizationId -> Client.haloClientId -> ticket.haloClientId.
// That chain has two independent coverage gates, not one: (a) a Client
// row has to exist at all (only clients that have gone through Client
// Profitability's sync do, see haloClients.ts), and (b) that Client's
// ninjaOrganizationId has to have been set manually via the Link Accounts
// panel (companyProfile.ts — no auto-matching exists). `clientLinked`
// exposes whether that chain resolved at all, separately from the match
// tier itself — an unresolved client here has a concrete fix (go link
// the account), unlike a call's inherent ambiguity, and conflating the
// two would misdirect a manager's remediation effort.

export type SessionTicketMatch = {
  session: RemoteSession;
  tech: Tech | null;
  ticket: TicketSnapshot | null;
  tier: MatchTier;
  ambiguous: boolean;
  clientLinked: boolean;
};

function sessionTicketDeltaMinutes(sessionStart: Date, ticket: TicketSnapshot): number {
  const touch = ticket.lastActionAt ?? ticket.openedAt;
  return Math.min(minutesBetween(sessionStart, ticket.openedAt), minutesBetween(sessionStart, touch));
}

// Pure matching function, same shape as matchCallsToTickets — takes
// already-fetched sessions/tickets plus the two small lookup maps needed
// to walk the device->org->client chain (deviceOrgId, haloClientIdByNinjaOrg).
export function matchSessionsToTickets(
  sessions: RemoteSession[],
  ticketsByTech: Map<Tech, TicketSnapshot[]>,
  deviceOrgId: Map<string, string | null>,
  haloClientIdByNinjaOrg: Map<string, string>,
  ninjaUserNames: Map<string, string>,
): SessionTicketMatch[] {
  // Only sessions that represent real, completed work — same eligibility
  // remoteSessions.ts's getRemoteSessionAnalytics already uses (failed/
  // canceled/requested-only sessions have nothing to correlate).
  const eligible = sessions.filter((s) => (s.status === "completed" || s.status === "in_progress") && s.startedAt);

  return eligible.map((session) => {
    const sessionStart = session.startedAt!;
    const tech = session.ninjaUserId ? (matchKnownTech(ninjaUserNames.get(session.ninjaUserId) ?? "", KNOWN_TECHS) ?? null) : null;

    const orgId = session.ninjaDeviceId ? deviceOrgId.get(session.ninjaDeviceId) : undefined;
    const resolvedHaloClientId = orgId ? (haloClientIdByNinjaOrg.get(orgId) ?? null) : null;
    const clientLinked = resolvedHaloClientId !== null;

    if (!tech) {
      return { session, tech: null, ticket: null, tier: "UNMATCHED", ambiguous: false, clientLinked };
    }

    // Same "a resolved client that conflicts rules the ticket out
    // entirely" safety principle as the call side — a ticket with a
    // different haloClientId than the one this session's device
    // resolved to is excluded, not weakly matched.
    const candidates = (ticketsByTech.get(tech) ?? [])
      .filter((t) => !resolvedHaloClientId || !t.haloClientId || t.haloClientId === resolvedHaloClientId)
      .map((t) => ({ ticket: t, delta: sessionTicketDeltaMinutes(sessionStart, t) }))
      .filter((c) => c.delta <= LOOSE_WINDOW_MINUTES)
      .sort((a, b) => a.delta - b.delta);

    if (candidates.length === 0) {
      return { session, tech, ticket: null, tier: "UNMATCHED", ambiguous: false, clientLinked };
    }

    const best = candidates[0];
    const ambiguous = candidates.length > 1 && candidates[1].delta - best.delta < AMBIGUOUS_DELTA_MINUTES;
    const clientConfirmed = Boolean(resolvedHaloClientId && best.ticket.haloClientId === resolvedHaloClientId);
    const tier: MatchTier = !ambiguous && clientConfirmed && best.delta <= TIGHT_WINDOW_MINUTES ? "HIGH" : "POSSIBLE";

    return { session, tech, ticket: best.ticket, tier, ambiguous, clientLinked };
  });
}

// Live entry point — mirrors getCallTicketMatches. Devices/users/client
// links are small, unpersisted, always-fresh lookups (same pattern
// getRemoteSessionAnalytics already uses for fetchNinjaUsers/
// fetchNinjaOrganizations), not re-derived or cached here.
export async function getSessionTicketMatches(
  ticketsByTech: Map<Tech, TicketSnapshot[]>,
  range: { start: Date; end: Date } = { start: startOfWeek(), end: endOfWeek() },
): Promise<SessionTicketMatch[]> {
  const [sessions, devices, ninjaUserNames, linkedClients] = await Promise.all([
    prisma.remoteSession.findMany({ where: { startedAt: { gte: range.start, lte: range.end } } }),
    prisma.ninjaDevice.findMany({ select: { ninjaDeviceId: true, organizationId: true } }),
    fetchNinjaUsers().catch(() => new Map<string, string>()),
    prisma.client.findMany({ where: { ninjaOrganizationId: { not: null } }, select: { haloClientId: true, ninjaOrganizationId: true } }),
  ]);

  const deviceOrgId = new Map(devices.map((d) => [d.ninjaDeviceId, d.organizationId]));
  const haloClientIdByNinjaOrg = new Map(linkedClients.map((c) => [c.ninjaOrganizationId!, c.haloClientId]));

  return matchSessionsToTickets(sessions, ticketsByTech, deviceOrgId, haloClientIdByNinjaOrg, ninjaUserNames);
}

export function sessionMatchesFor(matches: SessionTicketMatch[], person: string): SessionTicketMatch[] {
  const tech = KNOWN_TECHS.find((t) => t === person);
  return tech ? matches.filter((m) => m.tech === tech) : [];
}

export function buildSessionMatchRows(matches: SessionTicketMatch[]): TechCardRow[] {
  return matches
    .filter((m): m is SessionTicketMatch & { ticket: TicketSnapshot } => m.ticket !== null)
    .map((m) => ({
      id: m.session.id,
      primary: m.ticket.haloTicketId,
      secondary: m.ticket.clientName ?? undefined,
      tertiary: `${m.tier}${m.ambiguous ? " · ambiguous" : ""} · session ${m.session.startedAt?.toLocaleString() ?? ""} — inferred from tech/client/timing, not confirmed`,
      href: "/tech-performance",
    }));
}

// ---------------------------------------------------------------------------
// Overlap engine — Customer Interaction Time
// ---------------------------------------------------------------------------
//
// Deliberately built from the already-computed match arrays above
// (matchCallsToTickets / matchSessionsToTickets return one entry per
// eligible call/session regardless of whether a ticket matched — ticket
// matching is an additive field, not a filter), rather than a fresh DB
// fetch: both arrays already carry per-tech attribution, so this avoids
// re-querying CallRecord/RemoteSession and re-fetching NinjaOne's user
// list a second time in the same page load.
//
// "Never naively sum durations from different systems" (governing
// philosophy) — a call and a remote session on the same tech can
// genuinely overlap (e.g. talking a client through something while
// remoted into their machine), so this merges intervals via the same
// mergeIntervalSeconds already used for Ninja's own gross-vs-unique time,
// bucketed per business-weekday first so a merge never spans across days.

export type InteractionDayBucket = {
  weekdayIndex: number; // 0=Mon..4=Fri, matches DailyHours' own row ordering
  intervalSeconds: number; // deduped call+session time for that day
};

function bucketIntervalsByWeekday(intervals: { start: Date; end: Date }[]): InteractionDayBucket[] {
  const byDay = new Map<number, { start: Date; end: Date }[]>();
  for (const iv of intervals) {
    const idx = weekdayIndexOf(iv.start);
    const arr = byDay.get(idx) ?? [];
    arr.push(iv);
    byDay.set(idx, arr);
  }
  return Array.from({ length: 5 }, (_, idx) => ({
    weekdayIndex: idx,
    intervalSeconds: mergeIntervalSeconds(byDay.get(idx) ?? []),
  }));
}

// Only answered calls (a missed call has no interaction) and only
// completed sessions with both a start and end (same eligibility
// remoteSessions.ts already applies before treating a session as a real
// duration) contribute an interval.
export function getCustomerInteractionTime(
  callMatches: CallTicketMatch[],
  sessionMatches: SessionTicketMatch[],
): Map<Tech, InteractionDayBucket[]> {
  const intervalsByTech = new Map<Tech, { start: Date; end: Date }[]>();

  for (const m of callMatches) {
    if (!m.tech || m.call.missed) continue;
    const start = m.call.startAt;
    const end = new Date(start.getTime() + m.call.durationSeconds * 1000);
    const arr = intervalsByTech.get(m.tech) ?? [];
    arr.push({ start, end });
    intervalsByTech.set(m.tech, arr);
  }

  for (const m of sessionMatches) {
    if (!m.tech || m.session.status !== "completed" || !m.session.startedAt || !m.session.endedAt) continue;
    const arr = intervalsByTech.get(m.tech) ?? [];
    arr.push({ start: m.session.startedAt, end: m.session.endedAt });
    intervalsByTech.set(m.tech, arr);
  }

  const result = new Map<Tech, InteractionDayBucket[]>();
  for (const [tech, intervals] of intervalsByTech) {
    result.set(tech, bucketIntervalsByWeekday(intervals));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Time Coverage
// ---------------------------------------------------------------------------
//
// Relates Customer Interaction Time to DailyHours (HaloPSA's own
// Timesheet-derived logged hours, see halopsa.ts's computeWeeklyHoursByTech
// — read here as-is, no new HaloPSA fetch). NOT a productivity measure —
// a tech doing legitimate deep-work/documentation with zero calls or
// sessions that day will show near-0% coverage, and that's expected, not
// a red flag. See buildTimeCoverageRows' copy and the UI caveat this
// feeds (TechPerformanceRow.tsx).
//
// REVIEW_THRESHOLD_PCT is an uncalibrated starting guess (per the Phase 9
// plan) — >100% is possible (e.g. logged hours understate real work, a
// self-reported Timesheet) and must never be clamped or hidden, just
// flagged non-accusatorially for a manager to look at, not treated as
// an error.

const REVIEW_THRESHOLD_PCT = 120;

export type TimeCoverageDay = {
  weekdayIndex: number;
  date: Date | null; // the DailyHours row's own date, if one exists for this weekday
  interactionSeconds: number;
  loggedHours: number | null; // null when no DailyHours row exists for that day
  coveragePct: number | null; // null whenever loggedHours is null or zero
  status: "available" | "no_logged_hours" | "review";
};

// dailyRows is expected ordered ascending by date, one row per weekday —
// same convention techPerformance.ts's own dailyByPerson bucketing
// already relies on (DailyHours is upserted per known tech per weekday,
// zero-hour days included, so index 0..4 lines up with Mon..Fri).
function buildTimeCoverageDays(
  interactionDays: InteractionDayBucket[],
  dailyRowsForTech: { date: Date; hours: number }[],
): TimeCoverageDay[] {
  return interactionDays.map((b) => {
    const dailyRow = dailyRowsForTech[b.weekdayIndex];
    if (!dailyRow || dailyRow.hours <= 0) {
      return {
        weekdayIndex: b.weekdayIndex,
        date: dailyRow?.date ?? null,
        interactionSeconds: b.intervalSeconds,
        loggedHours: dailyRow?.hours ?? null,
        coveragePct: null,
        status: "no_logged_hours",
      };
    }
    const pct = Math.round((b.intervalSeconds / (dailyRow.hours * 3600)) * 1000) / 10;
    return {
      weekdayIndex: b.weekdayIndex,
      date: dailyRow.date,
      interactionSeconds: b.intervalSeconds,
      loggedHours: dailyRow.hours,
      coveragePct: pct,
      status: pct > REVIEW_THRESHOLD_PCT ? "review" : "available",
    };
  });
}

export async function getTimeCoverage(
  interactionByTech: Map<Tech, InteractionDayBucket[]>,
  range: { start: Date; end: Date } = { start: startOfWeek(), end: endOfWeek() },
): Promise<Map<Tech, TimeCoverageDay[]>> {
  const dailyRows = await prisma.dailyHours.findMany({
    where: { date: { gte: range.start, lte: range.end } },
    orderBy: { date: "asc" },
  });
  const dailyByPerson = new Map<string, { date: Date; hours: number }[]>();
  for (const row of dailyRows) {
    const arr = dailyByPerson.get(row.person) ?? [];
    arr.push({ date: row.date, hours: row.hours });
    dailyByPerson.set(row.person, arr);
  }

  const emptyBuckets: InteractionDayBucket[] = Array.from({ length: 5 }, (_, i) => ({ weekdayIndex: i, intervalSeconds: 0 }));
  const result = new Map<Tech, TimeCoverageDay[]>();
  for (const tech of KNOWN_TECHS) {
    const interactionDays = interactionByTech.get(tech) ?? emptyBuckets;
    result.set(tech, buildTimeCoverageDays(interactionDays, dailyByPerson.get(tech) ?? []));
  }
  return result;
}

export type TechTimeCoverageSummary = {
  pct: number | null; // null if no day this week has a logged-hours row to compare against
  status: "available" | "review" | "unavailable";
  days: TimeCoverageDay[];
};

// Weekly rollup — only days with a real DailyHours row contribute to the
// ratio, same "never divide by zero or show a fake number" rule each
// individual day already follows.
export function summarizeTimeCoverage(days: TimeCoverageDay[]): TechTimeCoverageSummary {
  const withHours = days.filter((d) => d.loggedHours !== null && d.loggedHours > 0);
  if (withHours.length === 0) return { pct: null, status: "unavailable", days };

  const totalInteractionSeconds = withHours.reduce((sum, d) => sum + d.interactionSeconds, 0);
  const totalLoggedSeconds = withHours.reduce((sum, d) => sum + d.loggedHours! * 3600, 0);
  const pct = Math.round((totalInteractionSeconds / totalLoggedSeconds) * 1000) / 10;
  return { pct, status: pct > REVIEW_THRESHOLD_PCT ? "review" : "available", days };
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function hoursMinutesLabel(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function buildTimeCoverageRows(days: TimeCoverageDay[]): TechCardRow[] {
  return days.map((d) => {
    const label = WEEKDAY_LABELS[d.weekdayIndex];
    if (d.status === "no_logged_hours") {
      return {
        id: `coverage-${d.weekdayIndex}`,
        primary: label,
        secondary: "no logged hours",
        tertiary: `${hoursMinutesLabel(d.interactionSeconds)} of phone/remote interaction time — coverage unavailable without a logged-hours day to compare against`,
      };
    }
    return {
      id: `coverage-${d.weekdayIndex}`,
      primary: label,
      secondary: `${d.coveragePct}%`,
      tertiary: `${hoursMinutesLabel(d.interactionSeconds)} interaction vs ${d.loggedHours}h logged${d.status === "review" ? " — REVIEW: unusually high, worth a look" : ""}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Activity Timeline
// ---------------------------------------------------------------------------
//
// Merges calls, remote sessions, and newly-opened tickets for one tech
// into a single chronological feed — the foundation the spec describes
// for "the customer's actual service journey." Built from the same
// already-computed match arrays as Customer Interaction Time, so
// call/session entries carry their match tier for free; ticket entries
// have no tier (a ticket doesn't match itself).

export type TimelineEntryType = "call" | "remote_session" | "ticket";

export type TimelineEntry = {
  id: string;
  type: TimelineEntryType;
  at: Date;
  primary: string;
  secondary?: string;
  tertiary?: string;
  tier?: MatchTier;
};

export function getActivityTimeline(
  tech: Tech,
  callMatches: CallTicketMatch[],
  sessionMatches: SessionTicketMatch[],
  ticketsByTech: Map<Tech, TicketSnapshot[]>,
  // NinjaOne device id -> its synced displayName (NinjaDevice, see
  // remoteSessions.ts's own deviceById for the same lookup pattern) —
  // fetched once by the caller, not re-queried per tech. A session whose
  // device id doesn't resolve (device deleted/unsynced) falls back to a
  // neutral placeholder rather than a guessed name.
  deviceNameById: Map<string, string> = new Map(),
  range: { start: Date; end: Date } = { start: startOfWeek(), end: endOfWeek() },
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const m of callMatches) {
    if (m.tech !== tech) continue;
    entries.push({
      id: `call-${m.call.id}`,
      type: "call",
      at: m.call.startAt,
      primary: `${m.call.direction} call${m.call.missed ? " — missed" : ""}`,
      secondary: m.clientResolved ?? undefined,
      tertiary: m.ticket
        ? `${m.tier}${m.ambiguous ? " · ambiguous" : ""} → ${m.ticket.haloTicketId} — inferred, not confirmed`
        : "no ticket matched",
      tier: m.tier,
    });
  }

  for (const m of sessionMatches) {
    if (m.tech !== tech || !m.session.startedAt) continue;
    const deviceName = m.session.ninjaDeviceId ? (deviceNameById.get(m.session.ninjaDeviceId) ?? "unknown device") : "unknown device";
    entries.push({
      id: `session-${m.session.id}`,
      type: "remote_session",
      at: m.session.startedAt,
      primary: `Remote session — ${deviceName}`,
      secondary: m.session.durationSeconds ? hoursMinutesLabel(m.session.durationSeconds) : "in progress",
      tertiary: m.ticket
        ? `${m.tier}${m.ambiguous ? " · ambiguous" : ""} → ${m.ticket.haloTicketId} — inferred, not confirmed`
        : m.clientLinked
          ? "no ticket matched"
          : "client not linked to NinjaOne",
      tier: m.tier,
    });
  }

  // Only tickets opened within this same window — an aging ticket opened
  // weeks ago would otherwise clutter a "this week's activity" feed with
  // an event that didn't happen this week.
  for (const t of ticketsByTech.get(tech) ?? []) {
    if (t.openedAt < range.start || t.openedAt > range.end) continue;
    entries.push({
      id: `ticket-${t.id}`,
      type: "ticket",
      at: t.openedAt,
      primary: "Ticket opened",
      secondary: t.clientName ?? undefined,
      tertiary: `${t.haloTicketId} · ${t.priority} · ${t.status}`,
    });
  }

  // Newest first — a manager reviewing this week's activity wants to see
  // what just happened at the top, not scroll to the bottom for it.
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

// Org-level health indicator for the remote<->ticket join's manual link
// gate (see the section header above) — without this, "0 matched
// sessions for Client X" silently reads as "no remote work happened"
// instead of "not linked yet."
export async function getClientLinkCoverage(): Promise<{ linked: number; total: number }> {
  const [linked, total] = await Promise.all([
    prisma.client.count({ where: { ninjaOrganizationId: { not: null } } }),
    prisma.client.count(),
  ]);
  return { linked, total };
}
