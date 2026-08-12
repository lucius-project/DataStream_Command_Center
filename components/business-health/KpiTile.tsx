import Link from "next/link";
import { STATUS_DOT, STATUS_TEXT } from "@/lib/kpiStatus";
import type { Kpi } from "@/lib/services/businessHealth";

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
      <div className={`font-display text-xl font-semibold ${STATUS_TEXT[kpi.status]}`}>{kpi.display}</div>
      <div className="font-data text-[11px] text-text-faint">{kpi.detail}</div>
    </Link>
  );
}
