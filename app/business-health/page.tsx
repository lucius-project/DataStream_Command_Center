import { withComputeThrottle } from "@/lib/integrations/haloShared";
import { syncTicketsFromHalo, syncTeamTimeGaps } from "@/lib/integrations/halopsa";
import { syncDevices } from "@/lib/integrations/ninjaRmm";
import { syncCallActivity } from "@/lib/integrations/unitedCloud";
import { getBusinessHealthSnapshot } from "@/lib/services/businessHealth";
import { getAnthropicCredentialStatus } from "@/lib/services/integrations";
import { HealthGrid } from "@/components/business-health/HealthGrid";
import { ActionList } from "@/components/business-health/ActionList";
import { LockedStrip } from "@/components/business-health/LockedStrip";
import { HealthChat } from "@/components/business-health/HealthChat";

// Deliberately does NOT call syncClientFinancials/syncSeatReconciliation
// (per-client fan-out, N live QuickBooks/NinjaRMM calls per client) or
// backfillClientMonthlyHours (explicit user-triggered action). This page
// reads whatever ClientFinancials/SeatReconciliation rows already exist
// from prior /clients visits — see lib/services/businessHealth.ts's
// "unavailable" coverage handling. The syncs below are all either a fixed
// small cost or already internally throttled; bundling them under one more
// 60s throttle protects against this page — the new app home — being hit
// far more often than any single module page.
async function syncBundle(): Promise<string[]> {
  return withComputeThrottle("businessHealthSyncBundle", 60_000, async () => {
    const [tickets, timeGaps, devices, calls] = await Promise.all([
      syncTicketsFromHalo(),
      syncTeamTimeGaps(),
      syncDevices(),
      syncCallActivity(),
    ]);
    return [tickets.error, timeGaps.error, devices.error, calls.error].filter((e): e is string => Boolean(e));
  });
}

export default async function BusinessHealthPage() {
  const syncErrors = await syncBundle();
  const [snapshot, anthropicStatus] = await Promise.all([
    getBusinessHealthSnapshot(),
    getAnthropicCredentialStatus(),
  ]);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Business Health</h1>
          <p className="mt-1 text-sm text-text-muted">Everything that needs your attention, at a glance.</p>
        </div>
        <div className="shrink-0 text-right font-data text-[11px] text-text-faint">
          as of {snapshot.generatedAt.toLocaleTimeString()}
          <br />
          {snapshot.coverage.clientsWithFinancials} of {snapshot.coverage.clientsTotal} clients financials-synced
        </div>
      </div>

      {syncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-1 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {syncErrors.map((e, i) => (
            <div key={i}>Sync failed, showing the last synced data: {e}</div>
          ))}
        </div>
      )}

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col gap-3">
          <HealthGrid kpis={snapshot.kpis} />
          <ActionList actions={snapshot.actions} />
          <LockedStrip locked={snapshot.locked} />
        </div>

        <div className="min-h-[320px] lg:h-full lg:min-h-0">
          <HealthChat configured={anthropicStatus.configured} />
        </div>
      </div>
    </div>
  );
}
