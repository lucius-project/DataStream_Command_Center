import type { RemoteSessionAnalytics } from "@/lib/services/remoteSessions";

function minutesLabel(seconds: number): string {
  return `${Math.round((seconds / 60) * 10) / 10}m`;
}

function coverageLabel(start: Date | null): string {
  if (!start) return "no sessions tracked yet";
  const days = Math.max(1, Math.round((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)));
  return `tracking since ${start.toLocaleDateString()} (${days} day${days === 1 ? "" : "s"} of history)`;
}

// Org-wide remote-session analytics — see remoteSessions.ts's header
// comment for why coverage starts shallow and grows over real time
// rather than pretending a fixed window's worth of history exists.
// Gross vs Unique time is the spec's own mandatory distinction: Gross
// sums every session's own duration, Unique merges one technician's own
// overlapping sessions into real wall-clock time — two techs remoting in
// at once is genuinely 2x the labor, but the same tech in two
// (nested/overlapping) sessions isn't 2x their elapsed time.
export function RemoteSupportPanel({ analytics }: { analytics: RemoteSessionAnalytics }) {
  const { org } = analytics;
  return (
    <div className="mt-4 rounded-lg border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm font-medium text-text">Remote Support Analytics</span>
        <span className="font-data text-[11px] text-text-faint">{coverageLabel(analytics.coverageStart)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="font-display text-lg font-semibold text-text">{org.sessions}</div>
          <div className="font-data text-[11px] text-text-faint">remote sessions</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">{org.uniqueDeviceIds.size}</div>
          <div className="font-data text-[11px] text-text-faint">remote devices</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">{minutesLabel(org.grossSeconds)}</div>
          <div className="font-data text-[11px] text-text-faint">gross remote time</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">{minutesLabel(org.uniqueSeconds)}</div>
          <div className="font-data text-[11px] text-text-faint">unique remote time</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {org.durationStatus === "available" ? minutesLabel(org.medianDurationSeconds!) : "—"}
          </div>
          <div className="font-data text-[11px] text-text-faint">
            median session{org.durationStatus === "insufficient_sample" ? " (small sample)" : ""}
          </div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {org.durationStatus === "available" ? minutesLabel(org.p90DurationSeconds!) : "—"}
          </div>
          <div className="font-data text-[11px] text-text-faint">P90 session</div>
        </div>
        <div>
          <div className="font-display text-lg font-semibold text-text">
            {org.businessHoursSessions}/{org.afterHoursSessions}
          </div>
          <div className="font-data text-[11px] text-text-faint">business-hours / after-hours</div>
        </div>
        <div>
          <div className={`font-display text-lg font-semibold ${org.failedSessions > 0 ? "text-status-warn" : "text-text"}`}>
            {org.failedSessions}
          </div>
          <div className="font-data text-[11px] text-text-faint">
            failed sessions{org.canceledSessions > 0 ? ` · ${org.canceledSessions} canceled` : ""}
          </div>
        </div>
      </div>

      {analytics.topClients.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="font-data text-[10px] tracking-wide text-text-faint uppercase">Top clients by remote time</div>
          <div className="mt-2 flex flex-col gap-1.5 font-data text-[12px]">
            {analytics.topClients.map((c) => (
              <div key={c.organizationName} className="flex items-center justify-between">
                <span className="text-text">{c.organizationName}</span>
                <span className="text-text-faint">
                  {c.sessions} session{c.sessions === 1 ? "" : "s"} · {minutesLabel(c.grossSeconds)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
