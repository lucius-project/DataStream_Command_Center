"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { STATUS_DOT, STATUS_TEXT } from "@/lib/kpiStatus";
import type { Kpi } from "@/lib/services/businessHealth";
import { AnswerRateTrendModal } from "./AnswerRateTrendModal";

// Visually the same shell as KpiTile, plus a trend button — the only KPI
// on this page with a drill-down, since it's the only one with real
// underlying time-series data worth charting (see
// getCallAnswerRateTrend in callActivity.ts). The button is a sibling of
// the Link, not nested inside it, so the tile stays valid markup (no
// interactive-inside-interactive) while most of the tile still navigates
// to /calls on click, same as every other tile.
export function AnswerRateTile({ kpi }: { kpi: Kpi }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="group relative rounded-lg border border-border bg-panel p-3 hover:border-accent">
      <Link href={kpi.href} className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 pr-5">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[kpi.status]}`} />
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">{kpi.label}</span>
        </div>
        <div className={`font-display text-xl font-semibold ${STATUS_TEXT[kpi.status]}`}>{kpi.display}</div>
        <div className="font-data text-[11px] text-text-faint">{kpi.detail}</div>
      </Link>

      <button
        type="button"
        aria-label="View month-by-month answer rate trend"
        onClick={() => setOpen(true)}
        className="absolute top-2 right-2 rounded p-1 text-text-faint hover:bg-panel-raised hover:text-text"
      >
        <TrendingUp size={13} />
      </button>

      {open && <AnswerRateTrendModal onClose={() => setOpen(false)} />}
    </div>
  );
}
