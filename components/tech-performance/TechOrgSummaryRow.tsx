import type { TechOrgSummary } from "@/lib/services/techPerformance";
import { Stat, GroupLabel, DailyHoursBars } from "./shared";
import { InfoButton } from "@/components/shared/InfoButton";

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
//
// `bordered` defaults to true (its own self-contained card + "Team
// detail" label + InfoButton) for Huddle Mode's "Technician Workload"
// section, which has nothing else supplying that framing. The main
// /tech-performance page instead nests this inside its own "Team
// Details" panel (styled like Summary's card) alongside the team
// utilization KPI and comparison table, so passing bordered={false}
// there drops this component's own border/label to avoid a nested box
// with a duplicate heading — the outer panel already provides both.
//
// `showTickets`/`showCalls` default to true for the same reason
// (Huddle Mode still wants the full row). The main page's Team Details
// section now sets both false since those counts moved into their own
// dedicated Ticket Details / Phone Details sections — this component
// keeps just the hours/pace row there, which has nowhere else to go.
export function TechOrgSummaryRow({
  org,
  todayIndex,
  bordered = true,
  showTickets = true,
  showCalls = true,
}: {
  org: TechOrgSummary;
  todayIndex: number;
  bordered?: boolean;
  showTickets?: boolean;
  showCalls?: boolean;
}) {
  const body = (
    <>
      {bordered ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span className="font-display text-sm font-medium text-text-muted">Team detail</span>
            <InfoButton
              title="Team Detail"
              what="Supplementary counts underneath the Org KPI strip above — the exact tickets, hours, and calls behind those tiles' headline numbers, for the whole team (not attributed to individual technicians)."
              meaning={`${org.loggedHours}h logged of ${org.expectedHours}h expected this week.`}
              calculation="Hours are summed across every technician's logged time entries this week. Missed-call count and pickup rate are shown here (not on an individual tech's row) because a hunt-group ring can't be reliably attributed to the one technician who 'should' have answered it — it's a whole-team fact."
            />
          </span>
          <span className="font-data text-xs text-text-faint">
            {org.loggedHours}h / {org.expectedHours}h logged this week
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-end">
          <span className="font-data text-xs text-text-faint">
            {org.loggedHours}h / {org.expectedHours}h logged this week
          </span>
        </div>
      )}

      <DailyHoursBars dailyHours={org.dailyHours} todayIndex={todayIndex} indent={false} />

      {(showTickets || showCalls) && (
        <div className="mt-3 grid grid-cols-2 gap-4 border-t border-border pt-3">
          {showTickets && (
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
          )}
          {showCalls && (
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
          )}
        </div>
      )}
    </>
  );

  if (!bordered) return body;
  return <div className="rounded-lg border border-border bg-panel-raised p-4">{body}</div>;
}
