import Link from "next/link";
import type { CoachingInsight } from "@/lib/services/coaching";
import { InfoButton } from "@/components/shared/InfoButton";

const COACHING_INFO = {
  title: "Coaching & Recognition",
  what: "Things worth a check-in (Worth a Look) and things worth calling out (Positive Recognition) — generated from real week-over-week trend changes, not opinions or AI guesses.",
  meaning: "Positive and improvement items are weighted equally — no 'bad news first' ordering — matching a coaching, not surveillance, framing. Empty on day one and for roughly the first week of use, since there's no honest 'vs 7 days ago' comparison yet without that much history.",
  calculation:
    "Every statement is generated deterministically (template text, not an LLM) from an already-computed trend — e.g. a technician's score moving meaningfully up or down week-over-week, or an org-level metric improving or worsening. If the underlying trend isn't real, the statement doesn't get generated.",
};

// Same "grouped list of bordered cards" convention as NeedsAttentionSection
// — but positive and improvement groups are equally weighted (no severity
// ranking, no "bad news first"), matching the spec's "coaching, not
// surveillance" framing. Every statement here already traces to a real
// Phase 10 trend (see coaching.ts) — there is no ungrounded praise or
// criticism possible by construction.
// Exported for reuse by the Huddle Mode route (Phase 11), which shows
// only the positive-tone subset ("Wins") in its own compact layout.
export function InsightCard({ insight }: { insight: CoachingInsight }) {
  const toneClass = insight.tone === "positive" ? "text-status-ok" : "text-status-warn";
  const body = (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-panel p-3">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${insight.tone === "positive" ? "bg-status-ok" : "bg-status-warn"}`} />
        <span className="font-data text-xs font-medium text-text-muted">{insight.subject}</span>
      </div>
      <div className={`text-sm ${toneClass}`}>{insight.statement}</div>
    </div>
  );
  return insight.href ? (
    <Link href={insight.href} className="hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

// Level 3 of the /tech-performance rebuild — Coaching Insights (things
// worth a check-in) and Positive Recognition (things worth calling out),
// generated deterministically from already-computed trend data (see
// lib/services/coaching.ts's own header comment for why this is
// template-string generation, not an LLM call). Empty on day 1 and for
// the first week of any table's history — that's the correct state, not
// an error, since no honest "vs 7 days ago" comparison exists yet.
export function CoachingSection({ insights }: { insights: CoachingInsight[] }) {
  const positive = insights.filter((i) => i.tone === "positive");
  const improvement = insights.filter((i) => i.tone === "improvement");

  if (insights.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <span className="flex items-center gap-1.5">
        <h2 className="font-display text-sm font-medium text-text-muted">Coaching &amp; Recognition</h2>
        <InfoButton {...COACHING_INFO} />
      </span>
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          No coaching insights yet — these build up once at least a week of history has been recorded.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5">
        <h2 className="font-display text-sm font-medium text-text-muted">Coaching &amp; Recognition</h2>
        <InfoButton {...COACHING_INFO} />
      </span>
      {positive.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-data text-[11px] font-semibold tracking-wide text-status-ok uppercase">
            Positive Recognition ({positive.length})
          </span>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {positive.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </div>
      )}
      {improvement.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-data text-[11px] font-semibold tracking-wide text-status-warn uppercase">
            Worth a Look ({improvement.length})
          </span>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {improvement.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
