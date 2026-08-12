"use client";

import { useState } from "react";
import { DispatchPane } from "./DispatchPane";
import { AttentionPane } from "./AttentionPane";
import { TimeGapsPanel } from "./TimeGapsPanel";
import type { AttentionFlag, TicketSnapshot, TimeGap } from "@/app/generated/prisma/client";
import type { TechLoad } from "@/lib/services/operations";

type Tab = "dispatch" | "attention" | "time";

const TABS: { key: Tab; label: string }[] = [
  { key: "dispatch", label: "Dispatch" },
  { key: "attention", label: "Attention" },
  { key: "time", label: "Team time" },
];

export function OperationsView({
  tickets,
  load,
  flags,
  timeGaps,
}: {
  tickets: TicketSnapshot[];
  load: TechLoad[];
  flags: (AttentionFlag & { ticket: TicketSnapshot | null })[];
  timeGaps: { tech: TimeGap[]; admin: TimeGap[] };
}) {
  const [tab, setTab] = useState<Tab>("dispatch");
  const openAttentionCount = flags.filter((f) => f.status === "OPEN").length;

  return (
    <div>
      {/* Mobile tab switcher */}
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-panel p-1 md:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-10 flex-1 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? "bg-accent text-bg" : "text-text-muted"
            }`}
          >
            {t.label}
            {t.key === "attention" && openAttentionCount > 0 && (
              <span className={`ml-1 ${tab === t.key ? "text-bg" : "text-status-warn"}`}>
                ({openAttentionCount})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="md:hidden">
        {tab === "dispatch" && <DispatchPane tickets={tickets} load={load} />}
        {tab === "attention" && <AttentionPane flags={flags} />}
        {tab === "time" && <TimeGapsPanel tech={timeGaps.tech} admin={timeGaps.admin} />}
      </div>

      {/* Desktop two-pane */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-4">
        <div>
          <h2 className="mb-2 font-display text-sm font-medium text-text-muted">Dispatch</h2>
          <DispatchPane tickets={tickets} load={load} />
        </div>
        <div>
          <h2 className="mb-2 font-display text-sm font-medium text-text-muted">
            Needs my attention
            {openAttentionCount > 0 && (
              <span className="ml-1.5 text-status-warn">({openAttentionCount})</span>
            )}
          </h2>
          <AttentionPane flags={flags} />
        </div>
        <div className="md:col-span-2">
          <TimeGapsPanel tech={timeGaps.tech} admin={timeGaps.admin} />
        </div>
      </div>
    </div>
  );
}
