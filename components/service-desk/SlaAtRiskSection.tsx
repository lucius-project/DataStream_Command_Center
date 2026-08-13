import type { SlaAtRiskTicket } from "@/lib/services/serviceDeskHealth";
import { InfoButton } from "@/components/shared/InfoButton";
import { FocusTable } from "./FocusTable";
import { slaFocusItems } from "@/lib/services/techFocus";

// Real-time countdown list — every ticket with a response or resolution
// deadline inside the at-risk window (see getSlaAtRiskTickets in
// serviceDeskHealth.ts), including ones already past due so a manager
// sees a breach the instant it happens, not just the approach to it.
// Rendered as one flat table via the shared FocusTable (same spreadsheet
// look as Huddle Mode's per-tech tables and Needs Attention above) —
// getSlaAtRiskTickets already returns tickets sorted by minutesRemaining
// ascending, which is already worst-breach-first, so slaFocusItems
// (which preserves input order) needs no re-sort here.
export function SlaAtRiskSection({
  tickets,
  knownTechs,
  instanceUrl,
}: {
  tickets: SlaAtRiskTicket[];
  knownTechs: readonly string[];
  instanceUrl: string | null;
}) {
  const items = slaFocusItems(tickets, knownTechs, instanceUrl);

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5">
        <h2 className="font-display text-sm font-medium text-text-muted">SLA At Risk</h2>
        <InfoButton
          title="SLA At Risk"
          what="Individual tickets whose response or resolution deadline is coming up soon (or already passed), so a manager knows exactly which ticket to chase next — distinct from the Response/Resolution SLA percentages above, which are aggregates."
          meaning={`${items.length} ticket${items.length === 1 ? "" : "s"} currently in the risk window, most overdue first.`}
          calculation="A ticket appears here if its response or resolution deadline (HaloPSA's own respond-by/fix-by dates) falls within 4 hours from now, or has already passed within the last 24 hours. A ticket can appear twice if both deadlines fall in the window — that's two genuinely different countdowns, not a duplicate. Breaches older than 24 hours are chronic-neglect problems already surfaced elsewhere (Needs Attention / stale tickets), not shown here."
        />
      </span>
      {items.length === 0 ? (
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          No tickets inside the SLA risk window.
        </div>
      ) : (
        <FocusTable items={items} />
      )}
    </div>
  );
}
