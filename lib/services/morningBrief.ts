// Morning Brief — Phase 11 of the /tech-performance rebuild. Pure
// assembly, no new queries beyond the caller's own already-existing
// getServiceDeskHealthYesterday() lookup (serviceDeskHealth.ts, Phase
// 10) — everything else here is already computed by the page (today's
// health snapshot, alerts, coaching insights) and just gets selected
// into a compact summary. Deterministic, same "no AI, no invented
// numbers" rule as coaching.ts.

import type { ServiceDeskHealthDaily } from "@/app/generated/prisma/client";
import { netTicketChangeLabel, type NetTicketChange, type HealthScoreResult } from "./serviceDeskHealth";
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
  // The full breakdown, not just the number — the Morning Brief card's
  // Service Health tile opens the same HealthScoreBreakdownModal
  // HealthScoreTile.tsx does, so it needs the category detail too, not
  // a second, thinner copy of the score.
  healthScore: HealthScoreResult;
  // null when no ServiceDeskHealthDaily row exists for yesterday — this
  // app has no background cron, so a day nobody loaded /tech-performance
  // leaves a real gap (see that model's schema comment). Never a
  // fabricated zero-activity day.
  yesterday: MorningBriefYesterday | null;
  responseSlaPct: number | null;
  // Same live, admin-editable band as the "Response SLA" KPI tile on the
  // main dashboard (KpiSettings.responseSlaGreenPct/YellowPct) — unlike
  // Phone Answer below, this is the exact same today's-live number as
  // that tile, not a different-scope stat, so it should read the same
  // color that tile would show for the same value.
  responseSlaStatus: KpiStatus;
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
  // Just a count — the full sorted list is one scroll away (Needs
  // Attention / Manager Action Queue), so this card doesn't also single
  // out one alert as "the" primary concern.
  attentionCount: number;
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
  healthScoreToday: HealthScoreResult,
  yesterday: ServiceDeskHealthDaily | null,
  responseSlaPctToday: number | null,
  responseSlaGreenPct: number,
  responseSlaYellowPct: number,
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
    responseSlaStatus:
      responseSlaPctToday !== null ? bandHigherIsBetter(responseSlaPctToday, responseSlaGreenPct, responseSlaYellowPct) : "unavailable",
    phoneAnswerRatePct,
    phoneAnswerRateStatus:
      phoneAnswerRatePct !== null ? bandHigherIsBetter(phoneAnswerRatePct, PHONE_ANSWER_GREEN_PCT, PHONE_ANSWER_YELLOW_PCT) : "unavailable",
    attentionCount: alerts.length,
    positiveHighlight: coachingInsights.find((i) => i.tone === "positive") ?? null,
  };
}
