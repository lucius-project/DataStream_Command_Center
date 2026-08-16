import { prisma } from "@/lib/prisma";
import { startOfWeek, endOfWeek, weekFractionElapsed, todayWeekdayIndex, isBusinessHours, startOfToday } from "@/lib/dateUtils";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import { matchKnownTech } from "@/lib/integrations/haloShared";
import { paceSeverity } from "@/lib/hoursSeverity";
import { bandHigherIsBetter, bandLowerIsBetter, type KpiStatus } from "@/lib/kpiStatus";
import type { Kpi } from "./businessHealth";
import type { ContactDirectory } from "@/lib/integrations/contactDirectory";
import { excludeFalseMisses } from "./callActivity";
import { getLoadPerTech } from "./operations";
import { buildTrend } from "./stats";

const TREND_WEEKS = 8;

export type TechTrendPoint = { periodStart: string; loggedHours: number; expectedHours: number };

// Narrower than KpiStatus (which also has "unavailable", for a KPI with
// no data source connected at all) — every tech always has *some*
// standing on hours/tickets, even if it's "zero logged, zero assigned,"
// so "unavailable" never applies to an individual tech the way it can to
// an org-level KPI with a disconnected integration.
export type TechStatus = "green" | "yellow" | "red";

export type TechPerformance = {
  person: string;
  // Worst-of hours-utilization / P1-count / aging-count — a single
  // glanceable signal instead of making the reader mentally combine
  // eight separate numbers. `flag` is the plain-English reason for a
  // non-green status (the worst category's own explanation); null when
  // status is green — nothing to explain. Deliberately no composite
  // rank/leaderboard position here — this is a coaching tool, not a
  // leaderboard (see deriveTechStatus for the same three categories,
  // used for status only).
  status: TechStatus;
  flag: string | null;
  expectedHours: number;
  loggedHours: number;
  // loggedHours as a % of expectedHours pro-rated by how much of the
  // business week has elapsed (see weekFractionElapsed) — the headline
  // number/bar on the card. expectedHoursToDate is that pro-rated
  // denominator, for the literal "Xh logged · Yh expected to date"
  // subtext. expectedHours/loggedHours above stay the full-week absolute
  // figures — still shown, just not what drives the color anymore.
  pacePct: number;
  expectedHoursToDate: number;
  trend: TechTrendPoint[];
  dailyHours: number[];
  openCount: number;
  p1Count: number;
  agingCount: number;
  onHoldCount: number;
  callsInbound: number;
  callsOutbound: number;
  callsAnswered: number;
  avgTalkMinutes: number;
  avgAnswerSeconds: number | null;
};

// Org-wide rollup — sums/reweights the same raw per-tech data as
// TechPerformance rather than re-deriving from the already-rounded
// per-tech figures, so avgTalkMinutes/avgAnswerSeconds/pickupRate here
// are exact weighted values, not an average-of-averages.
//
// callsMissed and pickupRate are legitimate *only* at this org-wide
// level, unlike on an individual TechPerformance row. HaloPSA's phone
// system rings the whole team at once (a hunt group), so a CDR's
// internalExtension for an unanswered call reflects whichever extension
// the record happened to log, not "the one person who should have
// answered" — attributing a miss to one tech would be a guess dressed up
// as data. But "the team didn't pick this call up" is a real fact
// independent of who — that's what this section reports.
export type TechOrgSummary = {
  expectedHours: number;
  loggedHours: number;
  dailyHours: number[];
  openCount: number;
  p1Count: number;
  agingCount: number;
  onHoldCount: number;
  callsInbound: number;
  callsOutbound: number;
  callsAnswered: number;
  callsMissed: number;
  avgTalkMinutes: number;
  avgAnswerSeconds: number | null;
  pickupRate: number | null;
};

type CallStats = {
  inboundAnswered: number;
  inboundMissed: number;
  outboundAnswered: number;
  outboundMissed: number;
  talkSeconds: number;
  ringSeconds: number;
  ringCount: number;
};

// Attributed via CallRecord.internalExtension -> directory.extensionToTech
// (see contactDirectory.ts, sourced from United Cloud's own extension
// directory) — a call whose extension isn't a known tech (e.g. it only
// reached a hunt group, never a specific person) stays unattributed
// rather than guessed. Inbound and outbound are tracked separately:
// pickupRate and avgAnswerSeconds are about how the tech handles calls
// *coming in* to them, so mixing in outbound calls (which they always
// "answer" since they placed them) would inflate both. avgTalkMinutes
// still covers both directions — outbound client calls are real work too.
// `range` defaults to the current week; the week-over-week trend below
// calls this again with last week's range so both periods go through
// identical logic.
async function getCallStatsByTech(
  directory: ContactDirectory | null,
  range: { start: Date; end: Date } = { start: startOfWeek(), end: endOfWeek() },
): Promise<Map<Tech, CallStats>> {
  const stats = new Map<Tech, CallStats>();
  if (!directory) return stats;

  const rawCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: range.start, lte: range.end }, internalExtension: { not: null } },
    select: { internalExtension: true, direction: true, missed: true, durationSeconds: true, startAt: true, answeredAt: true },
  });
  // isBusinessHours (dateUtils.ts): after-hours calls route to voicemail
  // rather than ringing a tech. excludeFalseMisses (callActivity.ts):
  // strips queue-abandons that never reached a desk phone and
  // simultaneous-ring duplicate legs where a different tech actually
  // answered the same call — both would otherwise inflate missed counts
  // and dilute pickup rate/ring time for something nobody was ever
  // meant (or able) to answer.
  const calls = excludeFalseMisses(rawCalls.filter((c) => isBusinessHours(c.startAt)), directory);

  for (const call of calls) {
    const tech = call.internalExtension ? directory.extensionToTech.get(call.internalExtension) : undefined;
    if (!tech) continue;
    const entry = stats.get(tech) ?? {
      inboundAnswered: 0,
      inboundMissed: 0,
      outboundAnswered: 0,
      outboundMissed: 0,
      talkSeconds: 0,
      ringSeconds: 0,
      ringCount: 0,
    };
    const isInbound = call.direction === "Inbound";

    if (call.missed) {
      if (isInbound) entry.inboundMissed++;
      else entry.outboundMissed++;
    } else {
      if (isInbound) entry.inboundAnswered++;
      else entry.outboundAnswered++;
      entry.talkSeconds += call.durationSeconds;

      if (isInbound && call.answeredAt) {
        const ring = Math.round((call.answeredAt.getTime() - call.startAt.getTime()) / 1000);
        if (ring >= 0) {
          entry.ringSeconds += ring;
          entry.ringCount++;
        }
      }
    }
    stats.set(tech, entry);
  }

  return stats;
}

type TicketLoadTotals = { openCount: number; p1Count: number; agingCount: number; onHoldCount: number };

// Ticket assignment (TicketSnapshot.assignedTech) stores the tech's full
// HaloPSA agent name (e.g. "Cameron Clark"), while TimeGap/KNOWN_TECHS use
// first names only — same substring match used everywhere else a HaloPSA
// agent name needs to line up with the four known techs. Shared by
// getTechPerformance and syncTicketLoadHistory so both build the exact
// same per-person totals from the same raw getLoadPerTech() output.
function buildLoadByPerson(load: { tech: string; openCount: number; p1Count: number; agingCount: number; onHoldCount: number }[]): Map<Tech, TicketLoadTotals> {
  const byPerson = new Map<Tech, TicketLoadTotals>();
  for (const entry of load) {
    const person = matchKnownTech(entry.tech, KNOWN_TECHS);
    if (!person) continue;
    const existing = byPerson.get(person) ?? { openCount: 0, p1Count: 0, agingCount: 0, onHoldCount: 0 };
    byPerson.set(person, {
      openCount: existing.openCount + entry.openCount,
      p1Count: existing.p1Count + entry.p1Count,
      agingCount: existing.agingCount + entry.agingCount,
      onHoldCount: existing.onHoldCount + entry.onHoldCount,
    });
  }
  return byPerson;
}

// Snapshots this week's per-tech P1/aging/open/on-hold ticket counts into
// TicketLoadWeekly — see the model's comment in schema.prisma. No
// external API call: getLoadPerTech() reads the already-synced
// TicketSnapshot table, so this is safe to call on every page load
// alongside the other syncs, not just once a week — it just upserts the
// same current-week row until the week rolls over. Call this from the
// page (like the other sync* functions), not from getTechPerformance —
// keeps the read/write separation the rest of this file already follows.
export async function syncTicketLoadHistory(): Promise<{ synced: number; error?: string }> {
  try {
    const load = await getLoadPerTech();
    const loadByPerson = buildLoadByPerson(load);
    const periodStart = startOfWeek();
    const periodEnd = endOfWeek();

    for (const person of KNOWN_TECHS) {
      const totals = loadByPerson.get(person) ?? { openCount: 0, p1Count: 0, agingCount: 0, onHoldCount: 0 };
      await prisma.ticketLoadWeekly.upsert({
        where: { person_periodStart: { person, periodStart } },
        update: { periodEnd, ...totals },
        create: { person, periodStart, periodEnd, ...totals },
      });
    }

    return { synced: KNOWN_TECHS.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ticket load history sync failed.";
    console.error("Ticket load history sync failed:", err);
    return { synced: 0, error: message };
  }
}

// `directory` is passed in (fetched once, in parallel, by the page) rather
// than fetched here — keeps this function's own work to DB reads, same
// separation as callActivity.ts's attachCompanyNames. Pass null when the
// directory fetch itself errored; every tech's call stats are then just
// zero, not fabricated.
export type TechPerformanceResult = {
  techs: TechPerformance[];
  org: TechOrgSummary;
  todayIndex: number;
  lastWeek: TechOrgLastWeek;
  // Per-tech last week's raw logged hours (TimeGap.loggedHours) — the
  // org-level `lastWeek` above only carries a summed utilization ratio,
  // discarding the per-person breakdown; this keeps it. Built from
  // lastWeekGaps below, already fetched for `lastWeek` — no new query.
  lastWeekHoursByPerson: Map<Tech, number>;
};

export async function getTechPerformance(directory: ContactDirectory | null): Promise<TechPerformanceResult> {
  const weekStart = startOfWeek();
  const weekEnd = endOfWeek();
  const trendStart = new Date(weekStart);
  trendStart.setDate(trendStart.getDate() - 7 * (TREND_WEEKS - 1));
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekEnd);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

  const [currentGaps, trendGaps, load, callStats, dailyRows, lastWeekGaps, lastWeekCallStats, lastWeekTicketLoad] =
    await Promise.all([
      prisma.timeGap.findMany({ where: { role: "TECH", periodStart: weekStart } }),
      prisma.timeGap.findMany({
        where: { role: "TECH", periodStart: { gte: trendStart } },
        orderBy: { periodStart: "asc" },
      }),
      getLoadPerTech(),
      getCallStatsByTech(directory),
      prisma.dailyHours.findMany({ where: { date: { gte: weekStart, lte: weekEnd } }, orderBy: { date: "asc" } }),
      prisma.timeGap.findMany({ where: { role: "TECH", periodStart: lastWeekStart } }),
      getCallStatsByTech(directory, { start: lastWeekStart, end: lastWeekEnd }),
      prisma.ticketLoadWeekly.findMany({ where: { periodStart: lastWeekStart } }),
    ]);

  const currentByPerson = new Map(currentGaps.map((g) => [g.person, g]));

  // Always 5 entries once synced (see weekdayDates() in halopsa.ts, which
  // upserts one row per known tech per weekday, zero-hour days included)
  // — Monday first, in sync with orderBy date "asc" above. Falls back to
  // five zeros for a tech with no synced rows yet, not a shorter/guessed array.
  const dailyByPerson = new Map<string, number[]>();
  for (const row of dailyRows) {
    const arr = dailyByPerson.get(row.person) ?? [];
    arr.push(row.hours);
    dailyByPerson.set(row.person, arr);
  }

  const trendByPerson = new Map<string, TechTrendPoint[]>();
  for (const g of trendGaps) {
    const points = trendByPerson.get(g.person) ?? [];
    points.push({
      periodStart: g.periodStart.toISOString(),
      loggedHours: g.loggedHours,
      expectedHours: g.expectedHours,
    });
    trendByPerson.set(g.person, points);
  }

  const loadByPerson = buildLoadByPerson(load);

  const weekFraction = weekFractionElapsed();

  // KNOWN_TECHS order (alphabetical-ish, fixed) — no performance ranking.
  // This is a coaching tool, not a leaderboard.
  const techs = KNOWN_TECHS.map((person) => {
    const gap = currentByPerson.get(person);
    const l = loadByPerson.get(person);
    const c = callStats.get(person);
    const callsInbound = (c?.inboundAnswered ?? 0) + (c?.inboundMissed ?? 0);
    const callsOutbound = (c?.outboundAnswered ?? 0) + (c?.outboundMissed ?? 0);
    const callsAnswered = (c?.inboundAnswered ?? 0) + (c?.outboundAnswered ?? 0);
    const avgTalkMinutes = c && callsAnswered > 0 ? Math.round((c.talkSeconds / callsAnswered / 60) * 10) / 10 : 0;
    const avgAnswerSeconds = c && c.ringCount > 0 ? Math.round(c.ringSeconds / c.ringCount) : null;
    const expectedHours = gap?.expectedHours ?? 40;
    const loggedHours = gap?.loggedHours ?? 0;
    const expectedHoursToDate = Math.round(expectedHours * weekFraction * 10) / 10;
    const pacePct = expectedHoursToDate > 0 ? Math.round((loggedHours / expectedHoursToDate) * 1000) / 10 : 100;
    const base = {
      person,
      expectedHours,
      loggedHours,
      pacePct,
      expectedHoursToDate,
      trend: trendByPerson.get(person) ?? [],
      dailyHours: dailyByPerson.get(person) ?? [0, 0, 0, 0, 0],
      openCount: l?.openCount ?? 0,
      p1Count: l?.p1Count ?? 0,
      agingCount: l?.agingCount ?? 0,
      onHoldCount: l?.onHoldCount ?? 0,
      callsInbound,
      callsOutbound,
      callsAnswered,
      avgTalkMinutes,
      avgAnswerSeconds,
    };
    return { ...base, ...deriveTechStatus(base) };
  });

  const org = summarizeOrg(KNOWN_TECHS, { currentByPerson, loadByPerson, callStats, dailyByPerson });
  const lastWeek = summarizeLastWeek(KNOWN_TECHS, lastWeekGaps, lastWeekCallStats, lastWeekTicketLoad);
  const lastWeekHoursByPerson = new Map<Tech, number>(lastWeekGaps.map((g) => [g.person as Tech, g.loggedHours]));

  return { techs, org, todayIndex: todayWeekdayIndex(), lastWeek, lastWeekHoursByPerson };
}

// Yesterday's hours logged, per tech — DailyHours is Mon-Fri only (see
// its schema comment), so a tech with no row for yesterday (a weekend,
// or a business day that genuinely hasn't synced) is simply absent from
// the returned map rather than defaulted to a fabricated 0; the caller
// decides how to display "no data" honestly.
export async function getYesterdayHoursByPerson(): Promise<Map<Tech, number>> {
  const yesterday = startOfToday();
  yesterday.setDate(yesterday.getDate() - 1);
  const rows = await prisma.dailyHours.findMany({ where: { date: yesterday } });
  return new Map(rows.map((r) => [r.person as Tech, r.hours]));
}

// Yesterday's inbound/outbound call counts, per tech — same attribution
// and after-hours/false-miss exclusion as getCallStatsByTech above, just
// for a single-day window instead of the current/last week ranges that
// function is normally called with. Counts both answered and missed
// (a call that was never picked up still happened), matching how
// callsInbound/callsOutbound are computed elsewhere in this file.
export async function getCallStatsByTechYesterday(directory: ContactDirectory | null): Promise<Map<Tech, { inbound: number; outbound: number }>> {
  const start = startOfToday();
  start.setDate(start.getDate() - 1);
  const end = startOfToday();
  const stats = await getCallStatsByTech(directory, { start, end });
  const result = new Map<Tech, { inbound: number; outbound: number }>();
  for (const [tech, c] of stats) {
    result.set(tech, {
      inbound: c.inboundAnswered + c.inboundMissed,
      outbound: c.outboundAnswered + c.outboundMissed,
    });
  }
  return result;
}

// Last week's comparable org-level figures, for the KPI strip's
// week-over-week arrows (see getTechOrgKpis). Utilization is the full
// completed week's pct — not pro-rated, since last week is over — so a
// tile comparing "pace-to-date this week" against "last week's final
// number" is deliberately labeled that way rather than implying an
// exact same-point comparison. ticketIssueCount (P1 + aging, summed) is
// null until TicketLoadWeekly has a row for last week — that table only
// started being written once syncTicketLoadHistory shipped, so the very
// first week after that has no prior week to diff against. It builds up
// honestly from there rather than being backfilled.
export type TechOrgLastWeek = {
  utilizationPct: number | null;
  pickupRate: number | null;
  avgAnswerSeconds: number | null;
  ticketIssueCount: number | null;
};

function summarizeLastWeek(
  people: readonly Tech[],
  gaps: { person: string; expectedHours: number; loggedHours: number }[],
  callStats: Map<Tech, CallStats>,
  ticketLoadRows: { person: string; p1Count: number; agingCount: number }[],
): TechOrgLastWeek {
  const gapsByPerson = new Map(gaps.map((g) => [g.person, g]));

  let expectedHours = 0;
  let loggedHours = 0;
  let inboundAnswered = 0;
  let inboundMissed = 0;
  let ringSeconds = 0;
  let ringCount = 0;

  for (const person of people) {
    const gap = gapsByPerson.get(person);
    expectedHours += gap?.expectedHours ?? 0;
    loggedHours += gap?.loggedHours ?? 0;

    const c = callStats.get(person);
    inboundAnswered += c?.inboundAnswered ?? 0;
    inboundMissed += c?.inboundMissed ?? 0;
    ringSeconds += c?.ringSeconds ?? 0;
    ringCount += c?.ringCount ?? 0;
  }

  const callsInbound = inboundAnswered + inboundMissed;

  // No rows at all (not just zero counts) means the sync hadn't run yet
  // for that week — distinguishes "no data" (trend omitted) from "a
  // genuinely clean week" (trend shows 0).
  const ticketIssueCount =
    ticketLoadRows.length > 0 ? ticketLoadRows.reduce((sum, r) => sum + r.p1Count + r.agingCount, 0) : null;

  return {
    utilizationPct: expectedHours > 0 ? Math.round((loggedHours / expectedHours) * 1000) / 10 : null,
    pickupRate: callsInbound > 0 ? inboundAnswered / callsInbound : null,
    avgAnswerSeconds: ringCount > 0 ? Math.round(ringSeconds / ringCount) : null,
    ticketIssueCount,
  };
}

function summarizeOrg(
  people: readonly Tech[],
  data: {
    currentByPerson: Map<string, { expectedHours: number; loggedHours: number }>;
    loadByPerson: Map<string, { openCount: number; p1Count: number; agingCount: number; onHoldCount: number }>;
    callStats: Map<Tech, CallStats>;
    dailyByPerson: Map<string, number[]>;
  },
): TechOrgSummary {
  let expectedHours = 0;
  let loggedHours = 0;
  let openCount = 0;
  let p1Count = 0;
  let agingCount = 0;
  let onHoldCount = 0;
  let inboundAnswered = 0;
  let inboundMissed = 0;
  let outboundAnswered = 0;
  let outboundMissed = 0;
  let talkSeconds = 0;
  let ringSeconds = 0;
  let ringCount = 0;
  const dailyHours = [0, 0, 0, 0, 0];

  for (const person of people) {
    const gap = data.currentByPerson.get(person);
    expectedHours += gap?.expectedHours ?? 40;
    loggedHours += gap?.loggedHours ?? 0;

    const l = data.loadByPerson.get(person);
    openCount += l?.openCount ?? 0;
    p1Count += l?.p1Count ?? 0;
    agingCount += l?.agingCount ?? 0;
    onHoldCount += l?.onHoldCount ?? 0;

    const c = data.callStats.get(person);
    inboundAnswered += c?.inboundAnswered ?? 0;
    inboundMissed += c?.inboundMissed ?? 0;
    outboundAnswered += c?.outboundAnswered ?? 0;
    outboundMissed += c?.outboundMissed ?? 0;
    talkSeconds += c?.talkSeconds ?? 0;
    ringSeconds += c?.ringSeconds ?? 0;
    ringCount += c?.ringCount ?? 0;

    const days = data.dailyByPerson.get(person) ?? [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) dailyHours[i] += days[i] ?? 0;
  }

  const callsInbound = inboundAnswered + inboundMissed;
  const callsOutbound = outboundAnswered + outboundMissed;
  const callsAnswered = inboundAnswered + outboundAnswered;

  return {
    expectedHours,
    loggedHours: Math.round(loggedHours * 10) / 10,
    dailyHours: dailyHours.map((h) => Math.round(h * 10) / 10),
    openCount,
    p1Count,
    agingCount,
    onHoldCount,
    callsInbound,
    callsOutbound,
    callsAnswered,
    callsMissed: inboundMissed,
    avgTalkMinutes: callsAnswered > 0 ? Math.round((talkSeconds / callsAnswered / 60) * 10) / 10 : 0,
    avgAnswerSeconds: ringCount > 0 ? Math.round(ringSeconds / ringCount) : null,
    pickupRate: callsInbound > 0 ? inboundAnswered / callsInbound : null,
  };
}

const TECH_STATUS_RANK: Record<TechStatus, number> = { red: 3, yellow: 2, green: 1 };

// Three categories (hours pace, P1 count, aging count) reduced to a
// single glanceable status + one-line reason — a coaching signal, not a
// ranking. Deliberately not pro-rated by day-of-week (unlike the org
// Team Utilization KPI below) — this drives the same progress bar
// already shown on the card, and a
// status badge disagreeing with the bar right next to it would be more
// confusing than Monday's bar reading a little empty.
function deriveTechStatus(t: {
  pacePct: number;
  expectedHoursToDate: number;
  openCount: number;
  p1Count: number;
  agingCount: number;
}): { status: TechStatus; flag: string | null } {
  const paceSev = paceSeverity(t.pacePct);
  const hoursStatus: TechStatus = paceSev === "ok" ? "green" : paceSev === "warn" ? "yellow" : "red";

  const hasTickets = t.openCount > 0;
  const p1Status: TechStatus = !hasTickets || t.p1Count === 0 ? "green" : t.p1Count <= 2 ? "yellow" : "red";
  const agingStatus: TechStatus = !hasTickets || t.agingCount === 0 ? "green" : t.agingCount <= 4 ? "yellow" : "red";

  // P1 > aging > hours when severities tie — a CEO cares more about "a
  // P1 is stuck" than "a little behind pace."
  const candidates: { status: TechStatus; flag: string }[] = [
    { status: p1Status, flag: `${t.p1Count} P1 ticket${t.p1Count === 1 ? "" : "s"} open` },
    { status: agingStatus, flag: `${t.agingCount} ticket${t.agingCount === 1 ? "" : "s"} aging past 24h` },
    { status: hoursStatus, flag: `${Math.round(t.pacePct)}% of pace (${t.expectedHoursToDate}h expected to date)` },
  ];
  const worst = candidates.reduce((a, b) => (TECH_STATUS_RANK[b.status] > TECH_STATUS_RANK[a.status] ? b : a));

  return { status: worst.status, flag: worst.status === "green" ? null : worst.flag };
}


// ---------------------------------------------------------------------------
// Org-wide "at a glance" KPI strip — same Kpi shape/visual language as the
// Business Health cockpit (components/business-health/KpiTile.tsx), so a
// CEO reads the same red/yellow/green vocabulary on both pages.
// ---------------------------------------------------------------------------

// Re-exported for backward compat — serviceDeskHealth.ts and
// techPerformanceScore.ts both import buildTrend from here. Moved to
// stats.ts (Phase 11) so callActivity.ts can use it too without a
// circular import (this file already imports excludeFalseMisses from
// callActivity.ts) — see stats.ts for the full comment.
export { buildTrend };

function kpiTeamUtilization(org: TechOrgSummary, lastWeek: TechOrgLastWeek): Kpi {
  const fraction = weekFractionElapsed();
  const expectedToDate = org.expectedHours * fraction;
  const dayOfWeek = Math.min(Math.round(fraction * 5), 5);

  if (expectedToDate <= 0) {
    return {
      key: "teamUtilization",
      label: "Team Utilization",
      value: null,
      display: "—",
      status: "unavailable",
      detail: "No time entries synced for this week yet.",
      benchmark: "healthy range 70–90%",
      href: "/tech-performance",
    };
  }

  const pct = (org.loggedHours / expectedToDate) * 100;
  // Same paceSeverity bands driving the per-tech status badges below —
  // and the same bands as Business Health's Tech Utilization KPI, so all
  // three agree on what "behind pace" means.
  const paceSev = paceSeverity(pct);
  const status: KpiStatus = paceSev === "ok" ? "green" : paceSev === "warn" ? "yellow" : "red";

  // lastWeek.utilizationPct is the *final* completed-week figure, while
  // `pct` here is only pro-rated to today — not a same-point comparison,
  // hence "vs last week's total" rather than a bare "vs last week".
  const trend = buildTrend(
    pct,
    lastWeek.utilizationPct,
    "up",
    (delta) => `${delta >= 0 ? "+" : ""}${Math.round(delta)}pts vs last week's total`,
  );

  return {
    key: "teamUtilization",
    label: "Team Utilization",
    value: Math.round(pct * 10) / 10,
    display: `${Math.round(pct)}%`,
    status,
    detail: `${org.loggedHours}h logged vs ${Math.round(expectedToDate * 10) / 10}h expected to date · day ${dayOfWeek} of 5`,
    benchmark: "healthy range 70–90%",
    href: "/tech-performance",
    trend,
  };
}

// Red/yellow driven by whether any *individual* tech would score red/
// yellow on P1s or aging (see deriveTechStatus) — team ticket health is
// only as good as its worst-loaded member, not hidden by an average.
function kpiTicketHealth(techs: TechPerformance[], org: TechOrgSummary, lastWeek: TechOrgLastWeek): Kpi {
  const anyRed = techs.some((t) => t.p1Count > 2 || t.agingCount > 4);
  const anyYellow = techs.some((t) => t.p1Count > 0 || t.agingCount > 0);
  const status: KpiStatus = anyRed ? "red" : anyYellow ? "yellow" : "green";

  const display =
    org.p1Count > 0 ? `${org.p1Count} P1 open` : org.agingCount > 0 ? `${org.agingCount} aging` : "Clear";

  // Fewer P1s + aging tickets is the improvement, hence goodDirection
  // "down" — and flatBelow 0 (not the other tiles' 0.5) since this is a
  // whole-number count, not a percentage/seconds figure where sub-1
  // noise is expected.
  const trend = buildTrend(
    org.p1Count + org.agingCount,
    lastWeek.ticketIssueCount,
    "down",
    (delta) => `${delta >= 0 ? "+" : ""}${Math.round(delta)} vs last week`,
    0,
  );

  return {
    key: "ticketHealth",
    label: "Ticket Health",
    value: org.p1Count + org.agingCount,
    display,
    status,
    detail: `${org.openCount} open across the team · ${org.onHoldCount} on hold/blocked`,
    benchmark: "0 P1s and 0 tickets aging past 24h is healthy",
    href: "/tech-performance",
    trend,
  };
}

// Team-wide only — see the TechOrgSummary comment above for why pickup
// rate can't be attributed to an individual tech.
function kpiPickupRate(org: TechOrgSummary, lastWeek: TechOrgLastWeek): Kpi {
  if (org.pickupRate === null) {
    return {
      key: "pickupRate",
      label: "Call Pickup Rate",
      value: null,
      display: "—",
      status: "unavailable",
      detail: "No inbound calls attributed to the team this week.",
      benchmark: "healthy range 90%+",
      href: "/calls",
    };
  }

  const pct = org.pickupRate * 100;
  const answered = org.callsInbound - org.callsMissed;
  const trend = buildTrend(
    pct,
    lastWeek.pickupRate === null ? null : lastWeek.pickupRate * 100,
    "up",
    (delta) => `${delta >= 0 ? "+" : ""}${Math.round(delta)}pts vs last week`,
  );

  return {
    key: "pickupRate",
    label: "Call Pickup Rate",
    value: Math.round(pct * 10) / 10,
    display: `${Math.round(pct)}%`,
    status: bandHigherIsBetter(pct, 90, 80),
    detail: `${answered} of ${org.callsInbound} inbound calls answered as a team`,
    benchmark: "healthy range 90%+",
    href: "/calls",
    trend,
  };
}

// Distinct from Call Pickup Rate above (whether calls get answered at
// all) — this is how long an inbound caller waits once someone's phone
// starts ringing. No external MSP benchmark for this one (unlike, say,
// tech utilization) — 15s/30s is a reasonable judgment call, not a
// cited industry figure, same honesty pattern as Ticket Health's benchmark.
function kpiAvgPickupTime(org: TechOrgSummary, lastWeek: TechOrgLastWeek): Kpi {
  if (org.avgAnswerSeconds === null) {
    return {
      key: "avgPickupTime",
      label: "Avg Pickup Time",
      value: null,
      display: "—",
      status: "unavailable",
      detail: "No answered inbound calls with ring-time data this week.",
      benchmark: "target under 15s — a judgment call, not an industry figure",
      href: "/calls",
    };
  }

  const trend = buildTrend(
    org.avgAnswerSeconds,
    lastWeek.avgAnswerSeconds,
    "down",
    (delta) => `${delta >= 0 ? "+" : ""}${Math.round(delta)}s vs last week`,
    1,
  );

  return {
    key: "avgPickupTime",
    label: "Avg Pickup Time",
    value: org.avgAnswerSeconds,
    display: `${org.avgAnswerSeconds}s`,
    status: bandLowerIsBetter(org.avgAnswerSeconds, 15, 30),
    detail: `Average ring time before an inbound call is answered, across ${org.callsInbound} calls this week`,
    benchmark: "target under 15s — a judgment call, not an industry figure",
    href: "/calls",
    trend,
  };
}

export function getTechOrgKpis(techs: TechPerformance[], org: TechOrgSummary, lastWeek: TechOrgLastWeek): Kpi[] {
  return [
    kpiTeamUtilization(org, lastWeek),
    kpiTicketHealth(techs, org, lastWeek),
    kpiPickupRate(org, lastWeek),
    kpiAvgPickupTime(org, lastWeek),
  ];
}
