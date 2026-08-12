import type { PhoneAnalyticsDetail } from "@/lib/services/callActivity";

function minutesLabel(seconds: number): string {
  return `${Math.round((seconds / 60) * 10) / 10}m`;
}

// Rolling-window detail behind the "today" tiles above the call log —
// median/P90 (not just average) answer and talk time, plus after-hours
// volume tracked as its own honest bucket rather than silently dropped
// (see isBusinessHours in dateUtils.ts — after-hours calls route to
// voicemail, nobody was ever meant to answer them, so they're excluded
// from every other number here the same way they are everywhere else in
// this app).
export function PhoneAnalyticsPanel({ detail }: { detail: PhoneAnalyticsDetail }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-medium text-text">Phone Analytics</span>
        <span className="font-data text-[11px] text-text-faint">last {detail.windowDays} days, business hours</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {detail.answerRatePct !== null ? `${detail.answerRatePct}%` : "—"}
          </div>
          <div className="font-data text-[11px] text-text-faint">
            answer rate ({detail.answeredInbound}/{detail.inboundCalls})
          </div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {detail.ringTimeStatus === "available" ? `${detail.medianRingSeconds}s` : "—"}
          </div>
          <div className="font-data text-[11px] text-text-faint">
            median answer time{detail.ringTimeStatus === "insufficient_sample" ? " (small sample)" : ""}
          </div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {detail.ringTimeStatus === "available" ? `${detail.p90RingSeconds}s` : "—"}
          </div>
          <div className="font-data text-[11px] text-text-faint">P90 answer time</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">{detail.outboundCalls}</div>
          <div className="font-data text-[11px] text-text-faint">outbound calls</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {detail.talkTimeStatus === "available" ? minutesLabel(detail.medianTalkSeconds!) : "—"}
          </div>
          <div className="font-data text-[11px] text-text-faint">
            median talk time{detail.talkTimeStatus === "insufficient_sample" ? " (small sample)" : ""}
          </div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {detail.talkTimeStatus === "available" ? minutesLabel(detail.p90TalkSeconds!) : "—"}
          </div>
          <div className="font-data text-[11px] text-text-faint">P90 talk time</div>
        </div>
        <div>
          <div
            className={`font-display text-lg font-semibold ${detail.afterHours.missed > 0 ? "text-status-warn" : "text-text"}`}
          >
            {detail.afterHours.inboundCalls}
          </div>
          <div className="font-data text-[11px] text-text-faint">
            after-hours calls ({detail.afterHours.answered} to voicemail, {detail.afterHours.missed} unanswered)
          </div>
        </div>
        <div>
          <span
            title="United Cloud's CDR data has no disposition/abandon field beyond the missed flag this app already uses — not confirmed available, not guessed at."
            className="inline-block rounded border border-border-strong bg-panel-raised px-2 py-1 font-data text-[10px] text-text-faint"
          >
            Abandoned Calls · not tracked
          </span>
        </div>
      </div>
    </div>
  );
}
