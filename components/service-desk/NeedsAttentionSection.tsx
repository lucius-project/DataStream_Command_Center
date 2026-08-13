import Link from "next/link";
import type { AlertSeverity, ManagerAlert } from "@/lib/services/managerAlerts";
import { PriorityBadge } from "@/components/operations/PriorityBadge";
import { InfoButton } from "@/components/shared/InfoButton";

const SEVERITY_ORDER: AlertSeverity[] = ["CRITICAL", "WARNING", "MONITOR"];
const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, MONITOR: 2 };

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  CRITICAL: "Critical",
  WARNING: "Warning",
  MONITOR: "Monitor",
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  CRITICAL: "bg-status-critical",
  WARNING: "bg-status-warn",
  MONITOR: "bg-status-info",
};

const SEVERITY_TEXT: Record<AlertSeverity, string> = {
  CRITICAL: "text-status-critical",
  WARNING: "text-status-warn",
  MONITOR: "text-status-info",
};

function AlertCard({ alert, hideTechnician }: { alert: ManagerAlert; hideTechnician?: boolean }) {
  return (
    <Link
      href={alert.href}
      className="flex flex-col gap-1 rounded-lg border border-border bg-panel p-3 hover:border-accent"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-xs font-medium text-text-muted">{alert.category}</span>
        {alert.priority && <PriorityBadge priority={alert.priority} />}
      </div>
      <div className="text-sm text-text">{alert.issue}</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-data text-[11px] text-text-faint">
        {alert.client && <span>{alert.client}</span>}
        {!hideTechnician && alert.technician && <span>Assigned: {alert.technician}</span>}
        {alert.slaRisk && <span>{alert.slaRisk}</span>}
      </div>
      <div className="mt-1 text-[12px] text-text-muted">{alert.recommendedAction}</div>
    </Link>
  );
}

// Team-wide alerts (backlog growing, phone answer rate declining, etc.)
// have no single technician to check in with — grouped under this label,
// sorted after every named technician's group since a huddle works
// through people first.
const TEAM_WIDE_LABEL = "Team-wide";

function groupByTechnician(alerts: ManagerAlert[]) {
  const map = new Map<string, ManagerAlert[]>();
  for (const a of alerts) {
    const key = a.technician ?? TEAM_WIDE_LABEL;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return [...map.entries()]
    .map(([technician, items]) => ({
      technician,
      items,
      worstSeverityRank: Math.min(...items.map((i) => SEVERITY_RANK[i.severity])),
    }))
    .sort((a, b) => {
      const aTeamWide = a.technician === TEAM_WIDE_LABEL ? 1 : 0;
      const bTeamWide = b.technician === TEAM_WIDE_LABEL ? 1 : 0;
      if (aTeamWide !== bTeamWide) return aTeamWide - bTeamWide;
      if (a.worstSeverityRank !== b.worstSeverityRank) return a.worstSeverityRank - b.worstSeverityRank;
      return b.items.length - a.items.length;
    });
}

// Level 2 of the /tech-performance rebuild — immediately below Service
// Desk Health. Every card links to the ticket/call/tech it's about
// (see AlertCard's href) so "needs attention" is always one click from
// supporting evidence, never a bare claim.
//
// groupBy="technician" (Huddle Mode only) reshapes the same alert list
// by who to check in with instead of how severe it is — a morning huddle
// works through people, not a severity ranking, so grouping by
// technician there answers "what do I ask each person about" directly.
// The main /tech-performance page keeps the default severity grouping.
export function NeedsAttentionSection({ alerts, groupBy = "severity" }: { alerts: ManagerAlert[]; groupBy?: "severity" | "technician" }) {
  const bySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: alerts.filter((a) => a.severity === severity),
  }));
  const byTechnician = groupByTechnician(alerts);

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5">
        <h2 className="font-display text-sm font-medium text-text-muted">Needs Attention</h2>
        <InfoButton
          title="Needs Attention"
          what="The most severe items across the whole desk right now — the same source list as the full Manager Action Queue below, filtered to the ones worth an immediate look."
          meaning={`${alerts.length} item${alerts.length === 1 ? "" : "s"} currently flagged${groupBy === "technician" ? ", grouped by who to check in with" : ", sorted by customer impact then severity"}.`}
          calculation="Generated from a fixed set of rule-based checks (not AI): unattended P1/P2 tickets, unassigned priority tickets, missed calls not returned, tickets approaching or past their SLA deadline, stale tickets, technician overload, growing backlog, excessive on-hold tickets, missing time entries, client ticket spikes, declining phone answer rate, and utilization outside the expected range. Every card links directly to the ticket, call, or technician it's about."
        />
      </span>
      {alerts.length === 0 ? (
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          Nothing needs attention right now.
        </div>
      ) : groupBy === "technician" ? (
        byTechnician.map(({ technician, items, worstSeverityRank }) => (
          <div key={technician} className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[SEVERITY_ORDER[worstSeverityRank]]}`} />
              <span className="font-data text-[11px] font-semibold tracking-wide text-text uppercase">
                {technician} ({items.length})
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {items.map((a) => (
                <AlertCard key={a.id} alert={a} hideTechnician />
              ))}
            </div>
          </div>
        ))
      ) : (
        bySeverity.map(({ severity, items }) =>
          items.length === 0 ? null : (
            <div key={severity} className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
                <span className={`font-data text-[11px] font-semibold tracking-wide uppercase ${SEVERITY_TEXT[severity]}`}>
                  {SEVERITY_LABEL[severity]} ({items.length})
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {items.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            </div>
          ),
        )
      )}
    </div>
  );
}
