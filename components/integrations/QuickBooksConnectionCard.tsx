"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";
import { QuickBooksCredentialForm } from "./QuickBooksCredentialForm";
import { TestConnectionButton } from "./TestConnectionButton";
import { ClientText } from "@/components/ClientText";
import type { QuickBooksCredentialStatus, QuickBooksConnectionInfo } from "@/lib/services/integrations";

export function QuickBooksConnectionCard({
  info,
  redirectUri,
  credentialStatus,
}: {
  info: QuickBooksConnectionInfo;
  redirectUri: string;
  credentialStatus: QuickBooksCredentialStatus;
}) {
  const router = useRouter();
  const steps = [
    "In the Intuit Developer portal (developer.intuit.com), create an app and select the Accounting API scope.",
    `Under Keys & OAuth, set its Redirect URI to: ${redirectUri}`,
    "Copy the Client ID and Client Secret — use the Development keys for Sandbox, Production keys for Production.",
    "Enter the environment, Client ID, and Client Secret below, then click Connect QuickBooks and log in once.",
  ];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(!credentialStatus.configured);
  const [, startTransition] = useTransition();

  async function disconnect() {
    setBusy(true);
    await fetch("/api/auth/quickbooks/disconnect", { method: "POST" });
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
          <QuickBooksCredentialForm status={credentialStatus} />
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-panel-raised p-3">
      <div className="mb-3 text-sm text-text">Add your QuickBooks app credentials to connect.</div>
      <QuickBooksCredentialForm status={credentialStatus} />
    </div>
  );

  if (!info.connected) {
    return (
      <IntegrationCard
        icon={DollarSign}
        name="QuickBooks Online"
        statusLabel={credentialStatus.configured ? "Not connected" : "Not configured"}
        tone="off"
        description="Powers Company Profile financials (revenue, service cost, item margin)."
      >
        <div className="flex flex-col gap-3">
          {credentialStatus.configured && (
            <a
              href="/api/auth/quickbooks/login"
              className="inline-flex min-h-10 w-fit items-center rounded-md bg-accent px-3 font-display text-sm font-medium text-bg hover:bg-accent-strong"
            >
              Connect QuickBooks
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
      icon={DollarSign}
      name="QuickBooks Online"
      statusLabel={info.healthy ? "Connected" : "Disconnected"}
      tone={info.healthy ? "ok" : "error"}
      description={info.healthy ? "Live — powers Company Profile financials." : `Connection issue: ${info.healthError}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 font-data text-xs text-text-muted">
          <span>Company (realm) ID: {info.realmId}</span>
          <span>
            Since:{" "}
            <ClientText
              compute={() => info.connectedAt.toLocaleString()}
              fallback={info.connectedAt.toISOString()}
            />
          </span>
        </div>

        <TestConnectionButton testUrl="/api/integrations/quickbooks/test" />

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
              This removes the stored connection. Company Profile financials will stop syncing
              until you reconnect.
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
