import Link from "next/link";
import type { MorningBrief } from "@/lib/services/morningBrief";
import { LABEL_TEXT, LABEL_TEXT_CLASS } from "./NetTicketChangeTile";

function scoreColor(score: number | null): string {
  if (score === null) return "text-text-faint";
  if (score >= 80) return "text-status-ok";
  if (score >= 60) return "text-status-warn";
  return "text-status-critical";
}

// Compact, read-in-five-seconds summary at the very top of the page —
// deterministic, no chart, matches the master spec's own worked example
// almost verbatim (SERVICE HEALTH / YESTERDAY / Response SLA / Phone
// Answer / attention count / PRIMARY CONCERN / POSITIVE). See
// morningBrief.ts for why every field here is a plain reshaping of data
// already computed elsewhere on this page, never a new calculation.
export function MorningBriefCard({ brief }: { brief: MorningBrief }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Morning Brief</span>
        <Link href="/tech-performance/huddle" className="font-data text-[11px] text-accent hover:underline">
          Huddle Mode →
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-1.5">
          <span className={`font-display text-2xl font-semibold ${scoreColor(brief.healthScore)}`}>
            {brief.healthScore !== null ? `${brief.healthScore}/100` : "—"}
          </span>
          <span className="font-data text-[11px] text-text-faint">service health</span>
        </div>

        {brief.yesterday ? (
          <div className="font-data text-xs text-text-muted">
            Yesterday: {brief.yesterday.created} created · {brief.yesterday.closed} closed · net{" "}
            {brief.yesterday.net >= 0 ? "+" : ""}
            {brief.yesterday.net} ·{" "}
            <span className={LABEL_TEXT_CLASS[brief.yesterday.label]}>{LABEL_TEXT[brief.yesterday.label]}</span>
          </div>
        ) : (
          <div className="font-data text-xs text-text-faint">Yesterday: no data recorded — the page wasn&apos;t loaded.</div>
        )}

        <div className="font-data text-xs text-text-muted">
          Response SLA: {brief.responseSlaPct !== null ? `${Math.round(brief.responseSlaPct)}%` : "—"}
        </div>
        <div className="font-data text-xs text-text-muted">
          Phone Answer: {brief.phoneAnswerRatePct !== null ? `${Math.round(brief.phoneAnswerRatePct)}%` : "—"}
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3 font-data text-xs text-text-muted">
        {brief.attentionCount} item{brief.attentionCount === 1 ? "" : "s"} require attention
      </div>

      {brief.primaryConcern && (
        <div className="mt-2 flex items-start gap-2">
          <span className="shrink-0 font-data text-[10px] font-semibold tracking-wide text-status-critical uppercase">
            Primary Concern
          </span>
          <Link href={brief.primaryConcern.href} className="text-sm text-text hover:underline">
            {brief.primaryConcern.issue}
          </Link>
        </div>
      )}

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
