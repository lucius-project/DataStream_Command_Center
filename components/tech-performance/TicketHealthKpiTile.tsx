"use client";

import { useState } from "react";
import type { Kpi } from "@/lib/services/businessHealth";
import type { ManagerAlert } from "@/lib/services/managerAlerts";
import { STATUS_DOT, STATUS_TEXT, STATUS_LABEL } from "@/lib/kpiStatus";
import { InfoButton } from "@/components/shared/InfoButton";
import { KPI_INFO_CONTENT } from "@/components/shared/kpiInfoContent";
import { NeedsAttentionModal } from "@/components/service-desk/NeedsAttentionModal";

const TREND_ARROW = { up: "↑", down: "↓", flat: "→" } as const;

function trendColorClass(trend: NonNullable<Kpi["trend"]>): string {
  if (trend.direction === "flat") return "text-text-faint";
  return trend.direction === trend.goodDirection ? "text-status-ok" : "text-status-critical";
}

// Same visual shape and per-tile InfoButton overlay as the shared
// KpiTile (business-health/KpiTile.tsx) rendered via OrgKpiStrip — but a
// <button> that opens the same Needs Attention pop-out as the section
// right below it in Ticket Details, instead of KpiTile's default
// "navigate to kpi.href". The P1/aging count this tile shows IS what's
// driving most of that list, so a click should surface the list
// directly rather than just re-landing on the page it's already on.
// Scoped to this one tile rather than a KpiTile variant/prop — this
// "open the underlying list" behavior doesn't generalize to KpiTile's
// other callers (e.g. Business Health's cockpit), which have no
// equivalent list to open.
export function TicketHealthKpiTile({
  kpi,
  alerts,
  knownTechs,
}: {
  kpi: Kpi;
  alerts: ManagerAlert[];
  knownTechs: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const info = KPI_INFO_CONTENT[kpi.key];

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col gap-1 rounded-lg border border-border bg-panel p-3 text-left hover:border-accent"
      >
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[kpi.status]}`} aria-hidden />
            <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">{kpi.label}</span>
          </div>
          <span className={`font-data text-[9px] font-semibold tracking-wide uppercase ${STATUS_TEXT[kpi.status]}`}>
            {STATUS_LABEL[kpi.status]}
          </span>
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
      </button>
      {info && (
        <InfoButton
          title={kpi.label}
          what={info.what}
          meaning={`Currently ${kpi.display} — ${kpi.detail}. ${kpi.benchmark}.`}
          calculation={info.calculation}
          className="absolute top-1.5 right-1.5"
        />
      )}
      {open && <NeedsAttentionModal alerts={alerts} knownTechs={knownTechs} onClose={() => setOpen(false)} />}
    </div>
  );
}
