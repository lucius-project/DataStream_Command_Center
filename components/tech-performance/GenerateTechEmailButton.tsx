"use client";

import { useState } from "react";
import { Mail, Check, X } from "lucide-react";

type Result = { created: true } | { created: false; message: string };

// Per-card sibling of GenerateCoachingDraftsButton (which drafts for every
// known tech at once from the huddle page) — same route, same email
// content (stats + today's priorities + SOP remediation, see
// techFocus.ts's formatFocusItemsAsEmailHtml), just scoped to this one
// tech via the route's optional `{ technician }` body. Icon-only so it
// fits the card header without adding height (per the card-cleanup
// request this button was added alongside). Draft only, same guarantee
// as the bulk button — nothing is ever sent from here.
export function GenerateTechEmailButton({ person }: { person: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function generate() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/tech-performance/coaching-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technician: person }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ created: false, message: data.error ?? "Failed to generate draft." });
      } else if ((data.created as string[]).includes(person)) {
        setResult({ created: true });
      } else {
        const skip = (data.skipped as { technician: string; reason: string }[]).find((s) => s.technician === person);
        setResult({ created: false, message: skip?.reason ?? "Draft was not created." });
      }
    } catch {
      setResult({ created: false, message: "Failed to reach the server." });
    } finally {
      setBusy(false);
      setTimeout(() => setResult(null), 5000);
    }
  }

  const Icon = result === null ? Mail : result.created ? Check : X;
  const title = busy
    ? "Generating…"
    : result === null
      ? `Draft a coaching email to ${person} — their stats, performance, and action items to improve their score (never sent, review in lcraig@dsnets.com's Drafts folder)`
      : result.created
        ? `Draft created in lcraig@dsnets.com's Drafts folder.`
        : result.message;

  return (
    <button
      type="button"
      onClick={generate}
      disabled={busy}
      title={title}
      aria-label={`Draft a coaching email for ${person}`}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-50 ${
        result?.created
          ? "border-status-ok/40 text-status-ok"
          : result && !result.created
            ? "border-status-critical/40 text-status-critical"
            : "border-border-strong text-text-muted hover:border-accent hover:text-text"
      }`}
    >
      <Icon size={13} />
    </button>
  );
}
