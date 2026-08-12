import { prisma } from "@/lib/prisma";
import { getTriageQueue } from "@/lib/services/inbox";
import { getDueRunbookItems } from "@/lib/services/runbooks";
import type { AttentionFlag, TicketSnapshot, InboxItem } from "@/app/generated/prisma/client";
import type { DueRunbookItem } from "@/lib/services/runbooks";

export const ATTENTION_TYPE_RANK = { ESCALATION: 0, CEO_REVIEW: 1, SLA_BREACH: 2, OTHER: 3 } as const;

export type CommandFlowEntry =
  | { source: "OPERATIONS"; flag: AttentionFlag & { ticket: TicketSnapshot | null } }
  | { source: "INBOX"; item: InboxItem }
  | { source: "RUNBOOK"; item: DueRunbookItem };

// Only OPEN, non-snoozed flags — Command Flow is "what can I act on right
// now," unlike the Operations page's pane which also shows ACKNOWLEDGED
// (already-delegated) flags for visibility.
async function getOpenAttentionFlags() {
  const now = new Date();
  const flags = await prisma.attentionFlag.findMany({
    where: {
      status: "OPEN",
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    },
    include: { ticket: true },
  });
  return flags.sort((a, b) => {
    const rank = ATTENTION_TYPE_RANK[a.type] - ATTENTION_TYPE_RANK[b.type];
    if (rank !== 0) return rank;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

// Computed live from the three existing per-module queries — no separate
// QueueItem table to keep in sync. Priority: Operations attention flags
// (needs-you-personally is the highest-leverage tier) first, then Inbox
// Command's triage queue, then due Runbook items.
export async function getCommandFlowQueue(): Promise<CommandFlowEntry[]> {
  const [flags, inboxItems, runbookItems] = await Promise.all([
    getOpenAttentionFlags(),
    getTriageQueue(),
    getDueRunbookItems(),
  ]);

  return [
    ...flags.map((flag): CommandFlowEntry => ({ source: "OPERATIONS", flag })),
    ...inboxItems.map((item): CommandFlowEntry => ({ source: "INBOX", item })),
    ...runbookItems.map((item): CommandFlowEntry => ({ source: "RUNBOOK", item })),
  ];
}
