import type { ManagerAlert } from "@/lib/services/managerAlerts";
import { InfoButton } from "@/components/shared/InfoButton";
import { FocusTable } from "./FocusTable";
import { alertFocusItems } from "@/lib/services/techFocus";

// Level 2 of the /tech-performance rebuild — immediately below Service
// Desk Health. One flat table, highest priority to lowest (the same
// order generateManagerAlerts's own sortAlerts already produced —
// customer impact, then severity, then SLA risk, then ticket priority,
// then age — this component doesn't re-sort, just renders it), same
// spreadsheet look as Huddle Mode's per-tech tables (FocusTable, shared
// with TechFocusSection.tsx and SlaAtRiskSection.tsx) rather than a
// severity-grouped card grid. "SLA approaching" alerts are excluded
// here via alertFocusItems (same dedup Huddle Mode already relies on) —
// SLA At Risk right below already shows those tickets with a real
// countdown, so repeating them here would just be the same fact twice.
export function NeedsAttentionSection({ alerts, knownTechs }: { alerts: ManagerAlert[]; knownTechs: readonly string[] }) {
  const items = alertFocusItems(alerts, knownTechs);

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5">
        <h2 className="font-display text-sm font-medium text-text-muted">Needs Attention</h2>
        <InfoButton
          title="Needs Attention"
          what="The most severe items across the whole desk right now — the same source list as the full Manager Action Queue below, in one flat table sorted worst first."
          meaning={`${items.length} item${items.length === 1 ? "" : "s"} currently flagged, highest priority to lowest. SLA-approaching tickets are shown in the SLA At Risk section below instead of repeated here.`}
          calculation="Generated from a fixed set of rule-based checks (not AI): unattended P1/P2 tickets, unassigned priority tickets, missed calls not returned, stale tickets, technician overload, growing backlog, excessive on-hold tickets, missing time entries, client ticket spikes, declining phone answer rate, no-charge tickets not marked Low priority, and utilization outside the expected range. Order is customer impact, then severity, then SLA risk, then ticket priority, then age. Every row links directly to the ticket, call, or technician it's about."
        />
      </span>
      {items.length === 0 ? (
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          Nothing needs attention right now.
        </div>
      ) : (
        <FocusTable items={items} />
      )}
    </div>
  );
}
