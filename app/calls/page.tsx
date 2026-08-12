import { syncCallActivity } from "@/lib/integrations/unitedCloud";
import { getHaloDirectory } from "@/lib/integrations/haloDirectory";
import { getRecentCalls, getCallActivitySummary, attachCompanyNames } from "@/lib/services/callActivity";
import { getUnitedCloudCredentialStatus } from "@/lib/services/integrations";
import { CallRow } from "@/components/calls/CallRow";

export default async function CallActivityPage() {
  const sync = await syncCallActivity();
  const [rawCalls, summary, credentialStatus, directoryResult] = await Promise.all([
    getRecentCalls(),
    getCallActivitySummary(),
    getUnitedCloudCredentialStatus(),
    // Company lookup is a separate HaloPSA read from the call sync above —
    // a failure here (HaloPSA down, not connected) shouldn't block the
    // calls themselves from showing, just leave companyName unresolved.
    getHaloDirectory()
      .then((directory) => ({ directory, error: undefined as string | undefined }))
      .catch((err) => ({ directory: null, error: err instanceof Error ? err.message : "HaloPSA lookup failed." })),
  ]);
  const calls = attachCompanyNames(rawCalls, directoryResult.directory);

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Call Activity</h1>
      <p className="mt-1 text-sm text-text-muted">
        Recent calls from United Cloud, last 7 days synced.
      </p>

      {sync.error && (
        <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          United Cloud sync failed, showing the last synced data: {sync.error}
        </div>
      )}

      {directoryResult.error && (
        <div className="mt-4 rounded-md border border-status-warn/40 bg-status-warn-dim px-4 py-3 text-sm text-status-warn">
          Company lookup failed, showing numbers instead: {directoryResult.error}
        </div>
      )}

      {calls.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-4 rounded-lg border border-border bg-panel p-4">
          <div>
            <div className="font-display text-xl font-semibold text-text">{summary.totalToday}</div>
            <div className="font-data text-[11px] text-text-faint">calls today</div>
          </div>
          <div>
            <div
              className={`font-display text-xl font-semibold ${summary.missedToday > 0 ? "text-status-critical" : "text-text"}`}
            >
              {summary.missedToday}
            </div>
            <div className="font-data text-[11px] text-text-faint">missed today</div>
          </div>
          <div>
            <div className="font-display text-xl font-semibold text-text">
              {Math.round(summary.avgDurationSeconds / 60)}m
            </div>
            <div className="font-data text-[11px] text-text-faint">avg duration today</div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {calls.map((call) => (
          <CallRow key={call.id} call={call} />
        ))}

        {calls.length === 0 && !sync.error && (
          <div className="rounded-lg border border-border bg-panel p-6 text-center text-sm text-text-muted">
            {credentialStatus.configured
              ? "No calls synced in the last 7 days."
              : "Not connected yet. Add your United Cloud API key on the Integrations page to start syncing call activity."}
          </div>
        )}
      </div>
    </div>
  );
}
