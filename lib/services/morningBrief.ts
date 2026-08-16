// Morning Brief — Phase 11 of the /tech-performance rebuild. Pure
// assembly, no new queries beyond the caller's own already-existing
// getServiceDeskHealthYesterday() lookup (serviceDeskHealth.ts, Phase
// 10) — everything else here is already computed by the page (today's
// health snapshot, alerts, coaching insights) and just gets selected
// into a compact summary. Deterministic, same "no AI, no invented
// numbers" rule as coaching.ts.

import type { ServiceDeskHealthDaily } from "@/app/generated/prisma/client";
import {
  PHONE_ANSWER_GREEN_PCT,
  PHONE_ANSWER_YELLOW_PCT,
  type NetTicketChange,
  type HealthScoreResult,
  type TicketTrend30DayTotal,
} from "./serviceDeskHealth";
import type { ManagerAlert } from "./managerAlerts";
import type { CoachingInsight } from "./coaching";
import { bandHigherIsBetter, type KpiStatus } from "@/lib/kpiStatus";

export type MorningBriefTicketTrend = {
  created: number;
  closed: number;
  net: number;
  label: NetTicketChange["label"];
  daysWithData: number;
};

export type MorningBrief = {
  // The full breakdown, not just the number — the Morning Brief card's
  // Service Health tile opens the same HealthScoreBreakdownModal
  // HealthScoreTile.tsx does, so it needs the category detail too, not
  // a second, thinner copy of the score.
  healthScore: HealthScoreResult;
  // Rolling 30-day total (created/closed/net), not just yesterday's
  // snapshot — matches the tile's "Ticket Trend" framing better than a
  // single day would. null only when the table has zero rows in the
  // window yet (brand-new install); daysWithData tells the tile how
  // much real history actually backs the total, since this table is
  // never backfilled (see ServiceDeskHealthDaily's schema comment).
  ticketTrend: MorningBriefTicketTrend | null;
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
  // Deliberately its own band (PHONE_ANSWER_GREEN_PCT/YELLOW_PCT,
  // serviceDeskHealth.ts), NOT KpiSettings.answerRateGreenPct/YellowPct — that setting drives
  // the live "Call Answer Rate" KPI tile on the main dashboard
  // (serviceDeskHealth.ts) and is admin-editable from /admin; this line
  // is a distinct, stricter executive-facing bar (99/100 green, 97-98
  // yellow, ≤96 red) that must not move if an admin retunes the
  // dashboard tile's threshold.
  phoneAnswerRateStatus: KpiStatus;
  // The full sorted list, not just a count — the tile shows the number
  // but clicking it opens the same list Needs Attention/Manager Action
  // Queue show further down the page, via the same alertFocusItems/
  // FocusTable rendering, not a second copy of the logic.
  alerts: ManagerAlert[];
  positiveHighlight: CoachingInsight | null;
};

export function buildMorningBrief(
  healthScoreToday: HealthScoreResult,
  yesterday: ServiceDeskHealthDaily | null,
  ticketTrend30Day: TicketTrend30DayTotal,
  responseSlaPctToday: number | null,
  responseSlaGreenPct: number,
  responseSlaYellowPct: number,
  alerts: ManagerAlert[],
  coachingInsights: CoachingInsight[],
): MorningBrief {
  const phoneAnswerRatePct = yesterday?.phoneAnswerRatePct ?? null;
  return {
    healthScore: healthScoreToday,
    ticketTrend:
      ticketTrend30Day.daysWithData > 0
        ? {
            created: ticketTrend30Day.created,
            closed: ticketTrend30Day.closed,
            net: ticketTrend30Day.net,
            label: ticketTrend30Day.label,
            daysWithData: ticketTrend30Day.daysWithData,
          }
        : null,
    responseSlaPct: responseSlaPctToday,
    responseSlaStatus:
      responseSlaPctToday !== null ? bandHigherIsBetter(responseSlaPctToday, responseSlaGreenPct, responseSlaYellowPct) : "unavailable",
    phoneAnswerRatePct,
    phoneAnswerRateStatus:
      phoneAnswerRatePct !== null ? bandHigherIsBetter(phoneAnswerRatePct, PHONE_ANSWER_GREEN_PCT, PHONE_ANSWER_YELLOW_PCT) : "unavailable",
    alerts,
    positiveHighlight: coachingInsights.find((i) => i.tone === "positive") ?? null,
  };
}
