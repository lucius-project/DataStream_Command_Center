"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Check } from "lucide-react";

type Phase = "idle" | "running" | "done";

const PRESETS = [15, 25, 45, 60];

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FocusTimer() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [task, setTask] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [customMinutes, setCustomMinutes] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionId = useRef<string | null>(null);
  const endAt = useRef<number>(0);

  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(interval);
        finish(true);
      }
    }, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function start() {
    if (!task.trim()) return;
    setError(null);
    setBusy(true);
    const res = await fetch("/api/focus/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: task.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not start session.");
      return;
    }
    const session = await res.json();
    sessionId.current = session.id;
    endAt.current = Date.now() + minutes * 60 * 1000;
    setRemaining(minutes * 60);
    setPhase("running");
  }

  async function finish(completed: boolean) {
    if (!sessionId.current) return;
    setBusy(true);
    await fetch(`/api/focus/sessions/${sessionId.current}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    setBusy(false);
    sessionId.current = null;
    setPhase("done");
    router.refresh();
  }

  function reset() {
    setTask("");
    setPhase("idle");
  }

  const effectiveMinutes = customMinutes ? parseInt(customMinutes, 10) || 0 : minutes;

  return (
    <div className="rounded-xl border border-border bg-panel p-6">
      {phase === "idle" && (
        <div className="flex flex-col gap-4">
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What are you focusing on?"
            className="min-h-12 rounded-md border border-border-strong bg-panel-raised px-3 text-base text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMinutes(m);
                  setCustomMinutes("");
                }}
                className={`min-h-11 rounded-md border px-4 text-sm font-medium ${
                  minutes === m && !customMinutes
                    ? "border-accent bg-accent text-bg"
                    : "border-border-strong bg-panel-raised text-text hover:border-accent"
                }`}
              >
                {m} min
              </button>
            ))}
            <input
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value.replace(/\D/g, ""))}
              placeholder="Custom"
              inputMode="numeric"
              className="min-h-11 w-24 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
          </div>
          {error && <div className="text-xs text-status-critical">{error}</div>}
          <button
            onClick={start}
            disabled={busy || !task.trim() || effectiveMinutes <= 0}
            className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-4 font-display text-base font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
          >
            <Play size={18} />
            Start focus session
          </button>
        </div>
      )}

      {phase === "running" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="font-data text-xs tracking-widest text-text-faint uppercase">
            {task}
          </div>
          <div className="font-display text-6xl font-semibold tabular-nums text-text">
            {formatClock(remaining)}
          </div>
          <button
            onClick={() => finish(false)}
            disabled={busy}
            className="flex min-h-12 items-center gap-2 rounded-md border border-border-strong px-5 text-sm text-text-muted hover:border-status-critical hover:text-status-critical disabled:opacity-50"
          >
            <Square size={16} />
            Stop early
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-ok-dim text-status-ok">
            <Check size={22} />
          </span>
          <div className="text-sm text-text">Session logged.</div>
          <button
            onClick={reset}
            className="min-h-11 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong"
          >
            Start another
          </button>
        </div>
      )}
    </div>
  );
}
