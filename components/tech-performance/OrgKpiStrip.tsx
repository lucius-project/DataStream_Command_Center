import { KpiTile } from "@/components/business-health/KpiTile";
import type { Kpi } from "@/lib/services/businessHealth";
import { InfoButton } from "@/components/shared/InfoButton";
import { KPI_INFO_CONTENT } from "@/components/shared/kpiInfoContent";

// Reuses the exact same tile component as the Business Health cockpit —
// same red/yellow/green vocabulary, same "big number, colored, with a
// one-line why underneath" shape, so a CEO doesn't have to learn a
// second visual language just because they're on a different page.
export function OrgKpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((kpi) => {
        const info = KPI_INFO_CONTENT[kpi.key];
        return (
          <div key={kpi.key} className="group relative">
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
      })}
    </div>
  );
}
