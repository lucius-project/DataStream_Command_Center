"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Clock } from "lucide-react";
import { SNOOZE_PRESET_OPTIONS } from "@/lib/snoozePresets";
import type { AttentionFlag, TicketSnapshot } from "@/app/generated/prisma/client";

type FlagWithTicket = AttentionFlag & { ticket: TicketSnapshot | null };

const TYPE_LABEL: Record<string, string> = {
  ESCALATION: "Escalation",
  SLA_BREACH: "SLA breach",
  CEO_REVIEW: "For your review",
  OTHER: "Flagged",
};

type Mode = "idle" | "delegate" | "snooze";

// Moved from the now-removed /operations page (components/operations/
// AttentionPane.tsx) — this is Command Flow's only remaining consumer of
// the OPERATIONS-sourced attention-flag card (see CommandFlowView.tsx's
// source === "OPERATIONS" branch). The delegate/resolve/snooze API
// routes it calls (app/api/operations/attention/[id]/*) stayed at their
// original path — that URL prefix predates the page and isn't tied to
// it, so there was nothing to move there.
export function AttentionCard({ flag }: { flag: FlagWithTicket }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function act(path: "delegate" | "resolve" | "snooze", body?: unknown) {
    setError(null);
    const res = await fetch(`/api/operations/attention/${flag.id}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong.");
      return;
    }
    setMode("idle");
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-data text-[11px] font-semibold tracking-wide text-status-warn">
          {TYPE_LABEL[flag.type] ?? flag.type}
        </span>
        {flag.status === "ACKNOWLEDGED" && (
          <span className="font-data text-[10px] text-text-faint">DELEGATED</span>
        )}
      </div>
      <div className="mt-1 text-sm text-text">{flag.description}</div>
      {flag.ticket && (
        <div className="mt-1 font-data text-[11px] text-text-faint">
          {flag.ticket.haloTicketId} · {flag.ticket.summary}
        </div>
      )}
      {flag.assignedTo && (
        <div className="mt-1 font-data text-[11px] text-text-faint">Owner: {flag.assignedTo}</div>
      )}

      {error && <div className="mt-2 text-xs text-status-critical">{error}</div>}

      {flag.status === "OPEN" && mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setMode("delegate")}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-panel-raised px-3 text-xs font-medium text-text hover:border-accent"
          >
            <Bot size={14} />
            Delegate
          </button>
          <button
            onClick={() => setMode("snooze")}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-panel-raised px-3 text-xs font-medium text-text hover:border-accent"
          >
            <Clock size={14} />
            Snooze
          </button>
          <button
            onClick={() => act("resolve")}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-accent bg-accent px-3 text-xs font-medium text-bg hover:bg-accent-strong"
          >
            <Check size={14} />
            Resolve
          </button>
        </div>
      )}

      {flag.status === "OPEN" && mode === "delegate" && (
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
              disabled={!note.trim()}
              onClick={() => act("delegate", { note })}
              className="min-h-9 flex-1 rounded-md bg-accent px-3 text-xs font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
            >
              Delegate
            </button>
            <button
              onClick={() => setMode("idle")}
              className="min-h-9 rounded-md border border-border-strong px-3 text-xs text-text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {flag.status === "OPEN" && mode === "snooze" && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SNOOZE_PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => act("snooze", { preset: opt.key })}
                className="min-h-9 rounded-md border border-border-strong bg-panel-raised px-3 text-xs text-text hover:border-accent"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setMode("idle")}
            className="min-h-9 self-start rounded-md border border-border-strong px-3 text-xs text-text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
