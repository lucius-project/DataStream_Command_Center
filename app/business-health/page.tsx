import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/roleRank";
import { getBusinessHealthSnapshot } from "@/lib/services/businessHealth";
import { getAnthropicCredentialStatus } from "@/lib/services/integrations";
import { HealthGrid } from "@/components/business-health/HealthGrid";
import { ActionList } from "@/components/business-health/ActionList";
import { LockedStrip } from "@/components/business-health/LockedStrip";
import { HealthChat } from "@/components/business-health/HealthChat";
import { BackgroundSync } from "@/components/shared/BackgroundSync";

// Deliberately does NOT sync ClientFinancials/SeatReconciliation (seat
// reconciliation is still a per-client NinjaRMM fan-out; financials
// itself is now a fixed 3-query batch, but there's no reason for this
// page to duplicate a sync /clients already runs) or
// backfillClientMonthlyHours (explicit user-triggered action). This page
// reads whatever ClientFinancials/SeatReconciliation rows already exist
// from prior /clients visits — see lib/services/businessHealth.ts's
// "unavailable" coverage handling.
//
// No HaloPSA/NinjaOne/United Cloud calls happen on this render — those
// moved to app/api/business-health/sync/route.ts, fired by
// <BackgroundSync> right after the page paints from whatever's already
// in the database. See SyncStatus's schema comment.
export default async function BusinessHealthPage() {
  await requireRole("SERVICE_MANAGER");
  const [syncStatus, snapshot, anthropicStatus] = await Promise.all([
    prisma.syncStatus.findUnique({ where: { id: "businessHealth" } }),
    getBusinessHealthSnapshot(),
    getAnthropicCredentialStatus(),
  ]);
  const syncErrors = syncStatus?.lastError ? syncStatus.lastError.split(" · ") : [];

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Business Health</h1>
          <p className="mt-1 text-sm text-text-muted">Everything that needs your attention, at a glance.</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1 text-right font-data text-[11px] text-text-faint">
          <BackgroundSync
            syncPath="/api/business-health/sync"
            lastSyncedAt={syncStatus?.lastSyncedAt?.toISOString() ?? null}
            hadLastError={Boolean(syncStatus?.lastError)}
          />
          <span>
            as of {snapshot.generatedAt.toLocaleTimeString()}
            <br />
            {snapshot.coverage.clientsWithFinancials} of {snapshot.coverage.clientsTotal} clients financials-synced
          </span>
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
