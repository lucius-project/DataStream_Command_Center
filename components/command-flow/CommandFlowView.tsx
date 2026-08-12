import { Radar, Inbox, BookOpen, PartyPopper } from "lucide-react";
import { TriageCard } from "@/components/inbox/TriageCard";
import { AttentionCard } from "@/components/operations/AttentionPane";
import { RunbookItemCard } from "@/components/runbooks/RunbookItemCard";
import type { CommandFlowEntry } from "@/lib/services/commandFlow";

const SOURCE_LABEL: Record<CommandFlowEntry["source"], string> = {
  OPERATIONS: "Operations",
  INBOX: "Inbox",
  RUNBOOK: "Runbook",
};

export function CommandFlowView({ queue }: { queue: CommandFlowEntry[] }) {
  const counts = { OPERATIONS: 0, INBOX: 0, RUNBOOK: 0 };
  for (const entry of queue) counts[entry.source]++;

  const top = queue[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-data text-xs text-text-muted">
        <span>{queue.length} remaining</span>
        {queue.length > 0 && (
          <span className="flex items-center gap-3 text-text-faint">
            {counts.OPERATIONS > 0 && (
              <span className="flex items-center gap-1">
                <Radar size={12} />
                {counts.OPERATIONS}
              </span>
            )}
            {counts.INBOX > 0 && (
              <span className="flex items-center gap-1">
                <Inbox size={12} />
                {counts.INBOX}
              </span>
            )}
            {counts.RUNBOOK > 0 && (
              <span className="flex items-center gap-1">
                <BookOpen size={12} />
                {counts.RUNBOOK}
              </span>
            )}
          </span>
        )}
      </div>

      {!top ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-panel p-10 text-center">
          <PartyPopper size={28} className="text-status-ok" />
          <div className="text-sm text-text">All clear. Nothing needs you right now.</div>
        </div>
      ) : (
        <>
          <div className="mb-2 font-data text-[11px] tracking-wide text-text-faint uppercase">
            {SOURCE_LABEL[top.source]}
          </div>
          {top.source === "INBOX" && <TriageCard item={top.item} />}
          {top.source === "OPERATIONS" && <AttentionCard flag={top.flag} />}
          {top.source === "RUNBOOK" && <RunbookItemCard item={top.item} />}
        </>
      )}
    </div>
  );
}
