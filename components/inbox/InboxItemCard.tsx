"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { InboxItem } from "@/app/generated/prisma/client";
import { TriageCard, type StaffOption } from "./TriageCard";
import { CATEGORY_LABELS, URGENCY_META } from "@/lib/inboxDisplay";

// One card shape reused by Morning Brief's "Today's Actions" grid and
// every board column (Today/Waiting/Delegated) — collapsed shows a
// compact summary line, expanding in place swaps in the full TriageCard
// (Reply/Delegate/Waiting/Snooze/Done, listen, full body) rather than
// duplicating that logic per column.
export function InboxItemCard({
  item,
  staffUsers = [],
  metaLine,
  showQuickReply = false,
}: {
  item: InboxItem;
  staffUsers?: StaffOption[];
  metaLine?: string | null;
  showQuickReply?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openMode, setOpenMode] = useState<"idle" | "reply">("idle");

  if (expanded) {
    return <TriageCard item={item} staffUsers={staffUsers} initialMode={openMode} />;
  }

  const urgencyMeta = item.urgency ? URGENCY_META[item.urgency] : null;
  const title = item.actionTitle || item.subject;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-panel p-3">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${urgencyMeta?.dot ?? "bg-text-faint"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {item.category && (
            <span className="rounded border border-border-strong px-1.5 py-0.5 font-data text-[10px] tracking-wide text-text-faint uppercase">
              {CATEGORY_LABELS[item.category]}
            </span>
          )}
          <span className="truncate text-sm font-medium text-text">{title}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-text-muted">{item.sender}</div>
        {metaLine && <div className="mt-1 font-data text-[11px] text-text-faint">{metaLine}</div>}

        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setOpenMode("idle");
              setExpanded(true);
            }}
            className="flex min-h-8 items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
          >
            Open
            <ChevronRight size={13} />
          </button>
          {showQuickReply && (
            <button
              type="button"
              onClick={() => {
                setOpenMode("reply");
                setExpanded(true);
              }}
              className="flex min-h-8 items-center text-xs font-medium text-accent hover:text-accent-strong"
            >
              Draft Reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
