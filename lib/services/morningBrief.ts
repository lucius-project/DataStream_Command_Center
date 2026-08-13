// Morning Brief — Phase 11 of the /tech-performance rebuild. Pure
// assembly, no new queries beyond the caller's own already-existing
// getServiceDeskHealthYesterday() lookup (serviceDeskHealth.ts, Phase
// 10) — everything else here is already computed by the page (today's
// health snapshot, alerts, coaching insights) and just gets selected
// into a compact summary. Deterministic, same "no AI, no invented
// numbers" rule as coaching.ts.

import type { ServiceDeskHealthDaily } from "@/app/generated/prisma/client";
import { netTicketChangeLabel, type NetTicketChange } from "./serviceDeskHealth";
import type { ManagerAlert } from "./managerAlerts";
import type { CoachingInsight } from "./coaching";
import { bandHigherIsBetter, type KpiStatus } from "@/lib/kpiStatus";

export type MorningBriefYesterday = {
  created: number;
  closed: number;
  net: number;
  label: NetTicketChange["label"];
};

export type MorningBrief = {
  healthScore: number | null;
  // null when no ServiceDeskHealthDaily row exists for yesterday — this
  // app has no background cron, so a day nobody loaded /tech-performance
  // leaves a real gap (see that model's schema comment). Never a
  // fabricated zero-activity day.
  yesterday: MorningBriefYesterday | null;
  responseSlaPct: number | null;
  // Yesterday's inbound answer rate (ServiceDeskHealthDaily.phoneAnswerRatePct),
  // not today's — deliberately different scope than responseSlaPct above,
  // since a "how did phones go yesterday" question is what this line
  // answers. null under the same "no row that day" rule as `yesterday`.
  phoneAnswerRatePct: number | null;
  // Deliberately its own band (PHONE_ANSWER_GREEN_PCT/YELLOW_PCT below),
  // NOT KpiSettings.answerRateGreenPct/YellowPct — that setting drives
  // the live "Call Answer Rate" KPI tile on the main dashboard
  // (serviceDeskHealth.ts) and is admin-editable from /admin; this line
  // is a distinct, stricter executive-facing bar (99/100 green, 97-98
  // yellow, ≤96 red) that must not move if an admin retunes the
  // dashboard tile's threshold.
  phoneAnswerRateStatus: KpiStatus;
  attentionCount: number;
  // alerts is expected pre-sorted (see sortAlerts, managerAlerts.ts) —
  // this just takes the first entry, it doesn't re-rank.
  primaryConcern: ManagerAlert | null;
  positiveHighlight: CoachingInsight | null;
};

// This card's own executive-facing band for the Phone Answer (yesterday)
// stat — 99-100 green, 97-98 yellow, 96-or-below red. Intentionally not
// sourced from KpiSettings: it's a stricter bar than the operational
// Call Answer Rate tile's admin-editable threshold, and must stay fixed
// even if that one is retuned.
const PHONE_ANSWER_GREEN_PCT = 99;
const PHONE_ANSWER_YELLOW_PCT = 97;

export function buildMorningBrief(
  healthScoreToday: number | null,
  yesterday: ServiceDeskHealthDaily | null,
  responseSlaPctToday: number | null,
  alerts: ManagerAlert[],
  coachingInsights: CoachingInsight[],
): MorningBrief {
  const phoneAnswerRatePct = yesterday?.phoneAnswerRatePct ?? null;
  return {
    healthScore: healthScoreToday,
    yesterday: yesterday
      ? {
          created: yesterday.ticketsCreated,
          closed: yesterday.ticketsClosed,
          net: yesterday.netChange,
          label: netTicketChangeLabel(yesterday.netChange),
        }
      : null,
    responseSlaPct: responseSlaPctToday,
    phoneAnswerRatePct,
    phoneAnswerRateStatus:
      phoneAnswerRatePct !== null ? bandHigherIsBetter(phoneAnswerRatePct, PHONE_ANSWER_GREEN_PCT, PHONE_ANSWER_YELLOW_PCT) : "unavailable",
    attentionCount: alerts.length,
    primaryConcern: alerts[0] ?? null,
    positiveHighlight: coachingInsights.find((i) => i.tone === "positive") ?? null,
  };
}
