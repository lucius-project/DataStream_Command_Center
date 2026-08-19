import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/roleRank";
import { getDevices, getDeviceHealthSummary } from "@/lib/services/deviceHealth";
import { getRemoteSessionAnalytics } from "@/lib/services/remoteSessions";
import { getNinjaRmmConnectionInfo } from "@/lib/services/integrations";
import { DeviceRow } from "@/components/devices/DeviceRow";
import { RemoteSupportPanel } from "@/components/devices/RemoteSupportPanel";
import { BackgroundSync } from "@/components/shared/BackgroundSync";

export default async function DeviceHealthPage() {
  await requireRole("SERVICE_MANAGER");
  // No NinjaRMM calls on this render — those moved to
  // app/api/devices/sync/route.ts, fired by <BackgroundSync> right after
  // the page paints from whatever's already in the database.
  const [syncStatus, devices, summary, connectionInfo, remoteAnalytics] = await Promise.all([
    prisma.syncStatus.findUnique({ where: { id: "deviceHealth" } }),
    getDevices(),
    getDeviceHealthSummary(),
    getNinjaRmmConnectionInfo(),
    getRemoteSessionAnalytics(),
  ]);
  // Kept as two separately-toned lines (device sync = critical, remote
  // session sync = warn, same as before) by reading the label the route
  // prefixed each error with, rather than collapsing to one flat banner.
  const syncErrors = syncStatus?.lastError ? syncStatus.lastError.split(" · ") : [];
  const deviceSyncErrors = syncErrors.filter((e) => e.startsWith("NinjaRMM:"));
  const remoteSyncErrors = syncErrors.filter((e) => e.startsWith("Remote sessions:"));

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Device Health</h1>
          <p className="mt-1 text-sm text-text-muted">
            Managed devices from NinjaRMM, online status and last contact.
          </p>
        </div>
        <BackgroundSync
          syncPath="/api/devices/sync"
          lastSyncedAt={syncStatus?.lastSyncedAt?.toISOString() ?? null}
          hadLastError={Boolean(syncStatus?.lastError)}
        />
      </div>

      {deviceSyncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-1 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          {deviceSyncErrors.map((error, i) => (
            <div key={i}>Sync failed, showing the last synced data: {error}</div>
          ))}
        </div>
      )}

      {remoteSyncErrors.length > 0 && (
        <div className="mt-4 flex flex-col gap-1 rounded-md border border-status-warn/40 bg-status-warn-dim px-4 py-3 text-sm text-status-warn">
          {remoteSyncErrors.map((error, i) => (
            <div key={i}>Sync failed, showing the last synced data: {error}</div>
          ))}
        </div>
      )}

      {devices.length > 0 && <RemoteSupportPanel analytics={remoteAnalytics} />}

      {devices.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-4 rounded-lg border border-border bg-panel p-4">
          <div>
            <div className="font-display text-xl font-semibold text-text">{summary.total}</div>
            <div className="font-data text-[11px] text-text-faint">devices</div>
          </div>
          <div>
            <div className="font-display text-xl font-semibold text-status-ok">{summary.online}</div>
            <div className="font-data text-[11px] text-text-faint">online</div>
          </div>
          <div>
            <div
              className={`font-display text-xl font-semibold ${summary.offline > 0 ? "text-status-critical" : "text-text"}`}
            >
              {summary.offline}
            </div>
            <div className="font-data text-[11px] text-text-faint">offline</div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {devices.map((device) => (
          <DeviceRow key={device.id} device={device} />
        ))}

        {devices.length === 0 && deviceSyncErrors.length === 0 && (
          <div className="rounded-lg border border-border bg-panel p-6 text-center text-sm text-text-muted">
            {connectionInfo.connected
              ? "No devices synced yet."
              : "Not connected yet. Connect NinjaRMM on the Integrations page to start syncing device health."}
          </div>
        )}
      </div>
    </div>
  );
}
