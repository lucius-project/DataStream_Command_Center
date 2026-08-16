"use client";

import { useState } from "react";
import { Phone, Monitor, Ticket as TicketIcon } from "lucide-react";
import type { TimelineEntry, TimelineEntryType, MatchTier } from "@/lib/services/activityCorrelation";
import { Modal } from "@/components/shared/Modal";

// Same modal shell as DrilldownStat.tsx ("never create numbers the
// manager cannot investigate") — this is the richer, timeline-shaped
// sibling for Phase 9's per-tech cross-system feed, not a replacement.

const TYPE_ICON: Record<TimelineEntryType, typeof Phone> = {
  call: Phone,
  remote_session: Monitor,
  ticket: TicketIcon,
};

function timeLabel(at: Date): string {
  return at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

// HIGH/POSSIBLE get a color so a manager can scan for confident matches
// at a glance; UNMATCHED and ticket-only entries (no tier) stay neutral —
// an unmatched record is a data limitation, not a problem, same
// non-accusatory rule DrilldownStat's tone prop already follows.
function tierClass(tier?: MatchTier): string {
  if (tier === "HIGH") return "text-status-ok";
  if (tier === "POSSIBLE") return "text-status-warn";
  return "text-text-faint";
}

export function ActivityTimelineModal({ techLabel, entries }: { techLabel: string; entries: TimelineEntry[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-border-strong px-2 py-1 font-data text-[11px] text-text-muted hover:border-accent hover:text-text"
      >
        Activity Timeline
      </button>

      {open && (
        <Modal title={`${techLabel} — Activity Timeline (this week)`} onClose={() => setOpen(false)} maxWidthClassName="max-w-lg">
          <p className="text-[11px] text-text-faint">
            HaloPSA tickets, United Cloud calls, and NinjaOne remote sessions merged by time. Ticket matches are
            inferred from tech/client/timing signals only — never confirmed.
          </p>
          <div className="flex flex-col gap-1.5 overflow-y-auto font-data text-xs">
            {entries.length === 0 ? (
              <div className="text-text-muted">No activity recorded this week.</div>
            ) : (
              entries.map((e) => {
                const Icon = TYPE_ICON[e.type];
                return (
                  <div key={e.id} className="flex items-start gap-2 rounded-md border border-border bg-panel-raised p-2.5">
                    <Icon size={14} className="mt-0.5 shrink-0 text-text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-text">{e.primary}</span>
                        <span className="text-text-faint">{timeLabel(e.at)}</span>
                      </div>
                      {e.secondary && <div className="text-[11px] text-text-faint">{e.secondary}</div>}
                      {e.tertiary && <div className={`mt-0.5 text-[11px] ${tierClass(e.tier)}`}>{e.tertiary}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
