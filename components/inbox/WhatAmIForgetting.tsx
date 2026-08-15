"use client";

import { useState } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";

type Finding = { subject: string; withWhom: string; finding: string };

export function WhatAmIForgetting() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);

  async function run() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox/forgetting", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to scan recent mail.");
      setFindings(data.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan recent mail.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="flex min-h-11 items-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-3 font-display text-xs font-medium whitespace-nowrap text-accent hover:bg-accent/20 disabled:opacity-60 sm:text-sm"
      >
        <Sparkles size={15} />
        What am I forgetting?
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40"
          />
          <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[90vw] max-w-sm overflow-y-auto rounded-lg border border-border bg-panel p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="font-display text-sm font-semibold text-text">
                {loading
                  ? "Scanning recent threads…"
                  : error
                    ? "Couldn't finish the scan"
                    : findings && findings.length > 0
                      ? "Possibly slipping through the cracks"
                      : "All caught up"}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Dismiss"
                className="shrink-0 rounded p-1 text-text-faint hover:bg-panel-raised hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            {loading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
                <Loader2 size={14} className="animate-spin" />
                Reading the last two weeks of inbox and sent mail…
              </div>
            )}

            {!loading && error && <div className="mt-2 text-sm text-status-critical">{error}</div>}

            {!loading && !error && findings && findings.length === 0 && (
              <p className="mt-2 text-sm text-text-muted">Nothing looks like an open loop in the last two weeks of mail.</p>
            )}

            {!loading && !error && findings && findings.length > 0 && (
              <ul className="mt-3 flex flex-col gap-3">
                {findings.map((f, i) => (
                  <li key={i} className="text-sm text-text">
                    <span className="text-text-faint">
                      {f.subject} — {f.withWhom}:
                    </span>{" "}
                    {f.finding}
                  </li>
                ))}
              </ul>
            )}

            {!loading && !error && (
              <p className="mt-3 text-xs text-text-faint">
                Based on subject lines and previews from the last two weeks of mail — a nudge to double-check, not a confirmed miss.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
