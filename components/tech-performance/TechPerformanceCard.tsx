import { hoursSeverity, SEVERITY_FILL, SEVERITY_TEXT } from "@/lib/hoursSeverity";
import type { TechPerformance } from "@/lib/services/techPerformance";

function Sparkline({ trend }: { trend: TechPerformance["trend"] }) {
  if (trend.length < 2) {
    return (
      <div className="mt-3 font-data text-[11px] text-text-faint">
        Trend builds in as weekly syncs accumulate.
      </div>
    );
  }

  const width = 160;
  const height = 28;
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
      className="mt-3 h-7 w-full"
      role="img"
      aria-label={`Weekly logged hours over the last ${trend.length} weeks`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-series-1)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatTile({ value, label, tone }: { value: number | string; label: string; tone?: "warn" | "critical" }) {
  const toneClass = tone === "critical" ? "text-status-critical" : tone === "warn" ? "text-status-warn" : "text-text";
  return (
    <div>
      <div className={`font-display text-lg font-semibold ${toneClass}`}>{value}</div>
      <div className="font-data text-[11px] text-text-faint">{label}</div>
    </div>
  );
}

export function TechPerformanceCard({ tech }: { tech: TechPerformance }) {
  const pct = tech.expectedHours > 0 ? tech.loggedHours / tech.expectedHours : 1;
  const sev = hoursSeverity(pct);

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-base font-medium text-text">{tech.person}</span>
        <span className={`font-data text-xs ${SEVERITY_TEXT[sev]}`}>
          {tech.loggedHours}h / {tech.expectedHours}h this week
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
        <div
          className={`h-full rounded-full ${SEVERITY_FILL[sev]}`}
          style={{ width: `${Math.min(100, pct * 100)}%` }}
        />
      </div>

      <div className="mt-4 flex gap-5">
        <StatTile value={tech.openCount} label="open tickets" />
        <StatTile value={tech.p1Count} label="P1" tone={tech.p1Count > 0 ? "critical" : undefined} />
        <StatTile value={tech.agingCount} label="aging" tone={tech.agingCount > 0 ? "warn" : undefined} />
      </div>

      <div className="mt-4 flex gap-5 border-t border-border pt-4">
        <StatTile value={tech.callsAnswered} label="calls answered" />
        <StatTile value={tech.callsMissed} label="calls missed" tone={tech.callsMissed > 0 ? "warn" : undefined} />
        <StatTile value={tech.avgTalkMinutes} label="avg talk (min)" />
      </div>

      <div className="mt-3 flex gap-5">
        <StatTile value={tech.avgAnswerSeconds ?? "—"} label="avg answer (s)" />
        <StatTile
          value={tech.pickupRate !== null ? `${Math.round(tech.pickupRate * 100)}%` : "—"}
          label="pickup rate"
          tone={
            tech.pickupRate !== null
              ? tech.pickupRate < 0.8
                ? "critical"
                : tech.pickupRate < 0.9
                  ? "warn"
                  : undefined
              : undefined
          }
        />
      </div>

      <Sparkline trend={tech.trend} />
    </div>
  );
}
