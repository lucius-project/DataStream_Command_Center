"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RunbookFrequency } from "@/app/generated/prisma/client";

const FREQUENCIES: { value: RunbookFrequency; label: string }[] = [
  { value: "ONE_OFF", label: "One-off" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

export function AddRunbookItemForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [frequency, setFrequency] = useState<RunbookFrequency>("ONE_OFF");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !categoryId) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/runbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, categoryId, frequency }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not add item.");
      return;
    }
    setTitle("");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4"
    >
      <div className="font-display text-sm font-medium text-text">Add a runbook item</div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Item title (e.g. Post to LinkedIn)"
        className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text focus:border-accent focus:outline-none"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as RunbookFrequency)}
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text focus:border-accent focus:outline-none"
        >
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="text-xs text-status-critical">{error}</div>}
      <button
        type="submit"
        disabled={busy || !title.trim() || !categoryId}
        className="min-h-11 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
      >
        Add item
      </button>
    </form>
  );
}
