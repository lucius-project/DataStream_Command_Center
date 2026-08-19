"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";

// Deliberately not automatic (no useEffect-on-mount fire, unlike
// BackgroundSync elsewhere in this app) — this app owns pipeline stage
// once a company's imported, so re-running this needs to be a conscious
// choice, not something that fires on every page visit.
export function ImportKeapButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function importNow() {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/crm/import-keap", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Import failed.");
      return;
    }
    setResult(`${data.imported} new, ${data.updated} refreshed (${data.total} total in Keap).`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={importNow}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-md border border-border-strong bg-panel-raised px-3 py-2 font-data text-xs text-text-muted hover:border-accent hover:text-text disabled:opacity-50"
      >
        <Download size={13} />
        {busy ? "Importing…" : "Import from Keap"}
      </button>
      {error && <div className="text-[11px] text-status-critical">{error}</div>}
      {result && !error && <div className="text-[11px] text-status-ok">{result}</div>}
    </div>
  );
}
