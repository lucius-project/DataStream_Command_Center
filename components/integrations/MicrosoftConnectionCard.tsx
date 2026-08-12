"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";
import { MicrosoftCredentialForm } from "./MicrosoftCredentialForm";
import { ClientText } from "@/components/ClientText";
import type { MicrosoftConnectionInfo, MicrosoftCredentialStatus } from "@/lib/services/integrations";

export function MicrosoftConnectionCard({
  info,
  redirectUri,
  credentialStatus,
}: {
  info: MicrosoftConnectionInfo;
  redirectUri: string;
  credentialStatus: MicrosoftCredentialStatus;
}) {
  const router = useRouter();
  const steps = [
    "In the Entra admin center (entra.microsoft.com), go to App registrations → New registration.",
    `Name it, choose "Accounts in this organizational directory only," and add a Web redirect URI: ${redirectUri}`,
    "Copy the Application (client) ID and Directory (tenant) ID from the Overview page.",
    "Go to Certificates & secrets → New client secret, and copy the value immediately — it's hidden after you leave the page.",
    "Go to API permissions → Add a permission → Microsoft Graph → Delegated permissions, add Mail.Read and Mail.ReadWrite, then Grant admin consent if your tenant requires it.",
    "Enter the client ID, tenant ID, and client secret below, then click Connect Microsoft 365.",
  ];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(!credentialStatus.configured);
  const [, startTransition] = useTransition();

  async function disconnect() {
    setBusy(true);
    await fetch("/api/auth/microsoft/disconnect", { method: "POST" });
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
          <MicrosoftCredentialForm status={credentialStatus} />
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-panel-raised p-3">
      <div className="mb-3 text-sm text-text">Add your Entra app credentials to connect.</div>
      <MicrosoftCredentialForm status={credentialStatus} />
    </div>
  );

  if (!info.connected) {
    return (
      <IntegrationCard
        icon={Mail}
        name="Microsoft 365 / Outlook"
        statusLabel={credentialStatus.configured ? "Not connected" : "Not configured"}
        tone="off"
        description="Live — powers Inbox Command. Requires an Entra ID app registration."
      >
        <div className="flex flex-col gap-3">
          {credentialStatus.configured && (
            <a
              href="/api/auth/microsoft/login"
              className="inline-flex min-h-10 w-fit items-center rounded-md bg-accent px-3 font-display text-sm font-medium text-bg hover:bg-accent-strong"
            >
              Connect Microsoft 365
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
      icon={Mail}
      name="Microsoft 365 / Outlook"
      statusLabel="Connected"
      tone="ok"
      description="Live — powers Inbox Command."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 font-data text-xs text-text-muted">
          <span>
            Account: <span className="text-text">{info.accountEmail}</span>
          </span>
          <span>Scopes: {info.scope}</span>
          <span>
            Since:{" "}
            <ClientText
              compute={() => info.connectedAt.toLocaleString()}
              fallback={info.connectedAt.toISOString()}
            />
          </span>
        </div>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="min-h-10 w-fit rounded-md border border-border-strong px-3 text-sm text-text-muted hover:border-status-critical hover:text-status-critical"
          >
            Disconnect
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-status-critical/40 bg-status-critical-dim p-3">
            <span className="text-xs text-status-critical">
              This removes the stored connection. Inbox Command will stop syncing until you
              reconnect.
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
        )}

        {credentialSection}
        <InstructionsToggle steps={steps} />
      </div>
    </IntegrationCard>
  );
}
