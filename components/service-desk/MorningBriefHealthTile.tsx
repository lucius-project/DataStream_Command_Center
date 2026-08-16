"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import type { HealthScoreResult } from "@/lib/services/serviceDeskHealth";
import { HealthScoreBreakdownModal, scoreColor } from "./HealthScoreBreakdownModal";
import { HealthScoreTrendModal } from "./HealthScoreTrendModal";

// The Service Health tile inside MorningBriefCard's tile row — same
// click-to-open breakdown as the main HealthScoreTile.tsx, same shared
// modal, just reshaped to sit as one of five equal-size tiles instead of
// a standalone card. A small client leaf (matching HealthScoreTile's own
// pattern) rather than making the whole MorningBriefCard a client
// component, since every other tile in that row is plain server-rendered
// text. Outer element is a div, not a button, so the trend icon can sit
// as a true sibling (a button can't nest inside another button) — same
// structure TechScoreBadge.tsx already uses for its own trend button.
export function MorningBriefHealthTile({ result }: { result: HealthScoreResult }) {
  const [open, setOpen] = useState(false);
  const [trendOpen, setTrendOpen] = useState(false);

  return (
    <>
      <div className="relative flex flex-col items-center gap-1 rounded-md border border-border bg-panel-raised p-3 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full flex-col items-center gap-1 pr-4 hover:opacity-90"
        >
          <span className="flex w-full items-center justify-between gap-1">
            <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Service Health</span>
            <span className="font-data text-[9px] text-text-faint underline">breakdown</span>
          </span>
          <span className={`shrink-0 font-display text-xl font-semibold ${scoreColor(result.score)}`}>
            {result.score !== null ? `${result.score}%` : "—"}
          </span>
        </button>
        <button
          type="button"
          aria-label="View Service Desk Health trend"
          onClick={() => setTrendOpen(true)}
          className="absolute top-1.5 right-1.5 rounded p-0.5 text-text-faint hover:bg-panel-raised hover:text-text"
        >
          <TrendingUp size={11} />
        </button>
      </div>
      {open && <HealthScoreBreakdownModal result={result} onClose={() => setOpen(false)} />}
      {trendOpen && <HealthScoreTrendModal onClose={() => setTrendOpen(false)} />}
    </>
  );
}
