"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";
import { AnthropicCredentialForm } from "./AnthropicCredentialForm";
import { TestConnectionButton } from "./TestConnectionButton";
import type { AnthropicCredentialStatus } from "@/lib/services/integrations";

const VENDOR_NOTE = "API keys are managed at console.anthropic.com, separate from your regular Claude.ai login.";

const STEPS = [
  "Go to console.anthropic.com and sign in (or create an account).",
  "Under Settings → API Keys, create a new key.",
  "Copy the key value — it's shown once.",
  "Enter it below, then save — it tests the connection immediately.",
];

export function AnthropicConnectionCard({ status }: { status: AnthropicCredentialStatus }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(!status.configured);

  async function disconnect() {
    setBusy(true);
    await fetch("/api/integrations/anthropic/config", { method: "DELETE" });
    setBusy(false);
    setConfirming(false);
    router.refresh();
  }

  const credentialSection = status.configured ? (
    <div>
      <button
        onClick={() => setShowCredentialForm((v) => !v)}
        className="flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-accent hover:text-text"
      >
        {showCredentialForm ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        Edit credentials
      </button>
      {showCredentialForm && (
        <div className="mt-3 rounded-md border border-border bg-panel-raised p-3">
          <AnthropicCredentialForm status={status} />
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-panel-raised p-3">
      <div className="mb-3 text-sm text-text">Add your Anthropic API key to connect.</div>
      <AnthropicCredentialForm status={status} />
    </div>
  );

  return (
    <IntegrationCard
      icon={Sparkles}
      name="Anthropic"
      statusLabel={status.configured ? (status.healthy ? "Connected" : "Disconnected") : "Not connected"}
      tone={status.configured ? (status.healthy ? "ok" : "error") : "off"}
      description={
        status.configured
          ? status.healthy
            ? `Live — powers the Business Health chat (${status.model}).`
            : `Connection issue: ${status.healthError}`
          : "Powers the Business Health chat. Not connected — the chat panel stays disabled until it is."
      }
    >
      <div className="flex flex-col gap-3">
        {status.configured && (
          <div className="flex flex-col gap-1 font-data text-xs text-text-muted">
            <span>
              Model: <span className="text-text">{status.model}</span>
            </span>
          </div>
        )}

        {status.configured && <TestConnectionButton testUrl="/api/integrations/anthropic/test" />}

        {status.configured &&
          (!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="min-h-10 w-fit rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-status-critical hover:text-status-critical"
            >
              Disconnect
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim p-3">
              <span className="text-xs text-status-critical">
                This removes the stored API key. The Business Health chat will stop working until
                reconnected.
              </span>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={disconnect}
                  className="min-h-9 flex-1 rounded-md bg-status-critical px-3 text-xs font-medium text-bg disabled:opacity-50"
                >
                  Yes, disconnect
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="min-h-9 rounded-md border border-border-strong px-3 text-xs text-text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}

        {credentialSection}
        <InstructionsToggle steps={STEPS} note={VENDOR_NOTE} />
      </div>
    </IntegrationCard>
  );
}
