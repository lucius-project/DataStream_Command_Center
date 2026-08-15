"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type VendorSubscriptionFormValues = {
  id?: string;
  vendorName: string;
  productName: string;
  renewalDate: string; // yyyy-mm-dd, matches <input type="date">
  notes: string;
};

// Shared by /vendors/new and /vendors/[id]/edit — same "one form, one
// save path" reasoning as every other authoring form in this app
// (SopForm, StaffUsersForm, TechRolesForm).
export function VendorSubscriptionForm({ initial }: { initial: VendorSubscriptionFormValues }) {
  const router = useRouter();
  const isEdit = Boolean(initial.id);
  const [vendorName, setVendorName] = useState(initial.vendorName);
  const [productName, setProductName] = useState(initial.productName);
  const [renewalDate, setRenewalDate] = useState(initial.renewalDate);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vendorName.trim() || !productName.trim() || !renewalDate) {
      setError("Vendor, product, and renewal date are required.");
      return;
    }
    setBusy(true);
    const res = await fetch(isEdit ? `/api/vendor-subscriptions/${initial.id}` : "/api/vendor-subscriptions", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorName, productName, renewalDate, notes: notes || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save this subscription.");
      return;
    }
    router.push("/vendors");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/vendor-subscriptions/${initial.id}`, { method: "DELETE" });
    router.push("/vendors");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Vendor</span>
        <input
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          placeholder="e.g. Huntress"
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Product</span>
        <input
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="e.g. Endpoint Detection & Response (500 endpoints)"
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Renewal date</span>
        <input
          type="date"
          value={renewalDate}
          onChange={(e) => setRenewalDate(e.target.value)}
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-data text-xs text-text-faint">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. Auto-renews, no action needed unless cancelling."
          className="rounded-md border border-border-strong bg-panel-raised px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
      </label>

      {error && <div className="text-xs text-status-critical">{error}</div>}

      <div className="flex items-center justify-between gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
        >
          {isEdit ? "Save changes" : "Add subscription"}
        </button>

        {isEdit &&
          (!confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-10 rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-status-critical hover:text-status-critical"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-status-critical">Delete this subscription?</span>
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="min-h-9 rounded-md bg-status-critical px-3 text-xs font-medium text-bg disabled:opacity-50"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="min-h-9 rounded-md border border-border-strong px-3 text-xs text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          ))}
      </div>
    </form>
  );
}
