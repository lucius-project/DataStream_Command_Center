"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Shared by every *ConnectionCard.tsx — same "POST, show pass/fail,
// refresh so the page-level badge picks up the same live result" logic
// repeated identically across all 7 real integrations, not 7 separate
// implementations. The badge itself (IntegrationCard's tone) is driven
// by the healthy/healthError already computed at page-load time in
// lib/services/integrations.ts; this button re-runs that same check on
// demand without a full page reload.
export function TestConnectionButton({ testUrl }: { testUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  async function runTest() {
    setBusy(true);
    setResult(null);
    const res = await fetch(testUrl, { method: "POST" });
    const data = await res.json().catch(() => ({ ok: false, error: "Unexpected response." }));
    setResult(data);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={runTest}
        disabled={busy}
        className="min-h-9 w-fit rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
      >
        {busy ? "Testing…" : "Test connection"}
      </button>
      {result &&
        (result.ok ? (
          <div className="text-xs text-status-ok">Connection test passed.</div>
        ) : (
          <div className="rounded-md border border-status-critical/40 bg-status-critical-dim px-3 py-2 text-xs text-status-critical">
            {result.error || "Connection test failed."}
          </div>
        ))}
    </div>
  );
}
