import type { TechOrgSummary } from "@/lib/services/techPerformance";
import { Stat, GroupLabel, DailyHoursBars } from "./shared";

// Supplementary detail below the KPI strip (see OrgKpiStrip) — the
// headline "is the team healthy" signal already lives in the three KPI
// tiles, so this row is deliberately quieter (muted panel, no status
// pill) and exists for the exact counts underneath those tiles.
//
// This is also the one place missed-call count / pickup rate still
// appear on this page — see the TechOrgSummary comment in
// techPerformance.ts for why they're valid here (a whole-team fact) but
// not on an individual tech's row (a guess about who should have
// answered a hunt-group ring).
export function TechOrgSummaryRow({ org, todayIndex }: { org: TechOrgSummary; todayIndex: number }) {
  return (
    <div className="rounded-lg border border-border bg-panel-raised p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-medium text-text-muted">Team detail</span>
        <span className="font-data text-xs text-text-faint">
          {org.loggedHours}h / {org.expectedHours}h logged this week
        </span>
      </div>

      <DailyHoursBars dailyHours={org.dailyHours} todayIndex={todayIndex} indent={false} />

      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-border pt-3">
        <div>
          <GroupLabel>Tickets</GroupLabel>
          <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={org.openCount} label="open" />
              <Stat value={org.p1Count} label="P1" tone={org.p1Count > 0 ? "critical" : undefined} />
            </span>
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={org.agingCount} label="aging" tone={org.agingCount > 0 ? "warn" : undefined} />
              <Stat value={org.onHoldCount} label="on hold" />
            </span>
          </div>
        </div>
        <div>
          <GroupLabel>Calls</GroupLabel>
          <div className="mt-1 flex flex-col gap-0.5 font-data text-[11px]">
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={org.callsInbound} label="in" />
              <Stat value={org.callsOutbound} label="out" />
              <Stat value={org.callsMissed} label="missed" tone={org.callsMissed > 0 ? "warn" : undefined} />
            </span>
            <span className="flex flex-wrap gap-x-2.5">
              <Stat value={org.avgAnswerSeconds ?? "—"} label="avg ring (s)" />
              <Stat value={org.avgTalkMinutes} label="avg talk (min)" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
