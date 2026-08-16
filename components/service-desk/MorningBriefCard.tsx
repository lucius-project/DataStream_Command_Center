import Link from "next/link";
import type { MorningBrief } from "@/lib/services/morningBrief";
import { InfoButton } from "@/components/shared/InfoButton";
import { MorningBriefHealthTile } from "./MorningBriefHealthTile";
import { MorningBriefTicketTrendTile } from "./MorningBriefTicketTrendTile";
import { MorningBriefResponseSlaTile } from "./MorningBriefResponseSlaTile";
import { MorningBriefPhoneAnswerTile } from "./MorningBriefPhoneAnswerTile";
import { MorningBriefAttentionTile } from "./MorningBriefAttentionTile";

// Compact, read-in-five-seconds summary at the very top of the page —
// deterministic, no chart, based on the master spec's own worked example
// (SERVICE HEALTH / YESTERDAY / Response SLA / Phone Answer / attention
// count / POSITIVE). Deliberately doesn't single out one "primary
// concern" — attention count is just a number, the full sorted list is
// one scroll away in Needs Attention / the Manager Action Queue. Shown
// identically here and at the top of Huddle Mode (/tech-performance/
// huddle, linked below) — this is the same card a morning huddle reads
// off of, not a separate view. See morningBrief.ts for why every field
// here is a plain reshaping of data already computed elsewhere on this
// page, never a new calculation.
export function MorningBriefCard({
  brief,
  knownTechs,
  huddleActive = false,
}: {
  brief: MorningBrief;
  knownTechs: readonly string[];
  huddleActive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Summary</span>
          <InfoButton
            title="Summary"
            what="A five-second summary at the top of the page — every figure here is a plain reshaping of numbers computed elsewhere (Service Desk Health, Manager Alerts, Coaching Insights), never a new or separately-calculated number."
            meaning="Service health is today's live composite score, with a 30-day pop-out. Ticket Trend shows the rolling 30-day created/closed/net total (built from a daily snapshot taken each time this page loads — no background job, so a day nobody opened the page leaves a gap, and the total honestly shows fewer days until 30 real days accumulate), with a daily pop-out for the day-by-day pattern. Response SLA is today's live figure, also with a 30-day pop-out. Phone Answer is deliberately yesterday's, since 'how did phones go yesterday' is a different, more complete question than a still-in-progress today — its own 30-day pop-out uses a fixed executive threshold (99/97), not the admin-editable Call Answer Rate setting."
            calculation="Needs Attention is the same sorted Manager Alerts list as the full Needs Attention section and Manager Action Queue below — click the tile for the list right here, or scroll down for the same thing in place. Positive Highlight is the first positive-tone Coaching Insight, if any exist yet."
          />
        </span>
        {/* A real navigation link styled as a switch, not a JS-driven
            toggle — Huddle Mode is a genuinely separate route (its own
            page deliberately makes no sync calls of its own, see that
            page's header comment), so "on" and "off" are two URLs, not
            client state. Works with open-in-new-tab, no extra JS needed. */}
        <Link
          href={huddleActive ? "/tech-performance" : "/tech-performance/huddle"}
          aria-label={huddleActive ? "Turn off Huddle Mode" : "Turn on Huddle Mode"}
          className="flex items-center gap-2"
        >
          <span className="font-data text-[11px] text-text-faint">Huddle Mode</span>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              huddleActive ? "bg-accent" : "bg-border-strong"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                huddleActive ? "translate-x-[18px]" : "translate-x-1"
              }`}
            />
          </span>
        </Link>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <MorningBriefHealthTile result={brief.healthScore} />

        <MorningBriefTicketTrendTile ticketTrend={brief.ticketTrend} />

        <MorningBriefResponseSlaTile pct={brief.responseSlaPct} status={brief.responseSlaStatus} />

        <MorningBriefPhoneAnswerTile pct={brief.phoneAnswerRatePct} status={brief.phoneAnswerRateStatus} />

        <MorningBriefAttentionTile alerts={brief.alerts} knownTechs={knownTechs} />
      </div>

      {brief.positiveHighlight && (
        <div className="mt-2 flex items-start gap-2">
          <span className="shrink-0 font-data text-[10px] font-semibold tracking-wide text-status-ok uppercase">
            Positive
          </span>
          {brief.positiveHighlight.href ? (
            <Link href={brief.positiveHighlight.href} className="text-sm text-text hover:underline">
              {brief.positiveHighlight.statement}
            </Link>
          ) : (
            <span className="text-sm text-text">{brief.positiveHighlight.statement}</span>
          )}
        </div>
      )}
    </div>
  );
}
