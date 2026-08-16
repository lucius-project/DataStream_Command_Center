// Service Desk Health — Level 1 of the /tech-performance rebuild (see the
// Phase 1-3 discovery report). Pure DB reads + the same live phone
// summary Business Health's Answer Rate KPI already computes (no
// duplicate logic) — no new HaloPSA calls beyond what syncTicketsFromHalo
// already does on every sync, since respondbydate/fixbydate/responsedate/
// lastactiondate all came back confirmed-present on the ticket *list*
// endpoint this app already fetches (see TicketSnapshot's field comments
// in schema.prisma).
//
// Golden rule enforced throughout this file: OUTCOME metrics
// (Response/Resolution SLA, Net Ticket Change) are the headline signal;
// ACTIVITY metrics (hours logged, calls handled) stay contextual, never
// substituted for an outcome that isn't actually measurable yet.

import { prisma } from "@/lib/prisma";
import type { TicketPriority, ServiceDeskHealthDaily } from "@/app/generated/prisma/client";
import { businessHoursElapsed, startOfToday } from "@/lib/dateUtils";
import { bandHigherIsBetter, bandLowerIsBetter, type KpiStatus } from "@/lib/kpiStatus";
import { getContactDirectory } from "@/lib/integrations/contactDirectory";
import { getCallActivitySummary } from "./callActivity";
import { getBacklogBreakdown, getTechActionableAging, getStaleTickets, type BacklogBreakdown, type TechActionableAging } from "./operations";
import { getKpiSettings } from "./kpiSettings";
import { median } from "./stats";

// Below this many eligible tickets, a percentage is misleadingly precise
// (1 of 1 = "100%") — same principle as CSAT's sample-count problem
// flagged in the discovery report, applied here to Response/Resolution
// SLA. Below the threshold the metric reports as unavailable with its
// real sample count shown, not a fabricated-looking percentage.
// Admin-editable (Phase 12, KpiSettings.minSlaSample) — was a module
// constant, duplicated identically in techPerformanceScore.ts; each
// consumer now reads it via getKpiSettings() instead.

export type SlaMetric = {
  status: "available" | "insufficient_sample" | "unavailable";
  pct: number | null;
  met: number;
  eligible: number;
  medianHours: number | null;
};

// Re-exported for backward compat — techPerformanceScore.ts and
// remoteSessions.ts both import median from here rather than from
// lib/services/stats.ts directly. See stats.ts for why it's a separate,
// dependency-free module (avoids a circular import with callActivity.ts).
export { median };

// Response SLA: eligible tickets are ones where the outcome is already
// decided — either they've actually been responded to, or their
// respondByAt target has already passed with no response (a decided
// miss). A ticket not yet due and not yet responded has no verdict yet,
// so it's correctly excluded rather than counted either way. Covers
// every currently-open ticket (TicketSnapshot) — closed tickets already
// had their response outcome decided before they closed, so they don't
// add new information here; Resolution SLA below covers the closed set.
export async function getResponseSla(): Promise<SlaMetric> {
  const now = new Date();
  const [tickets, { minSlaSample }] = await Promise.all([
    prisma.ticketSnapshot.findMany({
      where: { respondByAt: { not: null } },
      select: { openedAt: true, respondByAt: true, respondedAt: true },
    }),
    getKpiSettings(),
  ]);

  let met = 0;
  let eligible = 0;
  const responseHours: number[] = [];

  for (const t of tickets) {
    if (!t.respondByAt) continue;
    if (t.respondedAt) {
      eligible++;
      if (t.respondedAt <= t.respondByAt) met++;
      // Some backlog tickets carry a respondedAt that predates their own
      // openedAt (confirmed live — a HaloPSA data quirk on tickets that
      // already existed before this app started tracking them, not
      // something this app writes). businessHoursElapsed silently
      // clamps that impossible ordering to 0, which would drag the
      // median toward a false "instant response" signal — so those
      // tickets are excluded from the median sample entirely rather
      // than counted as a suspiciously perfect 0h. They still count
      // toward met/eligible above, since the SLA met/miss verdict
      // itself doesn't depend on openedAt.
      if (t.respondedAt > t.openedAt) responseHours.push(businessHoursElapsed(t.openedAt, t.respondedAt));
    } else if (t.respondByAt < now) {
      // Target passed, still no response — a decided miss.
      eligible++;
    }
  }

  if (eligible === 0) return { status: "unavailable", pct: null, met, eligible, medianHours: median(responseHours) };
  if (eligible < minSlaSample) {
    return { status: "insufficient_sample", pct: null, met, eligible, medianHours: median(responseHours) };
  }
  return {
    status: "available",
    pct: Math.round((met / eligible) * 1000) / 10,
    met,
    eligible,
    medianHours: median(responseHours),
  };
}

// Resolution SLA: covers TicketCloseLog rows from a rolling recent
// window (not "today only" — a single day of closes is almost always
// too small a sample, see minSlaSample) with a fixByAt target. Window
// length and sample floor are both admin-editable (Phase 12,
// KpiSettings.resolutionWindowDays/minSlaSample).
export async function getResolutionSla(): Promise<SlaMetric> {
  const { resolutionWindowDays, minSlaSample } = await getKpiSettings();
  const windowStart = new Date(Date.now() - resolutionWindowDays * 24 * 60 * 60 * 1000);
  const closed = await prisma.ticketCloseLog.findMany({
    where: { closedAt: { gte: windowStart }, fixByAt: { not: null } },
    select: { openedAt: true, fixByAt: true, closedAt: true },
  });

  let met = 0;
  const resolutionHours: number[] = [];
  for (const t of closed) {
    if (!t.fixByAt) continue;
    if (t.closedAt <= t.fixByAt) met++;
    resolutionHours.push(businessHoursElapsed(t.openedAt, t.closedAt));
  }

  const eligible = closed.length;
  if (eligible === 0) return { status: "unavailable", pct: null, met, eligible, medianHours: null };
  if (eligible < minSlaSample) {
    return { status: "insufficient_sample", pct: null, met, eligible, medianHours: median(resolutionHours) };
  }
  return {
    status: "available",
    pct: Math.round((met / eligible) * 1000) / 10,
    met,
    eligible,
    medianHours: median(resolutionHours),
  };
}

export type NetTicketChange = {
  createdToday: number;
  closedToday: number;
  net: number;
  label: "GAINING_GROUND" | "KEEPING_PACE" | "LOSING_GROUND";
};

// Created = opened today, whether still open or already closed again
// today (TicketCloseLog keeps openedAt for exactly this reason — a
// ticket opened and closed same-day would otherwise vanish from both
// counts). Closed = left the open feed today (see TicketCloseLog's
// comment in schema.prisma for what "closed" means here).
// Exported for reuse by morningBrief.ts (Phase 11), which derives the
// same label from a persisted ServiceDeskHealthDaily.netChange value
// rather than a live query — one label rule, not two.
export function netTicketChangeLabel(net: number): NetTicketChange["label"] {
  return net < 0 ? "GAINING_GROUND" : net === 0 ? "KEEPING_PACE" : "LOSING_GROUND";
}

export async function getNetTicketChange(): Promise<NetTicketChange> {
  const today = startOfToday();
  const [openedStillOpen, closedLog] = await Promise.all([
    prisma.ticketSnapshot.count({ where: { openedAt: { gte: today } } }),
    prisma.ticketCloseLog.findMany({ where: { closedAt: { gte: today } }, select: { openedAt: true } }),
  ]);

  const createdToday = openedStillOpen + closedLog.filter((t) => t.openedAt >= today).length;
  const closedToday = closedLog.length;
  const net = createdToday - closedToday;

  return { createdToday, closedToday, net, label: netTicketChangeLabel(net) };
}

export type ServiceDeskHealthSnapshot = {
  netTicketChange: NetTicketChange;
  responseSla: SlaMetric;
  resolutionSla: SlaMetric;
  backlog: BacklogBreakdown;
  aging: TechActionableAging;
  staleCount: number;
  answerRate: { status: "available" | "unavailable"; pct: number | null; answered: number; total: number };
  healthScore: HealthScoreResult;
};

export type HealthScoreCategory = {
  key: "responsiveness" | "resolution" | "workload" | "phone";
  label: string;
  weightPct: number; // weight actually used, after rebalancing away any unavailable category
  score: number | null; // 0-100, null if excluded (no data)
  detail: string;
};

export type HealthScoreResult = {
  score: number | null; // 0-100, null if every category is unavailable
  categories: HealthScoreCategory[];
};

// Base weights default to the discovery report's original proposal
// (Responsiveness 25, Resolution 20, Customer Experience 20, Workload
// 20, Phone 15) with Customer Experience removed (CSAT confirmed
// unavailable on this HaloPSA account — see the Phase 1-3 discovery
// report) and its 20% redistributed proportionally across the remaining
// four so they still sum to 100%. Now admin-editable (Phase 12, see
// lib/services/kpiSettings.ts's KpiSettings.healthWeight* fields and
// /admin) — the defaults below only matter as a fallback shape, the real
// values come from whatever computeHealthScore's `weights` argument
// carries. The score is always shown with its full category breakdown
// (see HealthScoreCategory), never as a bare number, per "never display
// a mystery score."
type HealthScoreWeights = { responsiveness: number; resolution: number; workload: number; phone: number };

function workloadScore(net: NetTicketChange, aging: TechActionableAging): number {
  let score = 100;
  if (net.net > 0) score -= Math.min(30, net.net * 3); // losing ground — 3 pts per net ticket, capped
  score -= Math.min(40, aging.agingOver24h * 5); // 5 pts per tech-actionable ticket aging past 24 business hours, capped
  return Math.max(0, Math.round(score));
}

export function computeHealthScore(
  responseSla: SlaMetric,
  resolutionSla: SlaMetric,
  net: NetTicketChange,
  aging: TechActionableAging,
  answerRate: { status: "available" | "unavailable"; pct: number | null },
  weights: HealthScoreWeights,
  minSlaSample: number,
  resolutionWindowDays: number,
): HealthScoreResult {
  const raw: { key: HealthScoreCategory["key"]; label: string; score: number | null; detail: string }[] = [
    {
      key: "responsiveness",
      label: "Responsiveness",
      score: responseSla.status === "available" ? responseSla.pct : null,
      detail:
        responseSla.status === "available"
          ? `${responseSla.met}/${responseSla.eligible} tickets met their response target`
          : responseSla.status === "insufficient_sample"
            ? `Only ${responseSla.eligible} eligible tickets — below the ${minSlaSample}-ticket minimum sample`
            : "No tickets with a response target yet",
    },
    {
      key: "resolution",
      label: "Resolution",
      score: resolutionSla.status === "available" ? resolutionSla.pct : null,
      detail:
        resolutionSla.status === "available"
          ? `${resolutionSla.met}/${resolutionSla.eligible} tickets closed in the last ${resolutionWindowDays} days met their resolution target`
          : resolutionSla.status === "insufficient_sample"
            ? `Only ${resolutionSla.eligible} eligible closures in ${resolutionWindowDays} days — below the ${minSlaSample}-ticket minimum sample`
            : "No closed tickets with a resolution target in the window yet",
    },
    {
      key: "workload",
      label: "Workload",
      score: workloadScore(net, aging),
      detail: `${net.net >= 0 ? "+" : ""}${net.net} net tickets today · ${aging.agingOver24h} tech-actionable tickets aging past 24 business hours`,
    },
    {
      key: "phone",
      label: "Phone",
      score: answerRate.status === "available" ? answerRate.pct : null,
      detail: answerRate.status === "available" ? "Today's inbound answer rate" : "No inbound calls yet today",
    },
  ];

  const available = raw.filter((c) => c.score !== null);
  const baseWeightSum = available.reduce((sum, c) => sum + weights[c.key], 0);

  const categories: HealthScoreCategory[] = raw.map((c) => ({
    key: c.key,
    label: c.label,
    // Rebalanced proportionally among only the available categories, so
    // e.g. Phone being unavailable (no calls yet) doesn't silently zero
    // out 15% of the score — it's excluded and the rest sum to 100%.
    weightPct:
      c.score === null ? 0 : baseWeightSum > 0 ? Math.round((weights[c.key] / baseWeightSum) * 1000) / 10 : 0,
    score: c.score,
    detail: c.detail,
  }));

  // baseWeightSum === 0 means every available category was configured
  // with 0 weight (e.g. an admin put 100% of the weight group onto a
  // category that happens to be unavailable today) — every weightPct
  // above resolves to 0, and summing would silently produce a fabricated
  // 0/100 that reads as "everything is failing" instead of "no real
  // signal contributed." Treat that the same as no data at all.
  if (available.length === 0 || baseWeightSum === 0) return { score: null, categories };

  const score = Math.round(
    categories.reduce((sum, c) => sum + (c.score !== null ? (c.score * c.weightPct) / 100 : 0), 0),
  );

  return { score, categories };
}

export async function getServiceDeskHealthSnapshot(): Promise<ServiceDeskHealthSnapshot> {
  // Silently degrading here (rather than threading an error through this
  // snapshot's own return type) is deliberate, not an oversight: every
  // current caller (app/tech-performance/page.tsx, huddle/page.tsx,
  // coaching-drafts/route.ts) already does its own getContactDirectory()
  // call and surfaces that failure to the user — this second, redundant
  // fetch (cheap; getContactDirectory is itself throttle-cached) would
  // just report the same failure twice.
  const directory = await getContactDirectory().catch(() => null);

  const [netTicketChange, responseSla, resolutionSla, backlog, aging, staleTickets, callSummary, settings] = await Promise.all([
    getNetTicketChange(),
    getResponseSla(),
    getResolutionSla(),
    getBacklogBreakdown(),
    getTechActionableAging(),
    getStaleTickets(),
    getCallActivitySummary(directory),
    getKpiSettings(),
  ]);

  // Same inbound-only framing as Business Health's kpiAnswerRate — see
  // callActivity.ts's CallActivitySummary comment for why outbound
  // "missed" calls don't belong in an answer-rate denominator.
  const answerRate =
    callSummary.inboundToday === 0
      ? { status: "unavailable" as const, pct: null, answered: 0, total: 0 }
      : {
          status: "available" as const,
          pct: Math.round(((callSummary.inboundToday - callSummary.missedToday) / callSummary.inboundToday) * 1000) / 10,
          answered: callSummary.inboundToday - callSummary.missedToday,
          total: callSummary.inboundToday,
        };

  const healthScore = computeHealthScore(
    responseSla,
    resolutionSla,
    netTicketChange,
    aging,
    answerRate,
    {
      responsiveness: settings.healthWeightResponsiveness,
      resolution: settings.healthWeightResolution,
      workload: settings.healthWeightWorkload,
      phone: settings.healthWeightPhone,
    },
    settings.minSlaSample,
    settings.resolutionWindowDays,
  );

  return {
    netTicketChange,
    responseSla,
    resolutionSla,
    backlog,
    aging,
    staleCount: staleTickets.length,
    answerRate,
    healthScore,
  };
}

const HEALTH_TREND_DAYS = 30;
const TREND_DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export type ServiceDeskHealthTrendDay = {
  date: string; // "YYYY-MM-DD", sortable as a string
  label: string; // "Aug 12"
  // null (not 0) when no ServiceDeskHealthDaily row exists for that day —
  // a day before this table started being written isn't the same claim
  // as "score 0", same honesty pattern as CallAnswerRateTrend's monthly
  // stats (callActivity.ts).
  healthScore: number | null;
};

export type ServiceDeskHealthTrend = {
  // Oldest first, HEALTH_TREND_DAYS fixed entries (today last) — always
  // this length regardless of how much real history exists yet, same
  // "fixed window, null for missing days" shape getCallAnswerRateTrend
  // already uses for its 12-month array.
  days: ServiceDeskHealthTrendDay[];
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// DB-only — reads whatever ServiceDeskHealthDaily rows exist in the
// window (see that model's schema comment: never backfilled, builds
// forward from whenever this shipped) and left-joins them onto a fixed
// HEALTH_TREND_DAYS-day calendar so the trend modal always has a
// consistent axis to render, same pattern as getCallAnswerRateTrend.
export async function getServiceDeskHealthTrend(): Promise<ServiceDeskHealthTrend> {
  const today = startOfToday();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (HEALTH_TREND_DAYS - 1));

  const rows = await prisma.serviceDeskHealthDaily.findMany({
    where: { date: { gte: windowStart, lte: today } },
    select: { date: true, healthScore: true },
  });
  const scoreByDate = new Map(rows.map((r) => [dateKey(r.date), r.healthScore]));

  const days: ServiceDeskHealthTrendDay[] = [];
  for (let i = 0; i < HEALTH_TREND_DAYS; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    days.push({ date: key, label: TREND_DAY_LABEL.format(d), healthScore: scoreByDate.get(key) ?? null });
  }

  return { days };
}

export type TicketTrendDay = {
  date: string; // "YYYY-MM-DD", sortable as a string
  label: string; // "Aug 12"
  // null (not 0) when no ServiceDeskHealthDaily row exists for that day —
  // same "missing row isn't the same claim as zero tickets" honesty rule
  // getServiceDeskHealthTrend already follows for healthScore. Within an
  // existing row these three are always real numbers (see that model's
  // schema — ticketsCreated/ticketsClosed/netChange are non-nullable),
  // so the null-ness lives at the day level, not the field level.
  created: number | null;
  closed: number | null;
  net: number | null;
};

export type TicketTrend = {
  days: TicketTrendDay[]; // oldest first, HEALTH_TREND_DAYS fixed entries (today last)
};

// Same fixed-window, DB-only shape as getServiceDeskHealthTrend, reusing
// its date-window constants/helpers — this is the "Ticket Trend" widget
// (created vs. closed per day), not a second, differently-scoped trend
// window.
export async function getTicketTrend(): Promise<TicketTrend> {
  const today = startOfToday();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (HEALTH_TREND_DAYS - 1));

  const rows = await prisma.serviceDeskHealthDaily.findMany({
    where: { date: { gte: windowStart, lte: today } },
    select: { date: true, ticketsCreated: true, ticketsClosed: true, netChange: true },
  });
  const rowByDate = new Map(rows.map((r) => [dateKey(r.date), r]));

  const days: TicketTrendDay[] = [];
  for (let i = 0; i < HEALTH_TREND_DAYS; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    const row = rowByDate.get(key);
    days.push({
      date: key,
      label: TREND_DAY_LABEL.format(d),
      created: row?.ticketsCreated ?? null,
      closed: row?.ticketsClosed ?? null,
      net: row?.netChange ?? null,
    });
  }

  return { days };
}

export type TicketTrend30DayTotal = {
  created: number;
  closed: number;
  net: number;
  label: NetTicketChange["label"];
  // Out of HEALTH_TREND_DAYS (30) — this table is never backfilled (see
  // its schema comment), so a fresh install or one with gaps (days
  // nobody loaded the page) has fewer than 30 real days behind this
  // total. Callers should label it "last N days," not always "30 days,"
  // same honesty rule as everywhere else this table is read.
  daysWithData: number;
};

// Rolling 30-day aggregate for the Ticket Trend tile's headline — a
// single DB-level sum, not a fetch-then-reduce over getTicketTrend's own
// day-by-day array, since the tile only needs the totals, not the daily
// shape (that's what the trend pop-out is for).
export async function getTicketTrend30DayTotal(): Promise<TicketTrend30DayTotal> {
  const today = startOfToday();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (HEALTH_TREND_DAYS - 1));

  const result = await prisma.serviceDeskHealthDaily.aggregate({
    where: { date: { gte: windowStart, lte: today } },
    _sum: { ticketsCreated: true, ticketsClosed: true, netChange: true },
    _count: { _all: true },
  });

  const created = result._sum.ticketsCreated ?? 0;
  const closed = result._sum.ticketsClosed ?? 0;
  const net = result._sum.netChange ?? 0;

  return { created, closed, net, label: netTicketChangeLabel(net), daysWithData: result._count._all };
}

export type ResponseSlaTrendDay = {
  date: string; // "YYYY-MM-DD", sortable as a string
  label: string; // "Aug 12"
  // null (not 0) when no ServiceDeskHealthDaily row exists for that day,
  // same honesty rule as every other trend in this file — a day before
  // this table started being written isn't the same claim as "0%".
  pct: number | null;
};

export type ResponseSlaTrend = {
  days: ResponseSlaTrendDay[]; // oldest first, HEALTH_TREND_DAYS fixed entries (today last)
  // Live, admin-editable bands (KpiSettings.responseSlaGreenPct/YellowPct)
  // — the same thresholds the live Response SLA tile/KPI already use, so
  // a bar's color here means the same thing it does everywhere else this
  // metric appears, not a second, independently-tuned scale.
  greenPct: number;
  yellowPct: number;
};

// Same fixed-window, DB-only shape as getServiceDeskHealthTrend/
// getTicketTrend, reusing their date-window constants/helpers.
export async function getResponseSlaTrend(): Promise<ResponseSlaTrend> {
  const today = startOfToday();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (HEALTH_TREND_DAYS - 1));

  const [rows, settings] = await Promise.all([
    prisma.serviceDeskHealthDaily.findMany({
      where: { date: { gte: windowStart, lte: today } },
      select: { date: true, responseSlaPct: true },
    }),
    getKpiSettings(),
  ]);
  const pctByDate = new Map(rows.map((r) => [dateKey(r.date), r.responseSlaPct]));

  const days: ResponseSlaTrendDay[] = [];
  for (let i = 0; i < HEALTH_TREND_DAYS; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    days.push({ date: key, label: TREND_DAY_LABEL.format(d), pct: pctByDate.get(key) ?? null });
  }

  return { days, greenPct: settings.responseSlaGreenPct, yellowPct: settings.responseSlaYellowPct };
}

// Morning Brief's own executive-facing band for Phone Answer (yesterday)
// — 99-100 green, 97-98 yellow, 96-or-below red. Lives here (not
// KpiSettings) and is exported for morningBrief.ts and the trend below
// to share, rather than each hardcoding its own copy: intentionally NOT
// KpiSettings.answerRateGreenPct/YellowPct, which drives the live "Call
// Answer Rate" KPI tile and is admin-editable — this is a stricter,
// fixed bar that must not move if that setting is retuned.
export const PHONE_ANSWER_GREEN_PCT = 99;
export const PHONE_ANSWER_YELLOW_PCT = 97;

export type PhoneAnswerTrendDay = {
  date: string; // "YYYY-MM-DD", sortable as a string
  label: string; // "Aug 12"
  pct: number | null; // null (not 0) when no row exists for that day
};

export type PhoneAnswerTrend = {
  days: PhoneAnswerTrendDay[]; // oldest first, HEALTH_TREND_DAYS fixed entries (today last)
  greenPct: number;
  yellowPct: number;
};

// Same fixed-window, DB-only shape as the other trends in this file.
// Fixed thresholds (not a KpiSettings lookup) — see
// PHONE_ANSWER_GREEN_PCT/YELLOW_PCT above for why.
export async function getPhoneAnswerTrend(): Promise<PhoneAnswerTrend> {
  const today = startOfToday();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (HEALTH_TREND_DAYS - 1));

  const rows = await prisma.serviceDeskHealthDaily.findMany({
    where: { date: { gte: windowStart, lte: today } },
    select: { date: true, phoneAnswerRatePct: true },
  });
  const pctByDate = new Map(rows.map((r) => [dateKey(r.date), r.phoneAnswerRatePct]));

  const days: PhoneAnswerTrendDay[] = [];
  for (let i = 0; i < HEALTH_TREND_DAYS; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    days.push({ date: key, label: TREND_DAY_LABEL.format(d), pct: pctByDate.get(key) ?? null });
  }

  return { days, greenPct: PHONE_ANSWER_GREEN_PCT, yellowPct: PHONE_ANSWER_YELLOW_PCT };
}

function categoryScore(healthScore: HealthScoreResult, key: HealthScoreCategory["key"]): number | null {
  return healthScore.categories.find((c) => c.key === key)?.score ?? null;
}

// Freezes today's already-computed ServiceDeskHealthSnapshot into
// ServiceDeskHealthDaily — no new query, no external call, just an
// upsert on values the caller already has (see that model's schema
// comment for why this table exists and its no-backfill rule). Upserted
// by date, so repeat page loads the same day overwrite in place rather
// than accumulating duplicate rows.
export async function syncServiceDeskHealthDaily(snapshot: ServiceDeskHealthSnapshot): Promise<void> {
  const date = startOfToday();
  const { healthScore } = snapshot;

  await prisma.serviceDeskHealthDaily.upsert({
    where: { date },
    update: {
      healthScore: healthScore.score,
      responsivenessScore: categoryScore(healthScore, "responsiveness"),
      resolutionScore: categoryScore(healthScore, "resolution"),
      workloadScore: categoryScore(healthScore, "workload"),
      phoneScore: categoryScore(healthScore, "phone"),
      responseSlaPct: snapshot.responseSla.pct,
      resolutionSlaPct: snapshot.resolutionSla.pct,
      ticketsCreated: snapshot.netTicketChange.createdToday,
      ticketsClosed: snapshot.netTicketChange.closedToday,
      netChange: snapshot.netTicketChange.net,
      backlogTotal: snapshot.backlog.total,
      agingOver24h: snapshot.aging.agingOver24h,
      phoneAnswerRatePct: snapshot.answerRate.pct,
    },
    create: {
      date,
      healthScore: healthScore.score,
      responsivenessScore: categoryScore(healthScore, "responsiveness"),
      resolutionScore: categoryScore(healthScore, "resolution"),
      workloadScore: categoryScore(healthScore, "workload"),
      phoneScore: categoryScore(healthScore, "phone"),
      responseSlaPct: snapshot.responseSla.pct,
      resolutionSlaPct: snapshot.resolutionSla.pct,
      ticketsCreated: snapshot.netTicketChange.createdToday,
      ticketsClosed: snapshot.netTicketChange.closedToday,
      netChange: snapshot.netTicketChange.net,
      backlogTotal: snapshot.backlog.total,
      agingOver24h: snapshot.aging.agingOver24h,
      phoneAnswerRatePct: snapshot.answerRate.pct,
    },
  });
}

export function slaStatusColor(metric: SlaMetric, green: number, yellow: number): KpiStatus {
  if (metric.status !== "available" || metric.pct === null) return "unavailable";
  return bandHigherIsBetter(metric.pct, green, yellow);
}

export function agingStatusColor(aging: TechActionableAging, green: number, yellow: number): KpiStatus {
  return bandLowerIsBetter(aging.agingOver24h, green, yellow);
}

// The ServiceDeskHealthDaily row from exactly 7 days ago, or null if
// none exists yet (before this table has 7+ days of real history — see
// its schema comment). Comparing to the same weekday rather than
// "yesterday" avoids weekday-shape noise (a Monday's aging count is
// naturally different from Friday's), same reasoning TechOrgLastWeek
// already applies at the org level.
export async function getServiceDeskHealthWeekAgo(): Promise<ServiceDeskHealthDaily | null> {
  const weekAgo = startOfToday();
  weekAgo.setDate(weekAgo.getDate() - 7);
  return prisma.serviceDeskHealthDaily.findUnique({ where: { date: weekAgo } });
}

// Yesterday's row, or null if nobody loaded /tech-performance yesterday
// (this app has no background cron — every table like this is only
// written on page load, see ServiceDeskHealthDaily's schema comment) —
// used by morningBrief.ts (Phase 11) for the "YESTERDAY" block, and by
// Huddle Mode for the same figures. A missing row must read as "not
// recorded," never a fabricated zero-activity day.
export async function getServiceDeskHealthYesterday(): Promise<ServiceDeskHealthDaily | null> {
  const yesterday = startOfToday();
  yesterday.setDate(yesterday.getDate() - 1);
  return prisma.serviceDeskHealthDaily.findUnique({ where: { date: yesterday } });
}

// ---------------------------------------------------------------------------
// SLA At Risk — real-time countdown list, distinct from Response/Resolution
// SLA above (those are aggregate percentages; this is the specific list of
// tickets whose deadline is coming up soon, for a manager who needs to
// know exactly which ticket to chase next).
// ---------------------------------------------------------------------------

export type SlaAtRiskTicket = {
  id: string;
  haloTicketId: string;
  clientName: string | null;
  summary: string;
  priority: TicketPriority;
  assignedTech: string;
  // Threaded through so callers can exclude project-tracking tickets
  // (PROJECT_TICKET_TYPE_IDS, halopsa.ts) themselves — e.g. managerAlerts.ts's
  // slaApproachingBreach — without this function's own query changing for
  // its other consumer (the standalone SLA At Risk section), which still
  // shows every ticket type.
  ticketTypeId: number | null;
  slaType: "response" | "resolution";
  dueAt: Date;
  // Negative = already past due. respondByAt/fixByAt are HaloPSA's own
  // real deadlines (already computed against Halo's own SLA calendar),
  // so this is a plain wall-clock countdown, not run through
  // businessHoursElapsed — that engine is for measuring elapsed time
  // against an *approximate* target, not for counting down to an
  // already-precise absolute deadline.
  minutesRemaining: number;
};

const SLA_AT_RISK_WINDOW_HOURS = 4;
// Some HaloPSA tickets carry a respondbydate/fixbydate far in the past
// relative to when this app first saw them (confirmed live — e.g. a
// project-style P4 ticket opened 2026-08-10 with a respondbydate of
// 2026-07-18, evidently inherited rather than reset). Without a lower
// bound, one ancient breach sorts to the very top of this list forever
// and buries the genuinely time-sensitive countdowns the section exists
// to surface. A breach that old is a chronic-neglect problem (already
// surfaced separately via stale-ticket alerts), not a "real-time"
// risk — so this list only shows breaches within the lookback window.
const SLA_AT_RISK_LOOKBACK_HOURS = 24;

// A ticket can appear twice (once for its response deadline, once for
// its resolution deadline) if both fall inside the window — that's
// correct, they're two genuinely different countdowns a manager needs
// to see, not a duplicate.
export async function getSlaAtRiskTickets(): Promise<SlaAtRiskTicket[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + SLA_AT_RISK_WINDOW_HOURS * 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() - SLA_AT_RISK_LOOKBACK_HOURS * 60 * 60 * 1000);

  const tickets = await prisma.ticketSnapshot.findMany({
    where: { OR: [{ respondByAt: { not: null } }, { fixByAt: { not: null } }] },
  });

  const results: SlaAtRiskTicket[] = [];
  for (const t of tickets) {
    if (t.respondByAt && !t.respondedAt && t.respondByAt <= windowEnd && t.respondByAt >= windowStart) {
      results.push({
        id: t.id,
        haloTicketId: t.haloTicketId,
        clientName: t.clientName,
        summary: t.summary,
        priority: t.priority,
        assignedTech: t.assignedTech,
        ticketTypeId: t.ticketTypeId,
        slaType: "response",
        dueAt: t.respondByAt,
        minutesRemaining: Math.round((t.respondByAt.getTime() - now.getTime()) / 60000),
      });
    }
    if (t.fixByAt && t.fixByAt <= windowEnd && t.fixByAt >= windowStart) {
      results.push({
        id: t.id,
        haloTicketId: t.haloTicketId,
        clientName: t.clientName,
        summary: t.summary,
        priority: t.priority,
        assignedTech: t.assignedTech,
        ticketTypeId: t.ticketTypeId,
        slaType: "resolution",
        dueAt: t.fixByAt,
        minutesRemaining: Math.round((t.fixByAt.getTime() - now.getTime()) / 60000),
      });
    }
  }

  return results.sort((a, b) => a.minutesRemaining - b.minutesRemaining);
}
