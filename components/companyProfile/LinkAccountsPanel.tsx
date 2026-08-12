"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

export function LinkAccountsPanel({
  clientId,
  clientName,
  ninjaOrganizationId,
  quickbooksCustomerId,
  ninjaOrganizations,
  quickbooksCustomers,
}: {
  clientId: string;
  clientName: string;
  ninjaOrganizationId: string | null;
  quickbooksCustomerId: string | null;
  ninjaOrganizations: Option[];
  quickbooksCustomers: Option[];
}) {
  const router = useRouter();
  const suggestedNinja =
    ninjaOrganizationId ??
    ninjaOrganizations.find((o) => o.name.toLowerCase().includes(clientName.toLowerCase().slice(0, 8)))?.id ??
    "";
  const suggestedQb =
    quickbooksCustomerId ??
    quickbooksCustomers.find((c) => c.name.toLowerCase().includes(clientName.toLowerCase().slice(0, 8)))?.id ??
    "";

  const [ninjaOrgId, setNinjaOrgId] = useState(suggestedNinja);
  const [qbCustomerId, setQbCustomerId] = useState(suggestedQb);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/clients/${clientId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ninjaOrganizationId: ninjaOrgId, quickbooksCustomerId: qbCustomerId }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="font-display text-sm font-medium text-text">Link accounts</div>
      <p className="mt-1 text-xs text-text-muted">
        No shared ID exists across HaloPSA, NinjaRMM, and QuickBooks — confirm the right match
        below. This feeds the financials and seat reconciliation on this page.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">NinjaRMM organization</span>
          <select
            value={ninjaOrgId}
            onChange={(e) => setNinjaOrgId(e.target.value)}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">
              {ninjaOrganizations.length === 0 ? "Not connected / no organizations found" : "Not linked"}
            </option>
            {ninjaOrganizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-data text-xs text-text-faint">QuickBooks customer</span>
          <select
            value={qbCustomerId}
            onChange={(e) => setQbCustomerId(e.target.value)}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
          >
            <option value="">
              {quickbooksCustomers.length === 0 ? "Not connected / no customers found" : "Not linked"}
            </option>
            {quickbooksCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="mt-2 text-xs text-status-critical">{error}</div>}
      {saved && <div className="mt-2 text-xs text-status-ok">Saved.</div>}

      <button
        onClick={save}
        disabled={busy}
        className="mt-3 min-h-10 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
      >
        Save links
      </button>
    </div>
  );
}
