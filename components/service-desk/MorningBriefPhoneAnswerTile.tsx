"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import type { KpiStatus } from "@/lib/kpiStatus";
import { STATUS_TEXT } from "@/lib/kpiStatus";
import { PhoneAnswerTrendModal } from "./PhoneAnswerTrendModal";

// Same small-client-leaf pattern as the other Morning Brief trend tiles
// — static content stays a plain div, only the trend icon needs its own
// open state.
export function MorningBriefPhoneAnswerTile({ pct, status }: { pct: number | null; status: KpiStatus }) {
  const [trendOpen, setTrendOpen] = useState(false);

  return (
    <>
      <div className="relative flex flex-col items-center gap-1 rounded-md border border-border bg-panel-raised p-3 text-center">
        <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Phone Answer (yesterday)</span>
        <span className={`shrink-0 font-display text-xl font-semibold ${pct !== null ? STATUS_TEXT[status] : "text-text-faint"}`}>
          {pct !== null ? `${Math.round(pct)}%` : "—"}
        </span>
        <button
          type="button"
          aria-label="View Phone Answer trend"
          onClick={() => setTrendOpen(true)}
          className="absolute top-1.5 right-1.5 rounded p-0.5 text-text-faint hover:bg-panel-raised hover:text-text"
        >
          <TrendingUp size={11} />
        </button>
      </div>
      {trendOpen && <PhoneAnswerTrendModal onClose={() => setTrendOpen(false)} />}
    </>
  );
}
