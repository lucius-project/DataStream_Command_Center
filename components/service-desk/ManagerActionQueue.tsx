"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AlertSeverity, ManagerAlert } from "@/lib/services/managerAlerts";
import { InfoButton } from "@/components/shared/InfoButton";

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  CRITICAL: "Critical",
  WARNING: "Warning",
  MONITOR: "Monitor",
};

const SEVERITY_TEXT: Record<AlertSeverity, string> = {
  CRITICAL: "text-status-critical",
  WARNING: "text-status-warn",
  MONITOR: "text-status-info",
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, MONITOR: 2 };

type SortKey = "severity" | "client" | "technician" | "age";
type SortState = { key: SortKey; dir: 1 | -1 } | null;

function formatAge(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function compareAlerts(a: ManagerAlert, b: ManagerAlert, sort: NonNullable<SortState>): number {
  let cmp = 0;
  if (sort.key === "severity") cmp = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  else if (sort.key === "client") cmp = (a.client ?? "").localeCompare(b.client ?? "");
  else if (sort.key === "technician") cmp = (a.technician ?? "").localeCompare(b.technician ?? "");
  else if (sort.key === "age") cmp = (a.ageMinutes ?? -1) - (b.ageMinutes ?? -1);
  return cmp * sort.dir;
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  first,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  // Every other column gets its left breathing room from the previous
  // column's pr-3 — the leading column (Severity) has nothing before it
  // and needs its own pl-3, same convention FocusTable.tsx's first
  // column already uses.
  first?: boolean;
}) {
  const active = sort?.key === sortKey;
  const ariaSort = active ? (sort!.dir === 1 ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={`py-1.5 pr-3 font-normal ${first ? "pl-3" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 hover:text-text ${active ? "text-text" : ""}`}
      >
        {label}
        {active && <span className="text-[10px]">{sort!.dir === 1 ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

// Level 3 — the same ManagerAlert[] feed as Needs Attention, flattened
// into one sortable table. Default order is the engine's own priority
// sort (customer impact -> severity -> SLA risk -> priority -> age);
// clicking a header re-sorts by that column only.
export function ManagerActionQueue({ alerts }: { alerts: ManagerAlert[] }) {
  const [sort, setSort] = useState<SortState>(null);

  const rows = useMemo(() => {
    if (!sort) return alerts;
    return [...alerts].sort((a, b) => compareAlerts(a, b, sort));
  }, [alerts, sort]);

  function onSort(key: SortKey) {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5">
        <h2 className="font-display text-sm font-medium text-text-muted">Manager Action Queue</h2>
        <InfoButton
          title="Manager Action Queue"
          what="Every currently-flagged item across the whole desk — the full, sortable version of the Needs Attention cards above, for working through the list methodically rather than just seeing the top few."
          meaning={`${alerts.length} item${alerts.length === 1 ? "" : "s"} currently in the queue. Click a column header to sort.`}
          calculation="Same rule-based checks as Needs Attention (not AI): unattended P1/P2s, unassigned priority tickets, missed calls not returned, SLA-approaching tickets, stale tickets, technician overload, growing backlog, excessive on-hold, missing time entries, client ticket spikes, declining phone answer rate, utilization outside range. Default order is customer impact, then severity, then SLA risk, then priority, then age."
        />
      </span>
      {alerts.length === 0 ? (
        <div className="rounded-md border border-border bg-panel-raised p-4 text-center text-sm text-text-muted">
          Nothing in the action queue right now.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-panel">
          <table className="w-full min-w-[900px] text-left font-data text-xs">
            <caption className="sr-only">
              Manager action queue, {alerts.length} item{alerts.length === 1 ? "" : "s"}, sortable by column
            </caption>
            <thead>
              <tr className="border-b border-border text-text-muted">
                <SortableHeader label="Severity" sortKey="severity" sort={sort} onSort={onSort} first />
                <th scope="col" className="py-1.5 pr-3 font-normal">
                  Issue
                </th>
                <SortableHeader label="Client" sortKey="client" sort={sort} onSort={onSort} />
                <th scope="col" className="py-1.5 pr-3 font-normal">
                  Ticket / Call
                </th>
                <SortableHeader label="Technician" sortKey="technician" sort={sort} onSort={onSort} />
                <SortableHeader label="Age" sortKey="age" sort={sort} onSort={onSort} />
                <th scope="col" className="py-1.5 pr-3 font-normal">
                  SLA Risk
                </th>
                <th scope="col" className="py-1.5 pr-3 font-normal">
                  Recommended Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-border text-text">
                  <td className="py-1.5 pr-3 pl-3">
                    <span className={`font-semibold ${SEVERITY_TEXT[a.severity]}`}>{SEVERITY_LABEL[a.severity]}</span>
                  </td>
                  <td className="max-w-[280px] py-1.5 pr-3 text-text">{a.issue}</td>
                  <td className="py-1.5 pr-3 text-text-muted">{a.client ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    <Link href={a.href} className="text-accent hover:underline">
                      {a.reference}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 text-text-muted">{a.technician ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-text-muted">{formatAge(a.ageMinutes)}</td>
                  <td className="py-1.5 pr-3 text-text-muted">{a.slaRisk ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-text-muted">{a.recommendedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
