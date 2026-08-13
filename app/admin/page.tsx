import { getKpiSettings, getTechRoleConfigs } from "@/lib/services/kpiSettings";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import { HealthScoreWeightsForm } from "@/components/admin/HealthScoreWeightsForm";
import { TechScoreWeightsForm } from "@/components/admin/TechScoreWeightsForm";
import { TechRolesForm, type TechRoleRow } from "@/components/admin/TechRolesForm";
import { ThresholdsForm } from "@/components/admin/ThresholdsForm";

// Centralized KPI/Admin settings — Phase 12 of the /tech-performance
// rebuild. Every field editable here has a real caller reading it live
// (see lib/services/kpiSettings.ts and each section's own comments) —
// nothing on this page is decorative. Deliberately scoped: the
// technician roster itself, Business Hours/Timezone/Holiday Calendar,
// and Halo/United Cloud/NinjaOne ID-based identity mappings are real
// spec items but out of this phase (see the Phase 12 plan's own "explicit
// non-goals" section) — this page doesn't pretend to cover them.
export default async function AdminPage() {
  const [settings, techRoleConfigs] = await Promise.all([getKpiSettings(), getTechRoleConfigs(KNOWN_TECHS)]);

  const techRoleRows: TechRoleRow[] = KNOWN_TECHS.map((person: Tech) => {
    const config = techRoleConfigs.get(person)!;
    return { person, role: config.role, expectedWeeklyHours: config.expectedWeeklyHours };
  });

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Admin Settings</h1>
      <p className="mt-1 text-sm text-text-muted">
        Score weights, technician roles, and thresholds behind /tech-performance — every change here takes effect on
        the very next page load.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <section className="rounded-lg border border-border bg-panel p-4">
          <h2 className="mb-3 font-display text-sm font-medium text-text">Service Desk Health Score weights</h2>
          <HealthScoreWeightsForm settings={settings} />
        </section>

        <section className="rounded-lg border border-border bg-panel p-4">
          <h2 className="mb-3 font-display text-sm font-medium text-text">Technician Performance Score weights</h2>
          <TechScoreWeightsForm settings={settings} />
        </section>

        <section className="rounded-lg border border-border bg-panel p-4">
          <h2 className="mb-3 font-display text-sm font-medium text-text">Technician roles &amp; expected hours</h2>
          <TechRolesForm rows={techRoleRows} />
        </section>

        <section className="rounded-lg border border-border bg-panel p-4">
          <h2 className="mb-3 font-display text-sm font-medium text-text">Thresholds &amp; sample sizes</h2>
          <ThresholdsForm settings={settings} />
        </section>
      </div>
    </div>
  );
}
