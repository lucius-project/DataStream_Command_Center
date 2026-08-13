import type { NetTicketChange } from "@/lib/services/serviceDeskHealth";

// Exported for reuse by MorningBriefCard.tsx (Phase 11), which shows the
// same label for yesterday's net change — one label→text/color mapping.
export const LABEL_TEXT: Record<NetTicketChange["label"], string> = {
  GAINING_GROUND: "Gaining Ground",
  KEEPING_PACE: "Keeping Pace",
  LOSING_GROUND: "Losing Ground",
};

// Negative net (closing more than opening) is the healthy direction —
// see the spec's own worked example (31 created, 39 closed, net -8 =
// Gaining Ground). Colored and sized separately from the standard
// KpiTile shape since this needs to be "visually prominent," not just
// another tile in the grid.
export const LABEL_TEXT_CLASS: Record<NetTicketChange["label"], string> = {
  GAINING_GROUND: "text-status-ok",
  KEEPING_PACE: "text-status-warn",
  LOSING_GROUND: "text-status-critical",
};

export const LABEL_PILL_CLASS: Record<NetTicketChange["label"], string> = {
  GAINING_GROUND: "border-status-ok/40 bg-status-ok-dim text-status-ok",
  KEEPING_PACE: "border-status-warn/40 bg-status-warn-dim text-status-warn",
  LOSING_GROUND: "border-status-critical/40 bg-status-critical-dim text-status-critical",
};

export function NetTicketChangeTile({ net }: { net: NetTicketChange }) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-border bg-panel p-4">
      <div className="font-data text-[10px] tracking-wide text-text-faint uppercase">Net Ticket Change — Today</div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className={`font-display text-3xl font-semibold ${LABEL_TEXT_CLASS[net.label]}`}>
          {net.net >= 0 ? "+" : ""}
          {net.net}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 font-data text-[10px] font-semibold tracking-wide uppercase ${LABEL_PILL_CLASS[net.label]}`}
        >
          {LABEL_TEXT[net.label]}
        </span>
      </div>
      <div className="mt-2 font-data text-xs text-text-faint">
        {net.createdToday} created · {net.closedToday} closed today
      </div>
    </div>
  );
}
