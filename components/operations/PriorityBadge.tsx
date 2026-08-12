const STYLES: Record<string, string> = {
  P1: "bg-status-critical-dim text-status-critical border-status-critical/40",
  P2: "bg-status-warn-dim text-status-warn border-status-warn/40",
  P3: "bg-status-info-dim text-status-info border-status-info/40",
  P4: "bg-panel-raised text-text-faint border-border-strong",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-data text-[11px] font-semibold tracking-wide ${
        STYLES[priority] ?? STYLES.P4
      }`}
    >
      {priority}
    </span>
  );
}
