import { KpiTile } from "@/components/business-health/KpiTile";
import type { Kpi } from "@/lib/services/businessHealth";

// Reuses the exact same tile component as the Business Health cockpit —
// same red/yellow/green vocabulary, same "big number, colored, with a
// one-line why underneath" shape, so a CEO doesn't have to learn a
// second visual language just because they're on a different page.
export function OrgKpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiTile key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}
