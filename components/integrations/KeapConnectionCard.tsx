"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";
import { KeapCredentialForm } from "./KeapCredentialForm";
import { TestConnectionButton } from "./TestConnectionButton";
import { ClientText } from "@/components/ClientText";
import type { KeapCredentialStatus, KeapConnectionInfo } from "@/lib/services/integrations";

// Replaces the old static "Mocked" KeapIntegrationCard stub — Phase C
// wires this up for real (OAuth authorization-code + refresh-token,
// same shape as QuickBooks' connection card, since Keap's own docs
// confirm the same confidential-client, no-PKCE flow).
export function KeapConnectionCard({
  info,
  redirectUri,
  credentialStatus,
}: {
  info: KeapConnectionInfo;
  redirectUri: string;
  credentialStatus: KeapCredentialStatus;
}) {
  const router = useRouter();
  const steps = [
    "In the Keap Developer Portal (developer.infusionsoft.com), create an app.",
    `Set its Redirect URI to: ${redirectUri}`,
    "Copy the Client ID and Client Secret.",
    "Enter the Client ID and Client Secret below, then click Connect Keap and log in once.",
  ];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(!credentialStatus.configured);
  const [, startTransition] = useTransition();

  async function disconnect() {
    setBusy(true);
    await fetch("/api/auth/keap/disconnect", { method: "POST" });
    setBusy(false);
    setConfirming(false);
    startTransition(() => router.refresh());
  }

  const credentialSection = credentialStatus.configured ? (
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
          <KeapCredentialForm status={credentialStatus} />
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-panel-raised p-3">
      <div className="mb-3 text-sm text-text">Add your Keap app credentials to connect.</div>
      <KeapCredentialForm status={credentialStatus} />
    </div>
  );

  if (!info.connected) {
    return (
      <IntegrationCard
        icon={Users}
        name="Keap"
        statusLabel={credentialStatus.configured ? "Not connected" : "Not configured"}
        tone="off"
        description="Powers CRM (SDR lead/pipeline view). Not connected yet."
      >
        <div className="flex flex-col gap-3">
          {credentialStatus.configured && (
            <a
              href="/api/auth/keap/login"
              className="inline-flex min-h-10 w-fit items-center rounded-md bg-accent px-3 font-display text-sm font-medium text-bg hover:bg-accent-strong"
            >
              Connect Keap
            </a>
          )}
          {credentialSection}
          <InstructionsToggle steps={steps} />
        </div>
      </IntegrationCard>
    );
  }

  return (
    <IntegrationCard
      icon={Users}
      name="Keap"
      statusLabel={info.healthy ? "Connected" : "Disconnected"}
      tone={info.healthy ? "ok" : "error"}
      description={
        info.healthy
          ? "Live — powers CRM. Lead/pipeline view is coming in the next phase."
          : `Connection issue: ${info.healthError}`
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 font-data text-xs text-text-muted">
          <span>
            Since:{" "}
            <ClientText
              compute={() => info.connectedAt.toLocaleString()}
              fallback={info.connectedAt.toISOString()}
            />
          </span>
        </div>

        <TestConnectionButton testUrl="/api/integrations/keap/test" />

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="min-h-10 w-fit rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-status-critical hover:text-status-critical"
          >
            Disconnect
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim p-3">
            <span className="text-xs text-status-critical">This removes the stored connection.</span>
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
        )}

        {credentialSection}
        <InstructionsToggle steps={steps} />
      </div>
    </IntegrationCard>
  );
}
