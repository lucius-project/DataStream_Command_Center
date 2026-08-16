// Technician Performance Score — Phase 6 of the /tech-performance rebuild.
// Deterministic, weighted composite over already-computed per-tech
// signals (Response SLA, Resolution SLA, median first response, ticket
// hygiene, throughput) — same rebalancing pattern as Service Desk
// Health's composite score (serviceDeskHealth.ts's computeHealthScore):
// unavailable categories are excluded, not scored zero, and the
// remaining weights rebalance proportionally back to 100%. Every
// category is always shown with its own detail line, never a bare
// number, per "never display a mystery score."
//
// CSAT, Reopen Rate, and First Touch Resolution are locked at the
// individual level, same as Service Desk Health's locked strip. CSAT
// surveys are confirmed disabled on this HaloPSA account. FTR needs the
// per-ticket Actions history this app deliberately avoids fetching (see
// managerAlerts.ts's header comment). A real Reopened/Resolved rate
// needs the same history — the only reopen signal buildable without
// that fan-out (a ticket currently open whose haloTicketId also has a
// TicketCloseLog row) would silently miss any reopen-then-reclose that
// happens between page loads, since TicketCloseLog keeps only the
// latest close per ticket (an upsert, not an append log). Showing that
// as "Reopen Rate" would overstate its precision against the spec's own
// explicit formula, so Quality stays locked rather than shipping a soft
// approximation.
//
// Phone (answer rate, missed-call recovery) is also locked at the
// individual level — see techPerformance.ts's TechOrgSummary comment:
// the phone system rings the whole team at once (a hunt group), so an
// individual CDR's internalExtension for an unanswered call reflects
// whichever extension happened to log it, not "the one person who
// should have answered." Attributing a miss to one tech would be a
// guess dressed up as data. Calls handled (answered count) is still
// shown on the card for context via TechPerformance.callsAnswered — it's
// real, attributed activity — it's just not scored, since volume alone
// isn't a quality signal.

import { prisma } from "@/lib/prisma";
import type { TicketSnapshot, TicketPriority } from "@/app/generated/prisma/client";
import { businessHoursElapsed, startOfWeek, startOfToday } from "@/lib/dateUtils";
import { matchKnownTech } from "@/lib/integrations/haloShared";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import { OPEN_STATUSES, getStaleTickets, type StaleTicket } from "./operations";
import { median } from "./serviceDeskHealth";
import type { TechPerformance } from "./techPerformance";
import { buildTrend } from "./techPerformance";
import type { KpiTrend } from "./businessHealth";
import type { TechRole } from "@/app/generated/prisma/client";
import { getKpiSettings, type TechRoleConfigValue } from "./kpiSettings";
import { TECH_ROLE_LABELS } from "@/lib/techRole";

// TechRole is a real Prisma enum (Phase 12, see KpiSettings/TechRoleConfig
// in schema.prisma) rather than a hand-written TS union — re-exported here
// so existing importers (TechPerformanceRow.tsx etc.) are unaffected by
// where the type actually lives. Role assignment itself now comes from
// getTechRoleConfigs() (lib/services/kpiSettings.ts), admin-editable via
// /admin, replacing the old hardcoded TECH_ROLES map — see roleFor below.
export type { TechRole };

// Display labels — imported from lib/techRole.ts (a dependency-free
// module) and re-exported here for backward compat, rather than defined
// in this file. This file transitively imports lib/prisma.ts; a "use
// client" component importing TECH_ROLE_LABELS from here directly would
// pull that whole chain into the browser bundle and fail to build
// (confirmed live — see lib/techRole.ts's own comment). Client
// components (e.g. components/admin/TechRolesForm.tsx) must import
// TECH_ROLE_LABELS from lib/techRole.ts directly instead.
export { TECH_ROLE_LABELS };

// Role-normalized "appropriate throughput" reference band — a judgment
// call configured per role (same honesty pattern as the 15s ring-time
// target in techPerformance.ts), not a cited industry benchmark. Widened
// for roles whose work is inherently lower-volume/higher-complexity so a
// senior engineer solving hard escalations doesn't score poorly simply
// for closing fewer tickets — the spec's own example.
const THROUGHPUT_BAND: Record<TechRole, { green: number; yellow: number }> = {
  SERVICE_DESK_TECHNICIAN: { green: 12, yellow: 6 },
  SENIOR_TECHNICIAN: { green: 9, yellow: 4 },
  ESCALATION_ENGINEER: { green: 5, yellow: 2 },
  PROJECT_ENGINEER: { green: 5, yellow: 2 },
  SERVICE_DESK_MANAGER: { green: 5, yellow: 2 },
  HYBRID: { green: 8, yellow: 4 },
};

export type TechSlaMetric = {
  status: "available" | "insufficient_sample" | "unavailable";
  pct: number | null;
  met: number;
  eligible: number;
};

export type SlaMiss = {
  haloTicketId: string;
  clientName: string | null;
  priority: TicketPriority;
  dueAt: Date;
};

export type ClosedTicket = {
  haloTicketId: string;
  clientName: string | null;
  priority: TicketPriority;
  closedAt: Date;
};

export type TechServiceMetrics = {
  responseSla: TechSlaMetric;
  resolutionSla: TechSlaMetric;
  medianFirstResponseHours: number | null;
  closedThisWeek: number;
  staleCount: number;
  responseMisses: SlaMiss[];
  resolutionMisses: SlaMiss[];
  closedTicketsThisWeek: ClosedTicket[];
};

type Bucket = {
  responseMet: number;
  responseEligible: number;
  resolutionMet: number;
  resolutionEligible: number;
  firstResponseHours: number[];
  closedThisWeek: number;
  staleCount: number;
  responseMisses: SlaMiss[];
  resolutionMisses: SlaMiss[];
  closedTicketsThisWeek: ClosedTicket[];
};

function emptyBucket(): Bucket {
  return {
    responseMet: 0,
    responseEligible: 0,
    resolutionMet: 0,
    resolutionEligible: 0,
    firstResponseHours: [],
    closedThisWeek: 0,
    staleCount: 0,
    responseMisses: [],
    resolutionMisses: [],
    closedTicketsThisWeek: [],
  };
}

// One pass over TicketSnapshot (currently open) and TicketCloseLog
// (closed within the resolution window), bucketed by tech via
// matchKnownTech — same full-name-to-first-name matching used everywhere
// else a HaloPSA assignedTech string needs to line up with the four
// known techs. `staleTickets` can be passed in to reuse a value the
// caller already fetched (e.g. the page's own getStaleTickets() call for
// Service Desk Health) rather than querying twice.
export async function getTechServiceMetrics(staleTickets?: StaleTicket[]): Promise<Map<Tech, TechServiceMetrics>> {
  const now = new Date();
  const weekStart = startOfWeek();
  const { minSlaSample, resolutionWindowDays } = await getKpiSettings();
  const windowStart = new Date(now.getTime() - resolutionWindowDays * 24 * 60 * 60 * 1000);

  const [openTickets, closedTickets, stale] = await Promise.all([
    prisma.ticketSnapshot.findMany({ where: { respondByAt: { not: null } } }),
    prisma.ticketCloseLog.findMany({ where: { closedAt: { gte: windowStart } } }),
    staleTickets ? Promise.resolve(staleTickets) : getStaleTickets(),
  ]);

  const buckets = new Map<Tech, Bucket>();
  const bucketFor = (tech: Tech) => {
    let b = buckets.get(tech);
    if (!b) {
      b = emptyBucket();
      buckets.set(tech, b);
    }
    return b;
  };

  for (const t of openTickets) {
    const tech = matchKnownTech(t.assignedTech, KNOWN_TECHS);
    if (!tech || !t.respondByAt) continue;
    const b = bucketFor(tech);
    if (t.respondedAt) {
      b.responseEligible++;
      if (t.respondedAt <= t.respondByAt) b.responseMet++;
      // See serviceDeskHealth.ts's getResponseSla for why this excludes
      // (rather than clamps to 0) tickets where respondedAt predates
      // openedAt — a confirmed HaloPSA data quirk on backlog tickets,
      // not a real instant response.
      if (t.respondedAt > t.openedAt) b.firstResponseHours.push(businessHoursElapsed(t.openedAt, t.respondedAt));
    } else if (t.respondByAt < now) {
      b.responseEligible++;
      b.responseMisses.push({ haloTicketId: t.haloTicketId, clientName: t.clientName, priority: t.priority, dueAt: t.respondByAt });
    }
  }

  for (const t of closedTickets) {
    const tech = matchKnownTech(t.assignedTech, KNOWN_TECHS);
    if (!tech) continue;
    const b = bucketFor(tech);
    if (t.closedAt >= weekStart) {
      b.closedThisWeek++;
      b.closedTicketsThisWeek.push({ haloTicketId: t.haloTicketId, clientName: t.clientName, priority: t.priority, closedAt: t.closedAt });
    }
    if (t.fixByAt) {
      b.resolutionEligible++;
      if (t.closedAt <= t.fixByAt) b.resolutionMet++;
      else b.resolutionMisses.push({ haloTicketId: t.haloTicketId, clientName: t.clientName, priority: t.priority, dueAt: t.fixByAt });
    }
  }

  for (const s of stale) {
    const tech = matchKnownTech(s.assignedTech, KNOWN_TECHS);
    if (!tech) continue;
    bucketFor(tech).staleCount++;
  }

  const toSla = (met: number, eligible: number): TechSlaMetric => {
    if (eligible === 0) return { status: "unavailable", pct: null, met, eligible };
    if (eligible < minSlaSample) return { status: "insufficient_sample", pct: null, met, eligible };
    return { status: "available", pct: Math.round((met / eligible) * 1000) / 10, met, eligible };
  };

  const result = new Map<Tech, TechServiceMetrics>();
  for (const person of KNOWN_TECHS) {
    const b = buckets.get(person);
    result.set(person, {
      responseSla: toSla(b?.responseMet ?? 0, b?.responseEligible ?? 0),
      resolutionSla: toSla(b?.resolutionMet ?? 0, b?.resolutionEligible ?? 0),
      medianFirstResponseHours: b ? median(b.firstResponseHours) : null,
      closedThisWeek: b?.closedThisWeek ?? 0,
      staleCount: b?.staleCount ?? 0,
      responseMisses: b?.responseMisses ?? [],
      resolutionMisses: b?.resolutionMisses ?? [],
      closedTicketsThisWeek: b?.closedTicketsThisWeek ?? [],
    });
  }
  return result;
}

// Full ticket rows per tech, for card drill-down (open/aging/on-hold) —
// "never create numbers the manager cannot investigate." One query,
// bucketed the same way as everywhere else a HaloPSA assignedTech
// string needs to line up with the four known techs.
export async function getTicketsByTech(): Promise<Map<Tech, TicketSnapshot[]>> {
  const tickets = await prisma.ticketSnapshot.findMany();
  const byTech = new Map<Tech, TicketSnapshot[]>();
  for (const t of tickets) {
    const tech = matchKnownTech(t.assignedTech, KNOWN_TECHS);
    if (!tech) continue;
    const arr = byTech.get(tech) ?? [];
    arr.push(t);
    byTech.set(tech, arr);
  }
  return byTech;
}

export function isOpenStatus(status: string): boolean {
  return (OPEN_STATUSES as string[]).includes(status);
}

// Same bucketing as getTicketsByTech, applied to an already-fetched
// StaleTicket[] (see getStaleTickets in operations.ts) so the page can
// fetch that list once and reuse it for both Service Desk Health's
// staleCount and each tech card's own stale-ticket drill-down.
export function bucketStaleTicketsByTech(staleTickets: StaleTicket[]): Map<Tech, StaleTicket[]> {
  const byTech = new Map<Tech, StaleTicket[]>();
  for (const t of staleTickets) {
    const tech = matchKnownTech(t.assignedTech, KNOWN_TECHS);
    if (!tech) continue;
    const arr = byTech.get(tech) ?? [];
    arr.push(t);
    byTech.set(tech, arr);
  }
  return byTech;
}

export type TechScoreCategory = {
  key: "serviceDelivery" | "quality" | "productivity" | "workManagement" | "phone";
  label: string;
  weightPct: number;
  score: number | null;
  detail: string;
};

export type TechPerformanceScoreResult = {
  score: number | null;
  categories: TechScoreCategory[];
};

// Spec's stated framework: Service Delivery 30, Quality 25,
// Productivity 20, Work Management 15, Phone 10 — now admin-editable
// (Phase 12, KpiSettings.techWeight* fields, /admin). See
// computeTechPerformanceScore's `weights` parameter.
type TechScoreWeights = { serviceDelivery: number; quality: number; productivity: number; workManagement: number; phone: number };

// Response-time-to-score band — lower is better, a judgment call (not a
// cited benchmark), same honesty pattern as the SLA metrics' own
// thresholds elsewhere in this app.
function firstResponseTimeScore(hours: number): number {
  if (hours <= 2) return 100;
  if (hours <= 4) return 85;
  if (hours <= 8) return 65;
  if (hours <= 24) return 40;
  return 15;
}

function serviceDeliveryScore(m: TechServiceMetrics): number | null {
  const parts: number[] = [];
  if (m.responseSla.status === "available") parts.push(m.responseSla.pct!);
  if (m.resolutionSla.status === "available") parts.push(m.resolutionSla.pct!);
  if (m.medianFirstResponseHours !== null) parts.push(firstResponseTimeScore(m.medianFirstResponseHours));
  if (parts.length === 0) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

function productivityScore(closedThisWeek: number, role: TechRole): number {
  const band = THROUGHPUT_BAND[role];
  if (closedThisWeek >= band.green) return 100;
  if (closedThisWeek >= band.yellow) return 70;
  if (closedThisWeek > 0) return 45;
  return 25;
}

function workManagementScore(tech: TechPerformance, staleCount: number): number {
  let score = 100;
  score -= Math.min(40, tech.agingCount * 6);
  score -= Math.min(30, staleCount * 8);
  score -= Math.min(20, tech.onHoldCount > 3 ? (tech.onHoldCount - 3) * 5 : 0);
  // Time-entry completeness — symmetric penalty for drifting away from
  // 100% pace in either direction, capped so a single bad day doesn't
  // dominate the category.
  score -= Math.min(20, Math.abs(100 - tech.pacePct) / 3);
  return Math.max(0, Math.round(score));
}

export function computeTechPerformanceScore(
  tech: TechPerformance,
  serviceMetrics: TechServiceMetrics,
  role: TechRole,
  weights: TechScoreWeights,
): TechPerformanceScoreResult {
  const band = THROUGHPUT_BAND[role];
  const raw: { key: TechScoreCategory["key"]; label: string; score: number | null; detail: string }[] = [
    {
      key: "serviceDelivery",
      label: "Service Delivery",
      score: serviceDeliveryScore(serviceMetrics),
      detail:
        serviceMetrics.responseSla.status === "available" || serviceMetrics.resolutionSla.status === "available"
          ? [
              serviceMetrics.responseSla.status === "available"
                ? `Response SLA ${serviceMetrics.responseSla.pct}% (${serviceMetrics.responseSla.met}/${serviceMetrics.responseSla.eligible})`
                : null,
              serviceMetrics.resolutionSla.status === "available"
                ? `Resolution SLA ${serviceMetrics.resolutionSla.pct}% (${serviceMetrics.resolutionSla.met}/${serviceMetrics.resolutionSla.eligible})`
                : null,
              serviceMetrics.medianFirstResponseHours !== null
                ? `median first response ${Math.round(serviceMetrics.medianFirstResponseHours * 10) / 10}h`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : "Not enough eligible tickets yet to score response or resolution performance",
    },
    {
      key: "quality",
      label: "Quality",
      score: null,
      detail: "CSAT, reopen rate, and first-touch resolution aren't calculable per technician yet — see below.",
    },
    {
      key: "productivity",
      label: "Productivity",
      score: productivityScore(serviceMetrics.closedThisWeek, role),
      detail: `${serviceMetrics.closedThisWeek} ticket${serviceMetrics.closedThisWeek === 1 ? "" : "s"} closed this week · role-normalized target for ${TECH_ROLE_LABELS[role]}: ${band.green}+/week`,
    },
    {
      key: "workManagement",
      label: "Work Management",
      score: workManagementScore(tech, serviceMetrics.staleCount),
      detail: `${tech.agingCount} aging · ${serviceMetrics.staleCount} stale · ${tech.onHoldCount} on hold · ${Math.round(tech.pacePct)}% time-entry pace`,
    },
    {
      key: "phone",
      label: "Phone",
      score: null,
      detail: "Answer rate and missed-call recovery can't be attributed to an individual — the phone system rings the whole team at once. See the team Phone KPIs above.",
    },
  ];

  const available = raw.filter((c) => c.score !== null);
  const baseWeightSum = available.reduce((sum, c) => sum + weights[c.key], 0);

  const categories: TechScoreCategory[] = raw.map((c) => ({
    key: c.key,
    label: c.label,
    weightPct: c.score === null ? 0 : baseWeightSum > 0 ? Math.round((weights[c.key] / baseWeightSum) * 1000) / 10 : 0,
    score: c.score,
    detail: c.detail,
  }));

  // Same fabricated-0-score guard as computeHealthScore
  // (serviceDeskHealth.ts) — baseWeightSum === 0 means every available
  // category has 0 configured weight, which would otherwise sum to a
  // false 0/100 instead of "no real signal contributed."
  if (available.length === 0 || baseWeightSum === 0) return { score: null, categories };

  const score = Math.round(categories.reduce((sum, c) => sum + (c.score !== null ? (c.score * c.weightPct) / 100 : 0), 0));

  return { score, categories };
}

function techScoreCategory(result: TechPerformanceScoreResult, key: TechScoreCategory["key"]): number | null {
  return result.categories.find((c) => c.key === key)?.score ?? null;
}

// Freezes an already-computed TechPerformanceScoreResult into
// TechScoreDaily (Phase 10) — same "no new query, no external call, just
// an upsert on values the caller already has" rule as
// syncServiceDeskHealthDaily (serviceDeskHealth.ts). Upserted by
// (person, date), so repeat page loads the same day overwrite in place.
export async function syncTechScoreDaily(person: string, result: TechPerformanceScoreResult): Promise<void> {
  const date = startOfToday();
  const scores = {
    score: result.score,
    serviceDeliveryScore: techScoreCategory(result, "serviceDelivery"),
    qualityScore: techScoreCategory(result, "quality"),
    productivityScore: techScoreCategory(result, "productivity"),
    workManagementScore: techScoreCategory(result, "workManagement"),
    phoneScore: techScoreCategory(result, "phone"),
  };

  await prisma.techScoreDaily.upsert({
    where: { person_date: { person, date } },
    update: scores,
    create: { person, date, ...scores },
  });
}

// The TechScoreDaily row from exactly 7 days ago for one tech, or null
// before this table has that much history yet — same "same weekday, not
// yesterday" reasoning as getServiceDeskHealthWeekAgo (serviceDeskHealth.ts).
// Selects the category scores too (not just the overall score) — used
// both for the score badge's own trend arrow (getTechScoreTrendArrow,
// which only reads .score) and, from Phase 11, coaching.ts's per-category
// insights (serviceDeliveryScore/workManagementScore), so both consumers
// share one query instead of a second near-identical one.
export async function getTechScoreWeekAgo(
  person: string,
): Promise<{ score: number | null; serviceDeliveryScore: number | null; workManagementScore: number | null } | null> {
  const weekAgo = startOfToday();
  weekAgo.setDate(weekAgo.getDate() - 7);
  return prisma.techScoreDaily.findUnique({
    where: { person_date: { person, date: weekAgo } },
    select: { score: true, serviceDeliveryScore: true, workManagementScore: true },
  });
}

// "vs same day last week" rather than "vs yesterday" — a Monday's score
// is naturally lower before the week's hours/tickets accumulate, same
// reasoning TechOrgLastWeek already applies at the org level
// (techPerformance.ts). Rendered inline in TechScoreBadge.tsx, same
// pattern as getHealthScoreTrend in serviceDeskHealth.ts.
export function getTechScoreTrendArrow(
  currentScore: number | null,
  weekAgo: { score: number | null } | null,
): KpiTrend | undefined {
  if (currentScore === null) return undefined;
  return buildTrend(currentScore, weekAgo?.score ?? null, "up", (delta) => `${delta >= 0 ? "+" : ""}${Math.round(delta)} vs 7d ago`, 0);
}

const SCORE_TREND_DAYS = 30;
const TREND_DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export type TechScoreTrendDay = {
  date: string; // "YYYY-MM-DD", sortable as a string
  label: string; // "Aug 12"
  score: number | null; // null when no TechScoreDaily row exists for that day
};

export type TechScoreTrend = {
  // Oldest first, SCORE_TREND_DAYS fixed entries (today last) — same
  // fixed-window, null-for-missing-days shape as
  // getServiceDeskHealthTrend (serviceDeskHealth.ts).
  days: TechScoreTrendDay[];
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// DB-only — reads whatever TechScoreDaily rows exist for this tech in the
// window (never backfilled, see that model's schema comment) and
// left-joins them onto a fixed SCORE_TREND_DAYS-day calendar.
export async function getTechScoreTrend(person: string): Promise<TechScoreTrend> {
  const today = startOfToday();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (SCORE_TREND_DAYS - 1));

  const rows = await prisma.techScoreDaily.findMany({
    where: { person, date: { gte: windowStart, lte: today } },
    select: { date: true, score: true },
  });
  const scoreByDate = new Map(rows.map((r) => [dateKey(r.date), r.score]));

  const days: TechScoreTrendDay[] = [];
  for (let i = 0; i < SCORE_TREND_DAYS; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    days.push({ date: key, label: TREND_DAY_LABEL.format(d), score: scoreByDate.get(key) ?? null });
  }

  return { days };
}

function emptyServiceMetrics(): TechServiceMetrics {
  return {
    responseSla: { status: "unavailable", pct: null, met: 0, eligible: 0 },
    resolutionSla: { status: "unavailable", pct: null, met: 0, eligible: 0 },
    medianFirstResponseHours: null,
    closedThisWeek: 0,
    staleCount: 0,
    responseMisses: [],
    resolutionMisses: [],
    closedTicketsThisWeek: [],
  };
}

// TechPerformance.person and Prisma's assignedTech are both plain
// strings (the wider type any HaloPSA payload could in principle send),
// while every map keyed by Tech in this file is only ever populated for
// KNOWN_TECHS members. These three helpers are the single place that
// narrows a page-level `string` back to `Tech`, with a safe fallback if
// the roster ever drifts out of sync — never a silent crash on a page
// serving a live dashboard.
// techRoleConfigs comes from getTechRoleConfigs() (kpiSettings.ts, Phase
// 12) — fetched once per page and threaded through, same "sync happens
// up top" discipline as everything else on this page. Falls back to the
// default role if the roster ever drifts out of sync with
// TechRoleConfig's rows, never a silent crash on a page serving a live
// dashboard.
export function roleFor(person: string, techRoleConfigs: Map<Tech, TechRoleConfigValue>): TechRole {
  return techRoleConfigs.get(person as Tech)?.role ?? "SERVICE_DESK_TECHNICIAN";
}

export function serviceMetricsFor(map: Map<Tech, TechServiceMetrics>, person: string): TechServiceMetrics {
  return map.get(person as Tech) ?? emptyServiceMetrics();
}

export function ticketsFor(map: Map<Tech, TicketSnapshot[]>, person: string): TicketSnapshot[] {
  return map.get(person as Tech) ?? [];
}

export function staleTicketsFor(map: Map<Tech, StaleTicket[]>, person: string): StaleTicket[] {
  return map.get(person as Tech) ?? [];
}

// "Never create numbers the manager cannot investigate" — plain data
// shape a card drill-down button can render directly (see
// components/tech-performance/DrilldownStat.tsx's identically-shaped
// DrilldownRow prop type). Built here, in a plain function, rather than
// inside the card component itself: reading the current time is an
// impure operation the React Compiler's purity rule forbids directly
// inside a component's render body, so every "how old is this ticket"
// calculation happens once, server-side, before the component ever runs.
export type TechCardRow = {
  id: string;
  primary: string;
  secondary?: string;
  tertiary?: string;
  href?: string;
};

export type TechCardTicketData = {
  openCount: number;
  onHoldCount: number;
  agingCount: number;
  priorityCounts: Record<TicketPriority, number>;
  openRows: TechCardRow[];
  agingRows: TechCardRow[];
  onHoldRows: TechCardRow[];
  staleRows: TechCardRow[];
  closedRows: TechCardRow[];
  responseMissRows: TechCardRow[];
  resolutionMissRows: TechCardRow[];
};

const AGING_MS = 24 * 60 * 60 * 1000;

export function buildTechCardTicketData(
  tickets: TicketSnapshot[],
  staleTickets: StaleTicket[],
  serviceMetrics: TechServiceMetrics,
): TechCardTicketData {
  const now = Date.now();

  const openTickets = tickets.filter((t) => isOpenStatus(t.status));
  const onHoldTickets = tickets.filter((t) => !isOpenStatus(t.status));
  const agingTickets = openTickets.filter((t) => now - t.openedAt.getTime() > AGING_MS);

  const priorityCounts: Record<TicketPriority, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const t of openTickets) priorityCounts[t.priority]++;

  const ticketRow = (t: TicketSnapshot): TechCardRow => ({
    id: t.id,
    primary: t.haloTicketId,
    secondary: t.clientName ?? undefined,
    tertiary: `${t.priority} · ${t.status} · opened ${Math.round((now - t.openedAt.getTime()) / 3600000)}h ago`,
    href: "/tech-performance",
  });
  const staleRow = (t: StaleTicket): TechCardRow => ({
    id: t.id,
    primary: t.haloTicketId,
    secondary: t.clientName ?? undefined,
    tertiary: `${t.priority} · ${Math.round(t.businessHoursSinceAction)} business hours since last action`,
    href: "/tech-performance",
  });
  const missRow = (m: SlaMiss, kind: string): TechCardRow => ({
    id: `${m.haloTicketId}-${kind}`,
    primary: m.haloTicketId,
    secondary: m.clientName ?? undefined,
    tertiary: `${m.priority} · ${kind} target missed ${Math.round((now - m.dueAt.getTime()) / 60000)}m ago`,
    href: "/tech-performance",
  });
  const closedRow = (c: ClosedTicket): TechCardRow => ({
    id: c.haloTicketId,
    primary: c.haloTicketId,
    secondary: c.clientName ?? undefined,
    tertiary: `${c.priority} · closed ${c.closedAt.toLocaleDateString()}`,
  });

  return {
    openCount: openTickets.length,
    onHoldCount: onHoldTickets.length,
    agingCount: agingTickets.length,
    priorityCounts,
    openRows: openTickets.map(ticketRow),
    agingRows: agingTickets.map(ticketRow),
    onHoldRows: onHoldTickets.map(ticketRow),
    staleRows: staleTickets.map(staleRow),
    closedRows: serviceMetrics.closedTicketsThisWeek.map(closedRow),
    responseMissRows: serviceMetrics.responseMisses.map((m) => missRow(m, "response")),
    resolutionMissRows: serviceMetrics.resolutionMisses.map((m) => missRow(m, "resolution")),
  };
}
