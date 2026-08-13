import Link from "next/link";
import type { MorningBrief } from "@/lib/services/morningBrief";
import { LABEL_TEXT_CLASS } from "./NetTicketChangeTile";
import { STATUS_TEXT } from "@/lib/kpiStatus";
import { InfoButton } from "@/components/shared/InfoButton";
import { MorningBriefHealthTile } from "./MorningBriefHealthTile";

// A row of equal-size tiles, same visual language as KpiTile.tsx (label
// on top, big number, one line of subtext) — every data point gets the
// same footprint regardless of how much text it has, instead of the old
// flex-wrap row where a short "94%" sat next to a much longer "Yesterday:
// 12 created · 9 closed · net -3 · Gaining Ground" sentence. shrink-0
// value class keeps a null "—" from making that particular tile any
// shorter than its neighbors.
function BriefTile({ label, value, valueClassName, sub }: { label: string; value: string; valueClassName?: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-border bg-panel-raised p-3 text-center">
      <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">{label}</span>
      <span className={`shrink-0 font-display text-xl font-semibold ${valueClassName ?? "text-text"}`}>{value}</span>
      {sub && <span className="font-data text-[10px] text-text-faint">{sub}</span>}
    </div>
  );
}

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
export function MorningBriefCard({ brief, huddleActive = false }: { brief: MorningBrief; huddleActive?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Morning Brief</span>
          <InfoButton
            title="Morning Brief"
            what="A five-second summary at the top of the page — every figure here is a plain reshaping of numbers computed elsewhere (Service Desk Health, Manager Alerts, Coaching Insights), never a new or separately-calculated number."
            meaning="Service health is today's live composite score. Yesterday's created/closed/net comes from the last time this page was loaded on that day (no background job — a day nobody opened the page has no row). Response SLA is today's live figure; Phone Answer is deliberately yesterday's, since 'how did phones go yesterday' is a different, more complete question than a still-in-progress today."
            calculation="Attention count is the size of the same sorted Manager Alerts list Needs Attention and the Manager Action Queue show below — scroll down for the full list rather than singling one out here. Positive Highlight is the first positive-tone Coaching Insight, if any exist yet."
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

        <BriefTile
          label="Yesterday"
          value={brief.yesterday ? `${brief.yesterday.net >= 0 ? "+" : ""}${brief.yesterday.net}` : "—"}
          valueClassName={brief.yesterday ? LABEL_TEXT_CLASS[brief.yesterday.label] : "text-text-faint"}
          sub={brief.yesterday ? `${brief.yesterday.created} created · ${brief.yesterday.closed} closed` : "No data recorded"}
        />

        <BriefTile
          label="Response SLA"
          value={brief.responseSlaPct !== null ? `${Math.round(brief.responseSlaPct)}%` : "—"}
          valueClassName={brief.responseSlaPct !== null ? STATUS_TEXT[brief.responseSlaStatus] : undefined}
        />

        <BriefTile
          label="Phone Answer (yesterday)"
          value={brief.phoneAnswerRatePct !== null ? `${Math.round(brief.phoneAnswerRatePct)}%` : "—"}
          valueClassName={brief.phoneAnswerRatePct !== null ? STATUS_TEXT[brief.phoneAnswerRateStatus] : undefined}
        />

        <BriefTile
          label="Needs Attention"
          value={`${brief.attentionCount}`}
          sub={`item${brief.attentionCount === 1 ? "" : "s"}`}
        />
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
