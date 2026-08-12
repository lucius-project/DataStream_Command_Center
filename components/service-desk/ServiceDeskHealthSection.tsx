import { KpiTile } from "@/components/business-health/KpiTile";
import { LockedStrip } from "@/components/business-health/LockedStrip";
import type { ServiceDeskHealthSnapshot } from "@/lib/services/serviceDeskHealth";
import { getServiceDeskHealthKpis } from "@/lib/services/serviceDeskHealth";
import { HealthScoreTile } from "./HealthScoreTile";
import { NetTicketChangeTile } from "./NetTicketChangeTile";
import { BacklogBreakdownPanel } from "./BacklogBreakdownPanel";

// Confirmed genuinely unavailable, not just unbuilt — see the Phase 1-3
// discovery report. CSAT: HaloPSA's survey fields (surveyneeded/
// surveysent/thirdpartyreviewscore) are real but read false/-1 on every
// ticket sampled — surveys aren't turned on for this account. FTR:
// needs reassignment detection across a ticket's full Actions history,
// which is the expensive per-ticket fan-out this file's Response/
// Resolution SLA calculations were specifically designed to avoid —
// deferred to a later phase, not silently skipped.
const LOCKED_KPIS = [
  { label: "CSAT", blockedBy: "HaloPSA satisfaction surveys aren't enabled on this account (confirmed live — surveyneeded/surveysent read false on every ticket sampled)." },
  { label: "First Touch Resolution", blockedBy: "Needs reassignment history from HaloPSA's per-ticket Actions feed — deferred to a later phase to avoid the rate-limited fan-out this section was built to sidestep." },
];

// Level 1 of the /tech-performance rebuild — the answer to "what does
// the Service Desk Manager need to know right now," above everything
// else on the page (org KPI strip, per-tech cards).
export function ServiceDeskHealthSection({ snapshot }: { snapshot: ServiceDeskHealthSnapshot }) {
  const kpis = getServiceDeskHealthKpis(snapshot);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-sm font-medium text-text-muted">Service Desk Health</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="col-span-2">
          <HealthScoreTile result={snapshot.healthScore} />
        </div>
        <div className="col-span-2">
          <NetTicketChangeTile net={snapshot.netTicketChange} />
        </div>
        {kpis.slice(0, 2).map((kpi) => (
          <KpiTile key={kpi.key} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.slice(2).map((kpi) => (
          <KpiTile key={kpi.key} kpi={kpi} />
        ))}
        <div className="col-span-2">
          <BacklogBreakdownPanel backlog={snapshot.backlog} staleCount={snapshot.staleCount} />
        </div>
      </div>

      <LockedStrip locked={LOCKED_KPIS} />
    </div>
  );
}
