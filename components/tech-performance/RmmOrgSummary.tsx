import type { RemoteSessionAnalytics } from "@/lib/services/remoteSessions";
import { Stat, GroupLabel } from "./shared";

function minutesLabel(seconds: number): string {
  return `${Math.round((seconds / 60) * 10) / 10}m`;
}

// Team-wide counterpart to each per-tech card's own "Remote Support"
// group (TechPerformanceRow.tsx) — same underlying getRemoteSessionAnalytics()
// call already made once on the page for those cards, just reading its
// `org` total and `topDevices` instead of `byTech`, so this is a plain
// reshaping of already-fetched data, not a second computation. No date
// window filter exists on the underlying query (see remoteSessions.ts),
// so this is a whole-history rollup, not "this week" — coverageStart is
// shown so that's honest rather than implied.
export function RmmOrgSummary({ analytics }: { analytics: RemoteSessionAnalytics }) {
  const { org, topDevices, coverageStart } = analytics;

  if (org.sessions === 0 && org.failedSessions === 0) {
    return <p className="font-data text-[11px] text-text-faint">No remote sessions tracked yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 font-data text-[11px]">
        <span className="flex flex-wrap gap-x-2.5">
          <Stat value={org.sessions} label="sessions" />
          <Stat value={org.uniqueDeviceIds.size} label="devices" />
          {org.failedSessions > 0 && <Stat value={org.failedSessions} label="failed" tone="warn" />}
        </span>
        <span className="flex flex-wrap gap-x-2.5">
          <Stat value={minutesLabel(org.grossSeconds)} label="gross time" />
          <Stat value={minutesLabel(org.uniqueSeconds)} label="unique time" />
        </span>
        {org.durationStatus === "available" && (
          <span className="flex flex-wrap gap-x-2.5">
            <Stat value={minutesLabel(org.medianDurationSeconds!)} label="median session" />
            <Stat value={minutesLabel(org.p90DurationSeconds!)} label="P90 session" />
          </span>
        )}
        {coverageStart && (
          <span className="text-text-faint">
            Since {coverageStart.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>

      {topDevices.length > 0 && (
        <div>
          <GroupLabel>Top Devices</GroupLabel>
          <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
            {topDevices.slice(0, 5).map((d) => (
              <span key={d.deviceName} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-text">
                  {d.deviceName}
                  {d.organizationName && <span className="text-text-faint"> · {d.organizationName}</span>}
                </span>
                <span className="shrink-0 text-text-muted">
                  {d.sessions} sessions · {minutesLabel(d.grossSeconds)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
