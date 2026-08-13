"use client";

import { useState } from "react";
import type { HealthScoreResult } from "@/lib/services/serviceDeskHealth";
import { HealthScoreBreakdownModal, scoreColor } from "./HealthScoreBreakdownModal";

// The Service Health tile inside MorningBriefCard's tile row — same
// click-to-open breakdown as the main HealthScoreTile.tsx, same shared
// modal, just reshaped to sit as one of five equal-size tiles instead of
// a standalone card. A small client leaf (matching HealthScoreTile's own
// pattern) rather than making the whole MorningBriefCard a client
// component, since every other tile in that row is plain server-rendered
// text.
export function MorningBriefHealthTile({ result }: { result: HealthScoreResult }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-1 rounded-md border border-border bg-panel-raised p-3 text-center hover:border-accent"
      >
        <span className="flex w-full items-center justify-between gap-1">
          <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Service Health</span>
          <span className="font-data text-[9px] text-text-faint underline">breakdown</span>
        </span>
        <span className={`shrink-0 font-display text-xl font-semibold ${scoreColor(result.score)}`}>
          {result.score !== null ? `${result.score}/100` : "—"}
        </span>
      </button>
      {open && <HealthScoreBreakdownModal result={result} onClose={() => setOpen(false)} />}
    </>
  );
}
