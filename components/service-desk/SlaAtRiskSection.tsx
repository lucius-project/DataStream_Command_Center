import Link from "next/link";
import type { SlaAtRiskTicket } from "@/lib/services/serviceDeskHealth";
import { PriorityBadge } from "@/components/operations/PriorityBadge";

const SLA_TYPE_LABEL: Record<SlaAtRiskTicket["slaType"], string> = {
  response: "Response",
  resolution: "Resolution",
};

function riskText(t: SlaAtRiskTicket): { text: string; className: string } {
  const label = SLA_TYPE_LABEL[t.slaType];
  if (t.minutesRemaining < 0) {
    return { text: `${label} SLA breached ${Math.abs(t.minutesRemaining)} minutes ago`, className: "text-status-critical" };
  }
  if (t.minutesRemaining <= 60) {
    return { text: `${label} SLA: ${t.minutesRemaining} minutes remaining`, className: "text-status-warn" };
  }
  return { text: `${label} SLA: ${t.minutesRemaining} minutes remaining`, className: "text-text" };
}

// Real-time countdown list — every ticket with a response or resolution
// deadline inside the at-risk window (see getSlaAtRiskTickets in
// serviceDeskHealth.ts), including ones already past due so a manager
// sees a breach the instant it happens, not just the approach to it.
export function SlaAtRiskSection({ tickets }: { tickets: SlaAtRiskTicket[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-sm font-medium text-text-muted">SLA At Risk</h2>
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
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={t.priority} />
                  <span className="font-data text-xs text-text">{t.haloTicketId}</span>
                  <span className="text-sm text-text">{t.clientName ?? "Unresolved client"}</span>
                  <span className="text-xs text-text-faint">Assigned: {t.assignedTech}</span>
                </div>
                <span className={`font-data text-xs font-medium ${risk.className}`}>{risk.text}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
