import type { BacklogBreakdown } from "@/lib/services/operations";
import { InfoButton } from "@/components/shared/InfoButton";

function Row({ label, value, tone }: { label: string; value: number; tone?: "warn" | "critical" }) {
  const toneClass = tone === "critical" ? "text-status-critical" : tone === "warn" ? "text-status-warn" : "text-text";
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={toneClass}>{value}</span>
    </div>
  );
}

// Same status strings HaloPSA returns, bucketed by who owns the next
// action (see classifyResponsibility in operations.ts) — a ticket
// waiting on the customer or a vendor isn't a technician workload
// problem, so it's shown here for visibility without being folded into
// "aging" alerts (see TechActionableAging, computed separately).
export function BacklogBreakdownPanel({ backlog, staleCount }: { backlog: BacklogBreakdown; staleCount: number }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1">
          <span className="font-display text-sm font-medium text-text">Backlog Health</span>
          <InfoButton
            title="Backlog Health"
            what="Every currently open ticket, broken down by who owns the next action on it — not just a raw open count."
            meaning={`${backlog.total} tickets open right now: ${backlog.waitingTechnician} waiting on a technician, ${backlog.waitingCustomer} waiting on the customer, ${backlog.waitingVendor} waiting on a vendor, ${backlog.unassigned} unassigned, ${staleCount} stale (24h+ with no update).`}
            calculation="Each ticket is bucketed by its HaloPSA status into 'who's turn is it' (waiting technician / customer / vendor / scheduled / on hold / unassigned). A ticket waiting on the customer or a vendor isn't a technician workload problem, so it's shown here for visibility without being counted in Tech-Actionable Aging above. Stale means no update in 24+ hours, regardless of bucket."
          />
        </span>
        <span className="font-data text-xs text-text-faint">{backlog.total} total open</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 font-data text-[12px]">
        <Row label="Waiting technician" value={backlog.waitingTechnician} />
        <Row label="Waiting customer" value={backlog.waitingCustomer} />
        <Row label="Waiting vendor" value={backlog.waitingVendor} />
        <Row label="Scheduled" value={backlog.scheduled} />
        <Row label="On hold" value={backlog.onHold} />
        <Row label="Unassigned" value={backlog.unassigned} tone={backlog.unassigned > 0 ? "warn" : undefined} />
        <Row label="Stale (24h+, no update)" value={staleCount} tone={staleCount > 0 ? "warn" : undefined} />
        {backlog.unknown > 0 && <Row label="Unclassified status" value={backlog.unknown} />}
      </div>
    </div>
  );
}
