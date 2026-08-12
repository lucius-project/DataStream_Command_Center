"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Bot } from "lucide-react";
import { SNOOZE_PRESET_OPTIONS } from "@/lib/snoozePresets";
import type { DueRunbookItem } from "@/lib/services/runbooks";

const FREQUENCY_LABEL: Record<string, string> = {
  ONE_OFF: "One-off",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

type Mode = "idle" | "snooze" | "delegate";

export function RunbookItemCard({ item }: { item: DueRunbookItem }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/runbooks/${item.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong.");
      return;
    }
    setMode("idle");
    setNote("");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-base font-medium text-text">{item.title}</div>
          <div className="font-data text-xs text-text-faint">{item.category.name}</div>
        </div>
        <span className="shrink-0 font-data text-[11px] text-text-faint">
          {FREQUENCY_LABEL[item.frequency]}
        </span>
      </div>

      {item.description && <p className="mt-3 text-sm text-text-muted">{item.description}</p>}

      {error && (
        <div className="mt-3 rounded-md border border-status-critical/40 bg-status-critical-dim px-3 py-2 text-xs text-status-critical">
          {error}
        </div>
      )}

      {mode === "idle" && (
        <div className="mt-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <button
            onClick={() => setMode("delegate")}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-panel-raised px-3 text-sm font-medium text-text hover:border-accent"
          >
            <Bot size={16} />
            Delegate
          </button>
          <button
            onClick={() => setMode("snooze")}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-panel-raised px-3 text-sm font-medium text-text hover:border-accent"
          >
            <Clock size={16} />
            Snooze
          </button>
          <button
            disabled={busy}
            onClick={() => act("complete")}
            className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50 md:col-span-1"
          >
            <Check size={16} />
            Complete
          </button>
        </div>
      )}

      {mode === "snooze" && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {SNOOZE_PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                disabled={busy}
                onClick={() => act("snooze", { preset: opt.key })}
                className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text hover:border-accent disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setMode("idle")}
            className="min-h-11 self-start rounded-md border border-border-strong px-4 text-sm text-text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      )}

      {mode === "delegate" && (
        <div className="mt-4 flex flex-col gap-2">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should the agent do?"
            rows={3}
            className="min-h-20 w-full resize-y rounded-md border border-border-strong bg-panel-raised px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              disabled={busy || !note.trim()}
              onClick={() => act("delegate", { note })}
              className="min-h-11 flex-1 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
            >
              Delegate
            </button>
            <button
              onClick={() => setMode("idle")}
              className="min-h-11 rounded-md border border-border-strong px-4 text-sm text-text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
