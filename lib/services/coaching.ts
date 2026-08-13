// Coaching Insights & Positive Recognition — Phase 11 of the
// /tech-performance rebuild. Same shape as managerAlerts.ts: plain
// functions reading already-computed data, returning template-string
// statements. No AI, no new metrics, no new persistence — this is a
// narrative layer over trend data Phases 4-10 already produce.
//
// "AI must not calculate core KPIs... must not invent operational truth"
// (master spec) — every statement here traces to a real Phase 10 trend
// (ServiceDeskHealthDaily/TechScoreDaily, 7-days-ago comparison). Reopen
// Rate and First Touch Resolution — both named in the spec's own example
// statements — are never cited: neither has a live computation anywhere
// in this app (see QUALITY_LOCKED/SERVICE_LOCKED in
// TechPerformanceRow.tsx, LOCKED_KPIS in ServiceDeskHealthSection.tsx).

import type { ServiceDeskHealthSnapshot } from "./serviceDeskHealth";
import type { TechPerformanceScoreResult } from "./techPerformanceScore";
import type { CallAnswerRateTrend } from "./callActivity";
import type { ServiceDeskHealthDaily } from "@/app/generated/prisma/client";

export type CoachingTone = "positive" | "improvement"; // no "negative"/shame framing, per spec

export type CoachingInsight = {
  id: string;
  tone: CoachingTone;
  subject: string; // "Service Desk" or a tech's name
  statement: string;
  href?: string;
};

// Minimum meaningful magnitude before a metric is worth a sentence —
// deliberately stricter than buildTrend's own flat-noise floor (0.5): a
// 1-point health-score wobble is technically "up" but not insight-worthy
// on its own. A judgment call, not a cited benchmark, same honesty
// pattern as every other threshold in this app — revisit against real
// data if these read as too chatty or too quiet.
const SLA_PCT_FLOOR = 3; // percentage points
const SCORE_FLOOR = 3; // 0-100 points
const AGING_FLOOR = 2; // ticket count

// ---------------------------------------------------------------------------
// Org-level (Service Desk Health)
// ---------------------------------------------------------------------------

function healthScoreInsight(current: number | null, prior: number | null | undefined): CoachingInsight | null {
  if (current === null || prior === null || prior === undefined) return null;
  const delta = current - prior;
  if (Math.abs(delta) < SCORE_FLOOR) return null;
  return delta > 0
    ? {
        id: "org-health-score",
        tone: "positive",
        subject: "Service Desk",
        statement: `Service Desk Health improved from ${prior} to ${current} over the past week.`,
        href: "/tech-performance",
      }
    : {
        id: "org-health-score",
        tone: "improvement",
        subject: "Service Desk",
        statement: `Service Desk Health is down from ${prior} to ${current} over the past week — worth a look.`,
        href: "/tech-performance",
      };
}

function slaInsight(
  id: string,
  label: string,
  current: number | null,
  prior: number | null | undefined,
): CoachingInsight | null {
  if (current === null || prior === null || prior === undefined) return null;
  const delta = current - prior;
  if (Math.abs(delta) < SLA_PCT_FLOOR) return null;
  return delta > 0
    ? {
        id,
        tone: "positive",
        subject: "Service Desk",
        statement: `${label} improved from ${prior}% to ${Math.round(current)}% over the past week.`,
        href: "/operations",
      }
    : {
        id,
        tone: "improvement",
        subject: "Service Desk",
        statement: `${label} declined from ${prior}% to ${Math.round(current)}% over the past week.`,
        href: "/operations",
      };
}

function agingInsight(current: number, prior: number | null | undefined): CoachingInsight | null {
  if (prior === null || prior === undefined) return null;
  const delta = current - prior;
  if (Math.abs(delta) < AGING_FLOOR) return null;
  // Lower is better for aging — the "up is good" wording used elsewhere
  // inverts here, same reason getServiceDeskHealthKpis gives Aging its
  // own goodDirection: "down" rather than defaulting.
  return delta < 0
    ? {
        id: "org-aging",
        tone: "positive",
        subject: "Service Desk",
        statement: `Tech-actionable aging tickets dropped from ${prior} to ${current} over the past week.`,
        href: "/operations",
      }
    : {
        id: "org-aging",
        tone: "improvement",
        subject: "Service Desk",
        statement: `Tech-actionable aging tickets rose from ${prior} to ${current} over the past week — worth a look.`,
        href: "/operations",
      };
}

// callTrend.trend already carries direction/goodDirection and a
// pre-filtered "flat" state (buildTrend, called with a 3-point floor
// inside getCallAnswerRateTrend, callActivity.ts) — this function only
// supplies the sentence, not a second comparison or a second floor.
function callAnswerRateInsight(callTrend: CallAnswerRateTrend | null): CoachingInsight | null {
  if (!callTrend?.trend || callTrend.trend.direction === "flat" || callTrend.rolling30.answerRatePct === null) {
    return null;
  }
  const isPositive = callTrend.trend.direction === callTrend.trend.goodDirection;
  return {
    id: "org-call-answer-rate",
    tone: isPositive ? "positive" : "improvement",
    subject: "Service Desk",
    statement: `Call Answer Rate is now ${callTrend.rolling30.answerRatePct}% over the last 30 days (${callTrend.trend.changeLabel}).`,
    href: "/calls",
  };
}

// weekAgo is the ServiceDeskHealthDaily row from 7 days ago, or null
// before that table has that much history yet (see its schema comment).
// callTrend is getCallAnswerRateTrend's own output (callActivity.ts),
// or null if the caller doesn't have a directory to fetch it with — the
// Call Answer Rate insight is simply omitted in that case, not faked.
export function getOrgCoachingInsights(
  snapshot: ServiceDeskHealthSnapshot,
  weekAgo: ServiceDeskHealthDaily | null,
  callTrend: CallAnswerRateTrend | null,
): CoachingInsight[] {
  return [
    healthScoreInsight(snapshot.healthScore.score, weekAgo?.healthScore),
    slaInsight(
      "org-response-sla",
      "Response SLA",
      snapshot.responseSla.status === "available" ? snapshot.responseSla.pct : null,
      weekAgo?.responseSlaPct,
    ),
    slaInsight(
      "org-resolution-sla",
      "Resolution SLA",
      snapshot.resolutionSla.status === "available" ? snapshot.resolutionSla.pct : null,
      weekAgo?.resolutionSlaPct,
    ),
    agingInsight(snapshot.aging.agingOver24h, weekAgo?.agingOver24h),
    callAnswerRateInsight(callTrend),
  ].filter((i): i is CoachingInsight => i !== null);
}

// ---------------------------------------------------------------------------
// Per-technician
// ---------------------------------------------------------------------------

export type TechScoreWeekAgo = { score: number | null; serviceDeliveryScore: number | null; workManagementScore: number | null };

function techScoreInsight(person: string, current: number | null, prior: number | null | undefined): CoachingInsight | null {
  if (current === null || prior === null || prior === undefined) return null;
  const delta = current - prior;
  if (Math.abs(delta) < SCORE_FLOOR) return null;
  return delta > 0
    ? {
        id: `tech-${person}-score`,
        tone: "positive",
        subject: person,
        statement: `${person}'s Performance Score improved from ${prior} to ${current} over the past week.`,
      }
    : {
        id: `tech-${person}-score`,
        tone: "improvement",
        subject: person,
        statement: `${person}'s Performance Score is down from ${prior} to ${current} over the past week — may be worth a check-in.`,
      };
}

function techCategoryInsight(
  person: string,
  key: "serviceDelivery" | "workManagement",
  label: string,
  current: number | null,
  prior: number | null | undefined,
): CoachingInsight | null {
  if (current === null || prior === null || prior === undefined) return null;
  const delta = current - prior;
  if (Math.abs(delta) < SCORE_FLOOR) return null;
  return delta > 0
    ? {
        id: `tech-${person}-${key}`,
        tone: "positive",
        subject: person,
        statement: `${person}'s ${label} score improved from ${prior} to ${current} over the past week.`,
      }
    : {
        id: `tech-${person}-${key}`,
        tone: "improvement",
        subject: person,
        statement: `${person}'s ${label} score is down from ${prior} to ${current} over the past week.`,
      };
}

function categoryScore(result: TechPerformanceScoreResult, key: "serviceDelivery" | "workManagement"): number | null {
  return result.categories.find((c) => c.key === key)?.score ?? null;
}

// weekAgo comes from getTechScoreWeekAgo (techPerformanceScore.ts), or
// null before TechScoreDaily has 7+ days of history for this tech.
// Quality/Phone are deliberately never cited here — TechScoreDaily's own
// qualityScore/phoneScore columns are always null (see that model's
// schema comment: no live computation exists for either), so an insight
// function for them would silently produce "improved from null to null."
export function getTechCoachingInsights(
  person: string,
  result: TechPerformanceScoreResult,
  weekAgo: TechScoreWeekAgo | null,
): CoachingInsight[] {
  return [
    techScoreInsight(person, result.score, weekAgo?.score),
    techCategoryInsight(person, "serviceDelivery", "Service Delivery", categoryScore(result, "serviceDelivery"), weekAgo?.serviceDeliveryScore),
    techCategoryInsight(person, "workManagement", "Work Management", categoryScore(result, "workManagement"), weekAgo?.workManagementScore),
  ].filter((i): i is CoachingInsight => i !== null);
}
