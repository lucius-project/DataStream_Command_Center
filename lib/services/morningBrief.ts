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
  phoneAnswerRatePct: number | null;
  attentionCount: number;
  // alerts is expected pre-sorted (see sortAlerts, managerAlerts.ts) —
  // this just takes the first entry, it doesn't re-rank.
  primaryConcern: ManagerAlert | null;
  positiveHighlight: CoachingInsight | null;
};

export function buildMorningBrief(
  healthScoreToday: number | null,
  yesterday: ServiceDeskHealthDaily | null,
  responseSlaPctToday: number | null,
  phoneAnswerRatePctToday: number | null,
  alerts: ManagerAlert[],
  coachingInsights: CoachingInsight[],
): MorningBrief {
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
    phoneAnswerRatePct: phoneAnswerRatePctToday,
    attentionCount: alerts.length,
    primaryConcern: alerts[0] ?? null,
    positiveHighlight: coachingInsights.find((i) => i.tone === "positive") ?? null,
  };
}
