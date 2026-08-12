"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Server, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";
import { NinjaRmmCredentialForm } from "./NinjaRmmCredentialForm";
import { ClientText } from "@/components/ClientText";
import type { NinjaRmmCredentialStatus, NinjaRmmConnectionInfo } from "@/lib/services/integrations";

const VENDOR_NOTE =
  'Menu labels vary by plan/version — search your admin panel for "API" or "Integrations" if these don\'t match exactly.';

export function NinjaRmmConnectionCard({
  info,
  redirectUri,
  credentialStatus,
}: {
  info: NinjaRmmConnectionInfo;
  redirectUri: string;
  credentialStatus: NinjaRmmCredentialStatus;
}) {
  const router = useRouter();
  const steps = [
    "In NinjaRMM, go to Administration → Apps → API → Client app IDs and create (or edit) an API application.",
    `Set its Redirect URI to: ${redirectUri} — the platform-preset default won't work.`,
    "Under Scopes, check only \"Monitoring\" — read-only access to devices and organization structure. This app never modifies devices.",
    "Under Allowed grant types, check \"Refresh token\" — needed so this app can stay connected without you having to log in again every hour.",
    "Note the Client ID and your region's API base URL (e.g. app, eu, oc, or ca.ninjarmm.com). Most accounts don't get a Client Secret for this app type — that's expected, leave it blank below.",
    "Enter the API base URL and Client ID below, then click Connect NinjaRMM and log in once.",
  ];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(!credentialStatus.configured);
  const [, startTransition] = useTransition();

  async function disconnect() {
    setBusy(true);
    await fetch("/api/auth/ninjarmm/disconnect", { method: "POST" });
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
          <NinjaRmmCredentialForm status={credentialStatus} />
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-panel-raised p-3">
      <div className="mb-3 text-sm text-text">Add your NinjaRMM API application credentials to connect.</div>
      <NinjaRmmCredentialForm status={credentialStatus} />
    </div>
  );

  if (!info.connected) {
    return (
      <IntegrationCard
        icon={Server}
        name="NinjaRMM"
        statusLabel={credentialStatus.configured ? "Not connected" : "Not configured"}
        tone="off"
        description="Powers Device Health. Requires a NinjaRMM API application with an Authorization Code grant."
      >
        <div className="flex flex-col gap-3">
          {credentialStatus.configured && (
            <a
              href="/api/auth/ninjarmm/login"
              className="inline-flex min-h-10 w-fit items-center rounded-md bg-accent px-3 font-display text-sm font-medium text-bg hover:bg-accent-strong"
            >
              Connect NinjaRMM
            </a>
          )}
          {credentialSection}
          <InstructionsToggle steps={steps} note={VENDOR_NOTE} />
        </div>
      </IntegrationCard>
    );
  }

  return (
    <IntegrationCard
      icon={Server}
      name="NinjaRMM"
      statusLabel="Connected"
      tone="ok"
      description="Live — powers Device Health."
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
              This removes the stored connection. Device Health will stop syncing until you
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
        <InstructionsToggle steps={steps} note={VENDOR_NOTE} />
      </div>
    </IntegrationCard>
  );
}
