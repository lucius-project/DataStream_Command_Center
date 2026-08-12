"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import type { QuickBooksCredentialStatus } from "@/lib/services/integrations";

export function QuickBooksCredentialForm({ status }: { status: QuickBooksCredentialStatus }) {
  const router = useRouter();
  const [environment, setEnvironment] = useState(status.environment);
  const [clientId, setClientId] = useState(status.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/integrations/quickbooks/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ environment, clientId, clientSecret: clientSecret || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save credentials.");
      return;
    }
    setClientSecret("");
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Environment</span>
        <select
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
        >
          <option value="sandbox">Sandbox</option>
          <option value="production">Production</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Client ID</span>
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID from the Intuit Developer app"
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Client secret</span>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={status.hasSecret ? "•••••••• (leave blank to keep current)" : "Paste the secret value"}
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
      </label>

      <div className="flex items-center gap-1.5 text-xs text-text-faint">
        <ShieldCheck size={13} />
        Encrypted at rest — never stored in plaintext.
      </div>

      {error && <div className="text-xs text-status-critical">{error}</div>}
      {saved && <div className="text-xs text-status-ok">Saved.</div>}

      <button
        type="submit"
        disabled={busy || !clientId.trim() || (!status.hasSecret && !clientSecret.trim())}
        className="min-h-11 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
      >
        Save credentials
      </button>
    </form>
  );
}
