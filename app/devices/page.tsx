import { syncDevices } from "@/lib/integrations/ninjaRmm";
import { getDevices, getDeviceHealthSummary } from "@/lib/services/deviceHealth";
import { getNinjaRmmConnectionInfo } from "@/lib/services/integrations";
import { DeviceRow } from "@/components/devices/DeviceRow";

export default async function DeviceHealthPage() {
  const sync = await syncDevices();
  const [devices, summary, connectionInfo] = await Promise.all([
    getDevices(),
    getDeviceHealthSummary(),
    getNinjaRmmConnectionInfo(),
  ]);

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Device Health</h1>
      <p className="mt-1 text-sm text-text-muted">
        Managed devices from NinjaRMM, online status and last contact.
      </p>

      {sync.error && (
        <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          NinjaRMM sync failed, showing the last synced data: {sync.error}
        </div>
      )}

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

        {devices.length === 0 && !sync.error && (
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
