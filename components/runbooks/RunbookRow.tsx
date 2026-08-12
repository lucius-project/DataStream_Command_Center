"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Bot, Trash2 } from "lucide-react";
import { SNOOZE_PRESET_OPTIONS } from "@/lib/snoozePresets";
import type { RunbookBoardItem } from "@/lib/services/runbooks";

const FREQUENCY_LABEL: Record<string, string> = {
  ONE_OFF: "One-off",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

type Expanded = "none" | "snooze" | "delegate";

export function RunbookRow({ item }: { item: RunbookBoardItem }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Expanded>("none");
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
    setExpanded("none");
    setNote("");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/runbooks/${item.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  const statusLabel = item.isSnoozed
    ? "Snoozed"
    : item.isDue
      ? "Due"
      : "Up to date";
  const statusTone = item.isSnoozed
    ? "text-text-faint"
    : item.isDue
      ? "text-status-warn"
      : "text-status-ok";

  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text">{item.title}</div>
          {item.description && (
            <div className="mt-0.5 text-xs text-text-muted">{item.description}</div>
          )}
          <div className="mt-1 flex items-center gap-2 font-data text-[11px]">
            <span className="text-text-faint">{FREQUENCY_LABEL[item.frequency]}</span>
            <span className={statusTone}>{statusLabel}</span>
          </div>
        </div>
        <button
          onClick={remove}
          disabled={busy}
          aria-label={`Delete ${item.title}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center text-text-faint hover:text-status-critical disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-status-critical">{error}</div>}

      {expanded === "none" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => act("complete")}
            disabled={busy}
            className="flex min-h-9 items-center gap-1.5 rounded-md border border-accent bg-accent px-3 text-xs font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
          >
            <Check size={13} />
            Complete
          </button>
          <button
            onClick={() => setExpanded("snooze")}
            className="flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-panel-raised px-3 text-xs text-text hover:border-accent"
          >
            <Clock size={13} />
            Snooze
          </button>
          <button
            onClick={() => setExpanded("delegate")}
            className="flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-panel-raised px-3 text-xs text-text hover:border-accent"
          >
            <Bot size={13} />
            Delegate
          </button>
        </div>
      )}

      {expanded === "snooze" && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SNOOZE_PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                disabled={busy}
                onClick={() => act("snooze", { preset: opt.key })}
                className="min-h-9 rounded-md border border-border-strong bg-panel-raised px-3 text-xs text-text hover:border-accent disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setExpanded("none")}
            className="min-h-9 self-start rounded-md border border-border-strong px-3 text-xs text-text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      )}

      {expanded === "delegate" && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should the agent do?"
            rows={2}
            className="min-h-16 w-full resize-y rounded-md border border-border-strong bg-panel-raised px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              disabled={busy || !note.trim()}
              onClick={() => act("delegate", { note })}
              className="min-h-9 flex-1 rounded-md bg-accent px-3 text-xs font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
            >
              Delegate
            </button>
            <button
              onClick={() => setExpanded("none")}
              className="min-h-9 rounded-md border border-border-strong px-3 text-xs text-text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
