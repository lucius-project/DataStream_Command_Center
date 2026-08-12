import { syncTicketsFromHalo, syncTeamTimeGaps } from "@/lib/integrations/halopsa";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";
import { getHaloDirectory } from "@/lib/integrations/haloDirectory";
import { getTechPerformance } from "@/lib/services/techPerformance";
import { TechPerformanceCard } from "@/components/tech-performance/TechPerformanceCard";

export default async function TechPerformancePage() {
  const [ticketSync, timeGapSync, callSync] = await Promise.all([
    syncTicketsFromHalo(),
    syncTeamTimeGaps(),
    syncCallActivity(),
  ]);
  const directory = await getHaloDirectory().catch(() => null);
  const techs = await getTechPerformance(directory);
  const syncErrors = [
    ticketSync.error && `HaloPSA: ${ticketSync.error}`,
    timeGapSync.error && `HaloPSA: ${timeGapSync.error}`,
    callSync.error && `United Cloud: ${callSync.error}`,
  ].filter((e): e is string => Boolean(e));

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Tech Performance</h1>
      <p className="mt-1 text-sm text-text-muted">
        Hours logged versus expected, ticket load, call activity, and the weekly trend.
      </p>

      {syncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {syncErrors.map((error, i) => (
            <div key={i}>Sync failed, showing the last synced data — {error}</div>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {techs.map((tech) => (
          <TechPerformanceCard key={tech.person} tech={tech} />
        ))}
      </div>
    </div>
  );
}
