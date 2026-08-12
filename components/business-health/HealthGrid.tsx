import { KpiTile } from "./KpiTile";
import type { Kpi } from "@/lib/services/businessHealth";

export function HealthGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiTile key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}
