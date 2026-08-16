import type { MissedCallRecoveryStats, UnreturnedCall } from "@/lib/services/callActivity";
import { InfoButton } from "@/components/shared/InfoButton";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// Aggregate historical recovery rate/latency (getMissedCallRecoveryStats)
// plus the live "still outstanding right now" queue
// (getUnreturnedMissedCalls, the same list Manager Alerts on
// /tech-performance surfaces) — this is the dedicated phone-side view of
// both, per the spec's "UNRETURNED CALL / ABC Construction / Missed
// 10:42 AM / Not returned after 37 minutes" alert format.
export function MissedCallRecoveryPanel({
  stats,
  unreturned,
}: {
  stats: MissedCallRecoveryStats;
  unreturned: UnreturnedCall[];
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5">
          <span className="font-display text-sm font-medium text-text">Missed Call Recovery</span>
          <InfoButton
            title="Missed Call Recovery"
            what="Whether missed inbound calls actually get called back, and how fast — a missed call isn't automatically a lost customer if someone follows up quickly."
            meaning={`${stats.missedCalls} missed calls in the last ${stats.windowDays} business days${stats.status === "available" ? `, ${stats.callbackPct}% called back` : ""}. ${unreturned.length} still outstanding right now.`}
            calculation="Callback rate = calls returned ÷ calls missed, over the trailing window (business hours only). Median and P90 callback time measure how long it took to call back the ones that were returned. 'Currently unreturned' is the live, real-time list of missed calls with no callback yet — the same list Manager Alerts flags once one sits too long."
          />
        </span>
        <span className="font-data text-[11px] text-text-faint">last {stats.windowDays} days, business hours</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="font-display text-lg font-semibold text-text">{stats.missedCalls}</div>
          <div className="font-data text-[11px] text-text-muted">missed calls</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {stats.status === "available" ? `${stats.callbackPct}%` : "—"}
          </div>
          <div className="font-data text-[11px] text-text-muted">
            callback rate ({stats.returnedCalls}/{stats.missedCalls}
            {stats.status === "insufficient_sample" ? " — small sample" : ""})
          </div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {stats.medianCallbackMinutes !== null ? `${stats.medianCallbackMinutes}m` : "—"}
          </div>
          <div className="font-data text-[11px] text-text-muted">median callback time</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {stats.p90CallbackMinutes !== null ? `${stats.p90CallbackMinutes}m` : "—"}
          </div>
          <div className="font-data text-[11px] text-text-muted">P90 callback time</div>
        </div>
      </div>

      {unreturned.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          {/* Not promoted to a heading element — "Missed Call Recovery"
              itself (above) isn't a heading in this component's own
              markup, and this panel's placement on the page (no h2/h3
              wrapper of its own) means a lone h4 here would skip a
              level. Color-only fix, matching this file's other labels. */}
          <div className="font-data text-[10px] tracking-wide text-text-muted uppercase">Currently unreturned</div>
          {unreturned.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-status-critical/30 bg-status-critical-dim px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm text-text">{c.companyName ?? c.externalNumber}</span>
                <span className="font-data text-[11px] text-text-faint">missed {TIME_FORMAT.format(c.missedAt)}</span>
              </div>
              <span className="shrink-0 font-data text-xs font-medium text-status-critical">
                not returned after {c.minutesSinceMissed}m
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
