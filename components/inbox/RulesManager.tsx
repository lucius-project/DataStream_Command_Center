"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { InboxRule, InboxRuleAction, InboxRuleMatchType } from "@/app/generated/prisma/client";

const MATCH_TYPES: { value: InboxRuleMatchType; label: string }[] = [
  { value: "SENDER_CONTAINS", label: "Sender contains" },
  { value: "SUBJECT_CONTAINS", label: "Subject contains" },
  { value: "DOMAIN", label: "Sender domain is" },
];

const ACTIONS: { value: InboxRuleAction; label: string; hint: string }[] = [
  { value: "ARCHIVE", label: "Archive", hint: "Hide it and count it as cleared automatically." },
  { value: "DEPRIORITIZE", label: "Deprioritize", hint: "Just hide it from triage, no status change." },
];

export function RulesManager({ initialRules }: { initialRules: InboxRule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [name, setName] = useState("");
  const [matchType, setMatchType] = useState<InboxRuleMatchType>("SENDER_CONTAINS");
  const [matchValue, setMatchValue] = useState("");
  const [action, setAction] = useState<InboxRuleAction>("ARCHIVE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !matchValue.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/inbox/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, matchType, matchValue, action }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not add rule.");
      return;
    }
    const rule = await res.json();
    setRules((prev) => [rule, ...prev]);
    setName("");
    setMatchValue("");
  }

  async function deleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/inbox/rules/${id}`, { method: "DELETE" });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={addRule}
        className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-4"
      >
        <div className="font-display text-sm font-medium text-text">Add a rule</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule name (e.g. Newsletters)"
          className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as InboxRuleMatchType)}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text focus:border-accent focus:outline-none"
          >
            {MATCH_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>
                {mt.label}
              </option>
            ))}
          </select>
          <input
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
            placeholder={matchType === "DOMAIN" ? "example.com" : "text to match"}
            className="min-h-11 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          {ACTIONS.map((a) => (
            <label
              key={a.value}
              className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-panel-raised px-3 text-sm text-text"
            >
              <input
                type="radio"
                name="action"
                checked={action === a.value}
                onChange={() => setAction(a.value)}
              />
              <span>
                {a.label}
                <span className="block text-xs text-text-faint">{a.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <div className="text-xs text-status-critical">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-md bg-accent px-4 font-display text-sm font-medium text-bg hover:bg-accent-strong disabled:opacity-50"
        >
          Add rule
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {rules.length === 0 && (
          <div className="text-sm text-text-muted">No noise rules yet.</div>
        )}
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel p-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-text">{rule.name}</div>
              <div className="font-data text-xs text-text-faint">
                {MATCH_TYPES.find((m) => m.value === rule.matchType)?.label} “{rule.matchValue}” →{" "}
                {rule.action}
              </div>
            </div>
            <button
              onClick={() => deleteRule(rule.id)}
              aria-label={`Delete rule ${rule.name}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-faint hover:text-status-critical"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
