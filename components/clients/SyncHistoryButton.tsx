"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";

export function SyncHistoryButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/clients/sync-history", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "History sync failed.");
      return;
    }
    const months: string[] = data.months ?? [];
    setResult(months.length > 0 ? `Synced ${months[0]} – ${months[months.length - 1]}` : "No billable history found.");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-md border border-border-strong bg-panel-raised px-3 py-2 font-data text-xs text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
      >
        <History size={13} />
        {busy ? "Syncing history…" : "Sync monthly history"}
      </button>
      {error && <div className="text-[11px] text-status-critical">{error}</div>}
      {result && !error && <div className="text-[11px] text-status-ok">{result}</div>}
    </div>
  );
}
