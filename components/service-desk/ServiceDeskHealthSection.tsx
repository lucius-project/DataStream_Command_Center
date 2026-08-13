import { KpiTile } from "@/components/business-health/KpiTile";
import { LockedStrip } from "@/components/business-health/LockedStrip";
import type { ServiceDeskHealthSnapshot } from "@/lib/services/serviceDeskHealth";
import { getServiceDeskHealthKpis, getHealthScoreTrend } from "@/lib/services/serviceDeskHealth";
import type { ServiceDeskHealthDaily, KpiSettings } from "@/app/generated/prisma/client";
import { HealthScoreTile } from "./HealthScoreTile";
import { NetTicketChangeTile } from "./NetTicketChangeTile";
import { BacklogBreakdownPanel } from "./BacklogBreakdownPanel";
import { InfoButton } from "@/components/shared/InfoButton";
import { KPI_INFO_CONTENT } from "@/components/shared/kpiInfoContent";
import type { Kpi } from "@/lib/services/businessHealth";

// Wraps the shared KpiTile from the outside rather than modifying or
// duplicating it — components/business-health/KpiTile.tsx is also used
// by the separate Business Health page, which must stay untouched by
// this info-icon feature. Same "icon is a true sibling of the tile's
// main click target, not nested inside it" reasoning HealthScoreTile.tsx
// already established, just applied from the consumer side instead of
// inside the tile itself.
function KpiTileWithInfo({ kpi }: { kpi: Kpi }) {
  const info = KPI_INFO_CONTENT[kpi.key];
  return (
    <div className="group relative">
      <KpiTile kpi={kpi} />
      {info && (
        <InfoButton
          title={kpi.label}
          what={info.what}
          meaning={`Currently ${kpi.display} — ${kpi.detail}. ${kpi.benchmark}.`}
          calculation={info.calculation}
          className="absolute top-1.5 right-1.5"
        />
      )}
    </div>
  );
}

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
export function ServiceDeskHealthSection({
  snapshot,
  weekAgo,
  settings,
}: {
  snapshot: ServiceDeskHealthSnapshot;
  // ServiceDeskHealthDaily row from 7 days ago, or null before this
  // table has that much history yet (see its schema comment) — powers
  // every tile's "vs 7d ago" trend arrow, omitted (not faked) when null.
  weekAgo: ServiceDeskHealthDaily | null;
  // Admin-editable sample-size/window/threshold values (Phase 12) —
  // fetched once by the page and threaded down, same pattern as weekAgo.
  settings: KpiSettings;
}) {
  const kpis = getServiceDeskHealthKpis(snapshot, weekAgo, settings);
  const healthScoreTrend = getHealthScoreTrend(snapshot.healthScore, weekAgo);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-sm font-medium text-text-muted">Service Desk Health</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="col-span-2">
          <HealthScoreTile result={snapshot.healthScore} trend={healthScoreTrend} />
        </div>
        <div className="col-span-2">
          <NetTicketChangeTile net={snapshot.netTicketChange} />
        </div>
        {kpis.slice(0, 2).map((kpi) => (
          <KpiTileWithInfo key={kpi.key} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.slice(2).map((kpi) => (
          <KpiTileWithInfo key={kpi.key} kpi={kpi} />
        ))}
        <div className="col-span-2">
          <BacklogBreakdownPanel backlog={snapshot.backlog} staleCount={snapshot.staleCount} />
        </div>
      </div>

      <LockedStrip locked={LOCKED_KPIS} />
    </div>
  );
}
