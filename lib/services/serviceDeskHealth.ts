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
import type { Kpi, KpiTrend } from "./businessHealth";
import { getCallActivitySummary } from "./callActivity";
import { getBacklogBreakdown, getTechActionableAging, getStaleTickets, type BacklogBreakdown, type TechActionableAging } from "./operations";
import { buildTrend } from "./techPerformance";
import { median } from "./stats";

// Below this many eligible tickets, a percentage is misleadingly precise
// (1 of 1 = "100%") — same principle as CSAT's sample-count problem
// flagged in the discovery report, applied here to Response/Resolution
// SLA. Below the threshold the metric reports as unavailable with its
// real sample count shown, not a fabricated-looking percentage.
const MIN_SLA_SAMPLE = 5;

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
  const tickets = await prisma.ticketSnapshot.findMany({
    where: { respondByAt: { not: null } },
    select: { openedAt: true, respondByAt: true, respondedAt: true },
  });

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
  if (eligible < MIN_SLA_SAMPLE) {
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
// too small a sample, see MIN_SLA_SAMPLE) with a fixByAt target.
const RESOLUTION_WINDOW_DAYS = 30;

export async function getResolutionSla(): Promise<SlaMetric> {
  const windowStart = new Date(Date.now() - RESOLUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
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
  if (eligible < MIN_SLA_SAMPLE) {
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
export async function getNetTicketChange(): Promise<NetTicketChange> {
  const today = startOfToday();
  const [openedStillOpen, closedLog] = await Promise.all([
    prisma.ticketSnapshot.count({ where: { openedAt: { gte: today } } }),
    prisma.ticketCloseLog.findMany({ where: { closedAt: { gte: today } }, select: { openedAt: true } }),
  ]);

  const createdToday = openedStillOpen + closedLog.filter((t) => t.openedAt >= today).length;
  const closedToday = closedLog.length;
  const net = createdToday - closedToday;
  const label: NetTicketChange["label"] = net < 0 ? "GAINING_GROUND" : net === 0 ? "KEEPING_PACE" : "LOSING_GROUND";

  return { createdToday, closedToday, net, label };
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

// Base weights match the discovery report's proposal (Responsiveness 25,
// Resolution 20, Customer Experience 20, Workload 20, Phone 15) with
// Customer Experience removed (CSAT confirmed unavailable on this
// HaloPSA account — see the Phase 1-3 discovery report) and its 20%
// redistributed proportionally across the remaining four so they still
// sum to 100%. This is a judgment call, not a cited formula — the score
// is always shown with its full category breakdown (see
// HealthScoreCategory), never as a bare number, per "never display a
// mystery score."
const BASE_WEIGHTS = { responsiveness: 25, resolution: 20, workload: 20, phone: 15 } as const;

function workloadScore(net: NetTicketChange, aging: TechActionableAging): number {
  let score = 100;
  if (net.net > 0) score -= Math.min(30, net.net * 3); // losing ground — 3 pts per net ticket, capped
  score -= Math.min(40, aging.agingOver24h * 5); // 5 pts per tech-actionable ticket aging past 24 business hours, capped
  return Math.max(0, Math.round(score));
}

function computeHealthScore(
  responseSla: SlaMetric,
  resolutionSla: SlaMetric,
  net: NetTicketChange,
  aging: TechActionableAging,
  answerRate: { status: "available" | "unavailable"; pct: number | null },
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
            ? `Only ${responseSla.eligible} eligible tickets — below the ${MIN_SLA_SAMPLE}-ticket minimum sample`
            : "No tickets with a response target yet",
    },
    {
      key: "resolution",
      label: "Resolution",
      score: resolutionSla.status === "available" ? resolutionSla.pct : null,
      detail:
        resolutionSla.status === "available"
          ? `${resolutionSla.met}/${resolutionSla.eligible} tickets closed in the last ${RESOLUTION_WINDOW_DAYS} days met their resolution target`
          : resolutionSla.status === "insufficient_sample"
            ? `Only ${resolutionSla.eligible} eligible closures in ${RESOLUTION_WINDOW_DAYS} days — below the ${MIN_SLA_SAMPLE}-ticket minimum sample`
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
  const baseWeightSum = available.reduce((sum, c) => sum + BASE_WEIGHTS[c.key], 0);

  const categories: HealthScoreCategory[] = raw.map((c) => ({
    key: c.key,
    label: c.label,
    // Rebalanced proportionally among only the available categories, so
    // e.g. Phone being unavailable (no calls yet) doesn't silently zero
    // out 15% of the score — it's excluded and the rest sum to 100%.
    weightPct:
      c.score === null ? 0 : baseWeightSum > 0 ? Math.round((BASE_WEIGHTS[c.key] / baseWeightSum) * 1000) / 10 : 0,
    score: c.score,
    detail: c.detail,
  }));

  if (available.length === 0) return { score: null, categories };

  const score = Math.round(
    categories.reduce((sum, c) => sum + (c.score !== null ? (c.score * c.weightPct) / 100 : 0), 0),
  );

  return { score, categories };
}

export async function getServiceDeskHealthSnapshot(): Promise<ServiceDeskHealthSnapshot> {
  const directory = await getContactDirectory().catch(() => null);

  const [netTicketChange, responseSla, resolutionSla, backlog, aging, staleTickets, callSummary] = await Promise.all([
    getNetTicketChange(),
    getResponseSla(),
    getResolutionSla(),
    getBacklogBreakdown(),
    getTechActionableAging(),
    getStaleTickets(),
    getCallActivitySummary(directory),
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

  const healthScore = computeHealthScore(responseSla, resolutionSla, netTicketChange, aging, answerRate);

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

export function agingStatusColor(aging: TechActionableAging): KpiStatus {
  return bandLowerIsBetter(aging.agingOver24h, 0, 4);
}

function slaDisplay(metric: SlaMetric): string {
  if (metric.status === "available" && metric.pct !== null) return `${Math.round(metric.pct)}%`;
  if (metric.status === "insufficient_sample") return "—";
  return "—";
}

function slaDetail(metric: SlaMetric, noun: string): string {
  if (metric.status === "available") {
    const medianText = metric.medianHours !== null ? ` · median ${Math.round(metric.medianHours * 10) / 10}h` : "";
    return `${metric.met} of ${metric.eligible} ${noun} met target${medianText}`;
  }
  if (metric.status === "insufficient_sample") {
    return `Only ${metric.eligible} eligible ${noun} — below the ${MIN_SLA_SAMPLE}-ticket minimum sample`;
  }
  return `No ${noun} with a target yet`;
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

function pctDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${Math.round(delta * 10) / 10}pts vs 7d ago`;
}

function countDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${Math.round(delta)} vs 7d ago`;
}

// Health Score isn't Kpi-shaped (see getServiceDeskHealthKpis' comment),
// so its trend is computed separately here rather than folded into that
// function, and rendered inline inside HealthScoreTile.tsx.
export function getHealthScoreTrend(healthScore: HealthScoreResult, weekAgo: ServiceDeskHealthDaily | null): KpiTrend | undefined {
  if (healthScore.score === null) return undefined;
  return buildTrend(healthScore.score, weekAgo?.healthScore ?? null, "up", countDelta, 0);
}

// The four standard-shaped tiles (Response SLA, Resolution SLA, Aging,
// Answer Rate) — Net Ticket Change and Health Score get their own
// dedicated components instead (see components/service-desk/) since
// "make this visually prominent" / "never a mystery score" both need
// more than the generic KpiTile shape offers.
//
// weekAgo is optional and, when provided, threads a `.trend` onto each
// tile via buildTrend (techPerformance.ts) — the same "omit rather than
// fabricate when there's no honest prior value" rule KpiTile already
// renders correctly. Direction is set explicitly per metric, not
// defaulted: higher is better for SLA/Answer Rate, lower is better for
// Aging — copy-pasting one direction across all four would color a
// worsening Aging trend green, exactly what "don't use generic trend
// colouring" warns against.
export function getServiceDeskHealthKpis(s: ServiceDeskHealthSnapshot, weekAgo?: ServiceDeskHealthDaily | null): Kpi[] {
  const prior = weekAgo ?? null;
  const responseSlaTrend: KpiTrend | undefined =
    s.responseSla.pct !== null ? buildTrend(s.responseSla.pct, prior?.responseSlaPct ?? null, "up", pctDelta) : undefined;
  const resolutionSlaTrend: KpiTrend | undefined =
    s.resolutionSla.pct !== null ? buildTrend(s.resolutionSla.pct, prior?.resolutionSlaPct ?? null, "up", pctDelta) : undefined;
  const agingTrend = buildTrend(s.aging.agingOver24h, prior?.agingOver24h ?? null, "down", countDelta, 0);
  const answerRateTrend: KpiTrend | undefined =
    s.answerRate.status === "available"
      ? buildTrend(s.answerRate.pct!, prior?.phoneAnswerRatePct ?? null, "up", pctDelta)
      : undefined;

  return [
    {
      key: "responseSla",
      label: "Response SLA",
      value: s.responseSla.pct,
      display: slaDisplay(s.responseSla),
      status: slaStatusColor(s.responseSla, 90, 75),
      detail: slaDetail(s.responseSla, "open tickets"),
      benchmark: "default target 90%, not a universal industry figure",
      href: "/operations",
      trend: responseSlaTrend,
    },
    {
      key: "resolutionSla",
      label: "Resolution SLA",
      value: s.resolutionSla.pct,
      display: slaDisplay(s.resolutionSla),
      status: slaStatusColor(s.resolutionSla, 90, 75),
      detail: slaDetail(s.resolutionSla, `closures in ${RESOLUTION_WINDOW_DAYS}d`),
      benchmark: "default target 90%, not a universal industry figure",
      href: "/operations",
      trend: resolutionSlaTrend,
    },
    {
      key: "techAging",
      label: "Tech-Actionable Aging",
      value: s.aging.agingOver24h,
      display: `${s.aging.agingOver24h}`,
      status: agingStatusColor(s.aging),
      detail: `${s.aging.byBucket["1-3d"]} 1-3d · ${s.aging.byBucket["3-7d"]} 3-7d · ${s.aging.byBucket["7d+"]} 7d+ · excludes tickets waiting on the customer/vendor`,
      benchmark: "0 aging past 24 business hours is healthy",
      href: "/operations",
      trend: agingTrend,
    },
    {
      key: "answerRate",
      label: "Call Answer Rate",
      value: s.answerRate.pct,
      display: s.answerRate.status === "available" ? `${Math.round(s.answerRate.pct!)}%` : "—",
      status: s.answerRate.status === "available" ? bandHigherIsBetter(s.answerRate.pct!, 90, 80) : "unavailable",
      detail:
        s.answerRate.status === "available"
          ? `${s.answerRate.answered} of ${s.answerRate.total} inbound calls answered today`
          : "No inbound calls yet today",
      benchmark: "healthy range 90%+",
      href: "/calls",
      trend: answerRateTrend,
    },
  ];
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
  priority: TicketPriority;
  assignedTech: string;
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
        priority: t.priority,
        assignedTech: t.assignedTech,
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
        priority: t.priority,
        assignedTech: t.assignedTech,
        slaType: "resolution",
        dueAt: t.fixByAt,
        minutesRemaining: Math.round((t.fixByAt.getTime() - now.getTime()) / 60000),
      });
    }
  }

  return results.sort((a, b) => a.minutesRemaining - b.minutesRemaining);
}
