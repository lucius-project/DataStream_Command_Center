import Link from "next/link";
import { SlidersHorizontal, TrendingUp } from "lucide-react";
import { isConnected } from "@/lib/auth/msal";
import { requireRole } from "@/lib/auth/roleRank";
import { syncInboxFromGraph, getTriageQueue } from "@/lib/services/inbox";
import { TriageCard } from "@/components/inbox/TriageCard";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; connectError?: string }>;
}) {
  await requireRole("SERVICE_MANAGER");
  const params = await searchParams;
  const connected = await isConnected();

  let queue: Awaited<ReturnType<typeof getTriageQueue>> = [];
  let syncError: string | null = null;
  if (connected) {
    try {
      await syncInboxFromGraph();
      queue = await getTriageQueue();
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Failed to sync with Microsoft Graph.";
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Inbox Command</h1>
          <p className="mt-1 text-sm text-text-muted">One decision at a time.</p>
        </div>
        {connected && (
          <div className="flex gap-1.5">
            <Link
              href="/inbox/trends"
              className="flex h-11 w-11 items-center justify-center rounded-md border border-border-strong text-text-muted hover:text-text"
              aria-label="Inbox trends"
            >
              <TrendingUp size={18} />
            </Link>
            <Link
              href="/inbox/rules"
              className="flex h-11 w-11 items-center justify-center rounded-md border border-border-strong text-text-muted hover:text-text"
              aria-label="Noise rules"
            >
              <SlidersHorizontal size={18} />
            </Link>
          </div>
        )}
      </div>

      {params.connectError && (
        <div className="mt-4 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-3 text-sm text-status-critical">
          Sign-in failed: {params.connectError}
        </div>
      )}
      {params.connected && (
        <div className="mt-4 rounded-md border border-status-ok/40 bg-status-ok-dim px-4 py-3 text-sm text-status-ok">
          Microsoft 365 connected.
        </div>
      )}

      {!connected && (
        <div className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-border bg-panel p-5">
          <p className="text-sm text-text-muted">
            Not connected yet. Sign in with your DataStream Microsoft 365 account to pull
            unread and flagged mail into triage.
          </p>
          <a
            href="/api/auth/microsoft/login"
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-2 font-display text-sm font-medium text-bg hover:bg-accent-strong"
          >
            Connect Microsoft 365
          </a>
        </div>
      )}

      {connected && syncError && (
        <div className="mt-6 rounded-lg border border-status-critical/40 bg-status-critical-dim p-5 text-sm text-status-critical">
          {syncError}
        </div>
      )}

      {connected && !syncError && (
        <div className="mt-6">
          <div className="mb-3 font-data text-xs text-text-faint">
            {queue.length} {queue.length === 1 ? "item" : "items"} need a decision
          </div>
          {queue.length === 0 ? (
            <div className="rounded-lg border border-border bg-panel p-6 text-center text-sm text-text-muted">
              Inbox clear. Nothing needs a decision right now.
            </div>
          ) : (
            <TriageCard item={queue[0]} />
          )}
        </div>
      )}
    </div>
  );
}
