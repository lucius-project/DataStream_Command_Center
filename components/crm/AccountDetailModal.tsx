"use client";

import { useState } from "react";
import { Modal } from "@/components/shared/Modal";
import { CRM_STAGE_ORDER, CRM_STAGE_LABELS } from "@/lib/crmStages";
import type { CrmAccountRow } from "./CrmBoard";
import type { CrmStage } from "@/app/generated/prisma/client";

export function AccountDetailModal({
  account,
  onClose,
  onSave,
}: {
  account: CrmAccountRow;
  onClose: () => void;
  onSave: (id: string, patch: { stage?: CrmStage; notes?: string }) => Promise<void>;
}) {
  const [stage, setStage] = useState<CrmStage>(account.stage);
  const [notes, setNotes] = useState(account.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const patch: { stage?: CrmStage; notes?: string } = {};
      if (stage !== account.stage) patch.stage = stage;
      if (notes !== (account.notes ?? "")) patch.notes = notes;
      if (Object.keys(patch).length > 0) await onSave(account.id, patch);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={account.name} onClose={onClose} maxWidthClassName="max-w-md">
      <div className="flex flex-col gap-3 font-data text-sm">
        {(account.website || account.phone || account.email) && (
          <div className="flex flex-col gap-1 text-text-muted">
            {account.website && <div>{account.website}</div>}
            {account.phone && <div>{account.phone}</div>}
            {account.email && <div>{account.email}</div>}
            {(account.addressLine1 || account.city) && (
              <div>
                {[account.addressLine1, account.city, account.region, account.postalCode].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-faint uppercase tracking-wide">Stage</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as CrmStage)}
            className="min-h-11 rounded-md border border-border-strong bg-panel px-3 text-text focus:border-accent focus:outline-none"
          >
            {CRM_STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {CRM_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-faint uppercase tracking-wide">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="rounded-md border border-border-strong bg-panel px-3 py-2 text-text focus:border-accent focus:outline-none"
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
            type="button"
            onClick={save}
            disabled={saving}
            className="min-h-11 rounded-md bg-accent px-4 font-display font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
