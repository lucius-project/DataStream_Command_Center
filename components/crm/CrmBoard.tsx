"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { CrmAccount, CrmStage } from "@/app/generated/prisma/client";
import { CRM_STAGE_ORDER, CRM_STAGE_LABELS } from "@/lib/crmStages";
import { CrmCard } from "./CrmCard";
import { AccountDetailModal } from "./AccountDetailModal";
import { AddAccountModal } from "./AddAccountModal";
import { ImportKeapButton } from "./ImportKeapButton";

export type CrmAccountRow = CrmAccount;

// Terminal outcome columns get a quieter, less prominent header — same
// visual demotion StatusPill-style patterns use elsewhere for "this
// isn't active work" vs. the five working-funnel columns.
const CLOSED_STAGES = new Set<CrmStage>(["PAUSE_MARKETING", "NOT_A_FIT", "AVOID"]);

export function CrmBoard({ initialAccounts }: { initialAccounts: CrmAccountRow[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [search, setSearch] = useState("");
  const [openAccount, setOpenAccount] = useState<CrmAccountRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<CrmStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.name.toLowerCase().includes(q) || a.website?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const byStage = useMemo(() => {
    const map = new Map<CrmStage, CrmAccountRow[]>();
    for (const stage of CRM_STAGE_ORDER) map.set(stage, []);
    for (const a of filtered) map.get(a.stage)?.push(a);
    return map;
  }, [filtered]);

  async function patchAccount(id: string, patch: { stage?: CrmStage; notes?: string }) {
    const res = await fetch(`/api/crm/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not save.");
    }
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch, stageChangedAt: patch.stage ? new Date() : a.stageChangedAt } : a)),
    );
  }

  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
  }

  async function onDrop(e: React.DragEvent, stage: CrmStage) {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const current = accounts.find((a) => a.id === id);
    if (!current || current.stage === stage) return;
    // Optimistic move, rolled back on failure.
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, stage } : a)));
    try {
      await patchAccount(id, { stage });
    } catch (err) {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, stage: current.stage } : a)));
      setError(err instanceof Error ? err.message : "Could not move that account.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-11 w-64 rounded-md border border-border-strong bg-panel px-3 font-data text-sm text-text focus:border-accent focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-md border border-border-strong bg-panel-raised px-3 py-2 font-data text-xs text-text-muted hover:border-accent hover:text-text"
          >
            <Plus size={13} />
            Add account
          </button>
          <ImportKeapButton />
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-status-critical/40 bg-status-critical-dim px-4 py-2 text-sm text-status-critical">
          {error}
        </div>
      )}

      <div className="mt-4 flex-1 overflow-x-auto">
        <div className="flex gap-3" style={{ minWidth: `${CRM_STAGE_ORDER.length * 260}px` }}>
          {CRM_STAGE_ORDER.map((stage) => {
            const rows = byStage.get(stage) ?? [];
            const closed = CLOSED_STAGES.has(stage);
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => onDrop(e, stage)}
                className={`flex w-[250px] shrink-0 flex-col rounded-lg border p-2 ${
                  dragOverStage === stage ? "border-accent bg-accent-dim" : "border-border bg-panel"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 px-1 pb-2">
                  <span
                    className={`font-data text-[11px] font-semibold tracking-wide uppercase ${closed ? "text-text-faint" : "text-text-muted"}`}
                  >
                    {CRM_STAGE_LABELS[stage]}
                  </span>
                  <span className="font-data text-[11px] text-text-faint">{rows.length}</span>
                </div>
                <div className="flex min-h-[60px] flex-col gap-1.5">
                  {rows.map((account) => (
                    <CrmCard key={account.id} account={account} onDragStart={onDragStart} onOpen={setOpenAccount} />
                  ))}
                  {rows.length === 0 && <div className="px-1 font-data text-[11px] text-text-faint">Nothing here.</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {openAccount && (
        <AccountDetailModal
          account={openAccount}
          onClose={() => setOpenAccount(null)}
          onSave={async (id, patch) => {
            await patchAccount(id, patch);
          }}
        />
      )}

      {adding && (
        <AddAccountModal
          onClose={() => setAdding(false)}
          onAdd={async (input) => {
            const res = await fetch("/api/crm/accounts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || "Could not add this account.");
            }
            const account = (await res.json()) as CrmAccountRow;
            setAccounts((prev) => [account, ...prev]);
            return account;
          }}
        />
      )}
    </div>
  );
}
