"use client";

import { useState } from "react";
import type { ManagerAlert } from "@/lib/services/managerAlerts";
import { NeedsAttentionModal } from "./NeedsAttentionModal";

// The whole tile opens the list — unlike the trend tiles, there's no
// separate "breakdown vs. trend" split here, just one click target, so
// this stays a real <button> rather than needing a second icon overlay.
export function MorningBriefAttentionTile({ alerts, knownTechs }: { alerts: ManagerAlert[]; knownTechs: readonly string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-1 rounded-md border border-border bg-panel-raised p-3 text-center hover:border-accent"
      >
        <span className="font-data text-[10px] tracking-wide text-text-faint uppercase">Needs Attention</span>
        <span className="shrink-0 font-display text-xl font-semibold text-text">{alerts.length}</span>
        <span className="font-data text-[10px] text-text-faint">item{alerts.length === 1 ? "" : "s"}</span>
      </button>
      {open && <NeedsAttentionModal alerts={alerts} knownTechs={knownTechs} onClose={() => setOpen(false)} />}
    </>
  );
}
