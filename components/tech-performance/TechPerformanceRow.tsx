import { AlertTriangle } from "lucide-react";
import { paceSeverity, SEVERITY_FILL, SEVERITY_TEXT } from "@/lib/hoursSeverity";
import type { TechPerformance } from "@/lib/services/techPerformance";
import { Stat, GroupLabel, StatusPill, DailyHoursBars } from "./shared";

function Sparkline({ trend }: { trend: TechPerformance["trend"] }) {
  if (trend.length < 2) return null;

  const width = 72;
  const height = 20;
  const max = Math.max(1, ...trend.map((t) => Math.max(t.loggedHours, t.expectedHours)));
  const points = trend
    .map((t, i) => {
      const x = trend.length > 1 ? (i / (trend.length - 1)) * width : 0;
      const y = height - (t.loggedHours / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="hidden h-5 w-[72px] shrink-0 opacity-70 sm:block"
      role="img"
      aria-label={`Weekly logged hours over the last ${trend.length} weeks`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-series-1)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TechPerformanceRow({ tech, todayIndex }: { tech: TechPerformance; todayIndex: number }) {
  const sev = paceSeverity(tech.pacePct);

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-data text-xs text-text-faint">#{tech.rank}</span>
          <span className="font-display text-base font-medium text-text">{tech.person}</span>
        </div>
        <div className="flex items-center gap-3">
          <Sparkline trend={tech.trend} />
          <StatusPill status={tech.status} />
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`font-display text-2xl font-semibold ${SEVERITY_TEXT[sev]}`}>
              {Math.round(tech.pacePct)}%
            </span>
            <span className="font-data text-xs text-text-faint">
              {tech.loggedHours}h logged · {tech.expectedHoursToDate}h expected to date
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
            <div
              className={`h-full rounded-full ${SEVERITY_FILL[sev]}`}
              style={{ width: `${Math.min(100, tech.pacePct)}%` }}
            />
          </div>
        </div>
      </div>

      {tech.flag && (
        <div className={`mt-2 flex items-center gap-1.5 font-data text-xs ${SEVERITY_TEXT[sev]}`}>
          <AlertTriangle size={13} />
          {tech.flag}
        </div>
      )}

      <DailyHoursBars dailyHours={tech.dailyHours} todayIndex={todayIndex} indent={false} />

      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-border pt-3">
        <div>
          <GroupLabel>Tickets</GroupLabel>
          <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={tech.openCount} label="open" />
              <Stat value={tech.p1Count} label="P1" tone={tech.p1Count > 0 ? "critical" : undefined} />
            </span>
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={tech.agingCount} label="aging" tone={tech.agingCount > 0 ? "warn" : undefined} />
              <Stat value={tech.onHoldCount} label="on hold" />
            </span>
          </div>
        </div>
        <div>
          <GroupLabel>Calls</GroupLabel>
          <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={tech.callsInbound} label="in" />
              <Stat value={tech.callsOutbound} label="out" />
            </span>
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={tech.avgAnswerSeconds ?? "—"} label="avg ring (s)" />
              <Stat value={tech.avgTalkMinutes} label="avg talk (min)" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
