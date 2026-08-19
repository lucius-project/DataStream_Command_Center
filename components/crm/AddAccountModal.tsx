"use client";

import { useState } from "react";
import { Modal } from "@/components/shared/Modal";
import type { CrmAccountRow } from "./CrmBoard";

export function AddAccountModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: { name: string; website?: string; phone?: string; email?: string }) => Promise<CrmAccountRow>;
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("A company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd({ name: name.trim(), website: website.trim(), phone: phone.trim(), email: email.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this account.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Add account" subtitle="Starts at Suspect — move it along the pipeline once you open it." onClose={onClose} maxWidthClassName="max-w-md">
      <form onSubmit={save} className="flex flex-col gap-3 font-data text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-faint uppercase tracking-wide">Company name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 rounded-md border border-border-strong bg-panel px-3 text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-faint uppercase tracking-wide">Website</span>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="min-h-11 rounded-md border border-border-strong bg-panel px-3 text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-faint uppercase tracking-wide">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-11 rounded-md border border-border-strong bg-panel px-3 text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-faint uppercase tracking-wide">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-md border border-border-strong bg-panel px-3 text-text focus:border-accent focus:outline-none"
          />
        </label>

        {error && <div className="text-xs text-status-critical">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-border-strong px-4 text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-md bg-accent px-4 font-display font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
