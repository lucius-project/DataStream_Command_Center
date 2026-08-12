"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import type { UnitedCloudCredentialStatus } from "@/lib/services/integrations";

export function UnitedCloudCredentialForm({ status }: { status: UnitedCloudCredentialStatus }) {
  const router = useRouter();
  const [apiBaseUrl, setApiBaseUrl] = useState(status.apiBaseUrl);
  const [domain, setDomain] = useState(status.domain);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testWarning, setTestWarning] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    setTestWarning(null);
    const res = await fetch("/api/integrations/unitedcloud/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiBaseUrl, domain, apiKey: apiKey || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save credentials.");
      return;
    }
    const data = await res.json();
    setApiKey("");
    setSaved(true);
    if (data.tested === false) {
      setTestWarning(data.testError || "Saved, but the connection test failed.");
    }
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">API base URL</span>
        <input
          value={apiBaseUrl}
          onChange={(e) => setApiBaseUrl(e.target.value)}
          placeholder="https://api.iplogin.ca/ns-api/v2"
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Domain</span>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="~ for your own domain"
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={status.hasSecret ? "•••••••• (leave blank to keep current)" : "Paste the API key value"}
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
      </label>

      <div className="flex items-center gap-1.5 text-xs text-text-faint">
        <ShieldCheck size={13} />
        Encrypted at rest — never stored in plaintext.
      </div>

      {error && <div className="text-xs text-status-critical">{error}</div>}
      {saved && !testWarning && (
        <div className="text-xs text-status-ok">Saved and connection test passed.</div>
      )}
      {testWarning && (
        <div className="rounded-md border border-status-warn/40 bg-status-warn-dim px-3 py-2 text-xs text-status-warn">
          Saved, but the connection test failed: {testWarning}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !apiBaseUrl.trim() || !domain.trim() || (!status.hasSecret && !apiKey.trim())}
        className="min-h-11 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
      >
        Save credentials
      </button>
    </form>
  );
}
