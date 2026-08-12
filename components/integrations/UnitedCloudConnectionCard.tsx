"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";
import { UnitedCloudCredentialForm } from "./UnitedCloudCredentialForm";
import type { UnitedCloudCredentialStatus } from "@/lib/services/integrations";

const VENDOR_NOTE =
  'Menu labels vary by plan/version — search your admin portal for "API" or "API Keys" if these don\'t match exactly.';

const STEPS = [
  "In the United Cloud (Hosted PBX) admin portal, go to API Keys and create a new key.",
  "Check \"Read Only\" when creating it — this app only ever reads call history, never places, transfers, holds, or disconnects calls.",
  "Note the key value (shown once) and your domain (use \"~\" for your own domain unless told otherwise).",
  "Enter the API base URL, domain, and key below, then save — it tests the connection immediately.",
];

export function UnitedCloudConnectionCard({ status }: { status: UnitedCloudCredentialStatus }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(!status.configured);

  async function disconnect() {
    setBusy(true);
    await fetch("/api/integrations/unitedcloud/config", { method: "DELETE" });
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
          <UnitedCloudCredentialForm status={status} />
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-panel-raised p-3">
      <div className="mb-3 text-sm text-text">Add your United Cloud API key to connect.</div>
      <UnitedCloudCredentialForm status={status} />
    </div>
  );

  return (
    <IntegrationCard
      icon={Phone}
      name="United Cloud"
      statusLabel={status.configured ? "Connected" : "Not connected"}
      tone={status.configured ? "ok" : "off"}
      description={
        status.configured
          ? "Live — powers Call Activity."
          : "Powers Call Activity. Not connected — Call Activity stays empty until it is."
      }
    >
      <div className="flex flex-col gap-3">
        {status.configured && (
          <div className="flex flex-col gap-1 font-data text-xs text-text-muted">
            <span>
              API base URL: <span className="text-text">{status.apiBaseUrl}</span>
            </span>
            <span>Domain: {status.domain}</span>
          </div>
        )}

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
                This removes the stored API key. Call Activity will stop syncing until
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
