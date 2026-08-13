import Link from "next/link";
import type { SlaAtRiskTicket } from "@/lib/services/serviceDeskHealth";
import { PriorityBadge } from "@/components/operations/PriorityBadge";
import { InfoButton } from "@/components/shared/InfoButton";
import { formatDuration } from "@/lib/dateUtils";

const SLA_TYPE_LABEL: Record<SlaAtRiskTicket["slaType"], string> = {
  response: "Response",
  resolution: "Resolution",
};

function riskText(t: SlaAtRiskTicket): { text: string; className: string } {
  const label = SLA_TYPE_LABEL[t.slaType];
  const duration = formatDuration(Math.abs(t.minutesRemaining));
  if (t.minutesRemaining < 0) {
    return { text: `${label} SLA breached ${duration} ago`, className: "text-status-critical" };
  }
  if (t.minutesRemaining <= 60) {
    return { text: `${label} SLA: ${duration} remaining`, className: "text-status-warn" };
  }
  return { text: `${label} SLA: ${duration} remaining`, className: "text-text" };
}

// Real-time countdown list — every ticket with a response or resolution
// deadline inside the at-risk window (see getSlaAtRiskTickets in
// serviceDeskHealth.ts), including ones already past due so a manager
// sees a breach the instant it happens, not just the approach to it.
export function SlaAtRiskSection({ tickets }: { tickets: SlaAtRiskTicket[] }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5">
        <h2 className="font-display text-sm font-medium text-text-muted">SLA At Risk</h2>
        <InfoButton
          title="SLA At Risk"
          what="Individual tickets whose response or resolution deadline is coming up soon (or already passed), so a manager knows exactly which ticket to chase next — distinct from the Response/Resolution SLA percentages above, which are aggregates."
          meaning={`${tickets.length} ticket${tickets.length === 1 ? "" : "s"} currently in the risk window.`}
          calculation="A ticket appears here if its response or resolution deadline (HaloPSA's own respond-by/fix-by dates) falls within 4 hours from now, or has already passed within the last 24 hours. A ticket can appear twice if both deadlines fall in the window — that's two genuinely different countdowns, not a duplicate. Breaches older than 24 hours are chronic-neglect problems already surfaced elsewhere (Needs Attention / stale tickets), not shown here."
        />
      </span>
      {tickets.length === 0 ? (
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          No tickets inside the SLA risk window.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => {
            const risk = riskText(t);
            return (
              <Link
                key={`${t.id}-${t.slaType}`}
                href="/operations"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-panel p-3 hover:border-accent"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <span className="font-data text-xs text-text">{t.haloTicketId}</span>
                    <span className="text-sm text-text">{t.clientName ?? "Unresolved client"}</span>
                    <span className="text-xs text-text-faint">Assigned: {t.assignedTech}</span>
                  </div>
                  <span className="truncate text-xs text-text-muted">{t.summary}</span>
                </div>
                <span className={`shrink-0 font-data text-xs font-medium ${risk.className}`}>{risk.text}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
