"use client";

import { useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Which client is least profitable?",
  "What's blocking the team this week?",
  "Why is utilization red?",
];

// Ephemeral by design — no ChatMessage table in v1. History lives in this
// component's state and is lost on refresh. Persistence would need a
// table, a retention policy, and a clear-history UI; the KPI layer is
// already the larger half of this feature, so this is a deliberate scope
// cut, not an oversight.
export function HealthChat({ configured }: { configured: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);

    const res = await fetch("/api/business-health/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: next }),
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Chat request failed.");
      setBusy(false);
      return;
    }

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk };
        return copy;
      });
    }
    setBusy(false);
  }

  if (!configured) {
    return (
      <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-panel p-4">
        <div className="font-display text-sm font-medium text-text">Ask Business Health</div>
        <div className="mt-3 flex-1 text-sm text-text-muted">
          Connect Anthropic on the{" "}
          <Link href="/integrations" className="text-accent hover:underline">
            Integrations page
          </Link>{" "}
          to ask questions about the business.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-panel">
      <div className="border-b border-border p-3 font-display text-sm font-medium text-text">
        Ask Business Health
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {messages.length === 0 && (
          <div className="flex flex-col gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-md border border-border-strong bg-panel-raised px-3 py-2 text-left text-text-muted hover:border-accent hover:text-text"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "self-end rounded-md bg-accent-dim px-3 py-2 text-text"
                  : "self-start px-3 py-2 text-text-muted"
              }
            >
              {m.content || (busy && i === messages.length - 1 ? "…" : "")}
            </div>
          ))}
        </div>
        {error && <div className="mt-2 text-xs text-status-critical">{error}</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Ask about the business…"
          className="min-h-11 flex-1 resize-none rounded-md border border-border-strong bg-panel-raised px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-bg hover:bg-accent-strong disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
