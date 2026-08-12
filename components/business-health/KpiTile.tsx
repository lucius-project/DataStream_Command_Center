import Link from "next/link";
import { STATUS_DOT, STATUS_TEXT } from "@/lib/kpiStatus";
import type { Kpi } from "@/lib/services/businessHealth";

const TREND_ARROW = { up: "↑", down: "↓", flat: "→" } as const;

// Color reflects whether the movement is an improvement for *this*
// metric, not the raw direction — e.g. "up" is good for Team Utilization
// but bad for Avg Pickup Time. `flat` is always neutral.
function trendColorClass(trend: NonNullable<Kpi["trend"]>): string {
  if (trend.direction === "flat") return "text-text-faint";
  return trend.direction === trend.goodDirection ? "text-status-ok" : "text-status-critical";
}

export function KpiTile({ kpi }: { kpi: Kpi }) {
  return (
    <Link
      href={kpi.href}
      className="flex flex-col gap-1 rounded-lg border border-border bg-panel p-3 hover:border-accent"
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[kpi.status]}`} />
        <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">{kpi.label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <div className={`font-display text-xl font-semibold ${STATUS_TEXT[kpi.status]}`}>{kpi.display}</div>
        {kpi.trend && (
          <span className={`font-data text-[11px] font-medium ${trendColorClass(kpi.trend)}`}>
            {TREND_ARROW[kpi.trend.direction]} {kpi.trend.changeLabel}
          </span>
        )}
      </div>
      <div className="font-data text-[11px] text-text-faint">{kpi.detail}</div>
    </Link>
  );
}
