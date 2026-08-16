"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

type Result =
  | { created: string[]; skipped: { technician: string; reason: string }[]; directoryError?: string }
  | { error: string };

// Client leaf inside TechFocusSection's Server Component header (same
// pattern as InfoButton/MorningBriefHealthTile) — the only interactive
// part of an otherwise server-rendered section. Manual trigger only, by
// design: this app has no scheduled-job infrastructure, so "daily" here
// means "whenever you click it," not an automated send. Creates drafts
// only (app/api/tech-performance/coaching-drafts never calls Graph's
// /send) — nothing goes out until the drafts are reviewed and sent by
// hand from lcraig@dsnets.com's own mailbox.
export function GenerateCoachingDraftsButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function generate() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/tech-performance/coaching-drafts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Failed to generate coaching drafts." });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ error: "Failed to reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 font-data text-xs font-medium text-text hover:border-accent disabled:opacity-50"
      >
        <Mail size={13} />
        {busy ? "Generating…" : "Generate Coaching Drafts"}
      </button>
      {result && "error" in result && <span className="text-xs text-status-critical">{result.error}</span>}
      {result && "created" in result && (
        <span className="text-xs text-text-faint">
          {result.created.length > 0
            ? `${result.created.length} draft${result.created.length === 1 ? "" : "s"} created in lcraig@dsnets.com's Drafts folder (${result.created.join(", ")}).`
            : "No drafts created."}
          {result.skipped.length > 0 && ` Skipped: ${result.skipped.map((s) => `${s.technician} (${s.reason})`).join("; ")}`}
        </span>
      )}
      {result && "created" in result && result.directoryError && (
        <span className="text-xs text-status-warn">
          Directory lookup failed, some names/companies may be missing: {result.directoryError}
        </span>
      )}
    </div>
  );
}
