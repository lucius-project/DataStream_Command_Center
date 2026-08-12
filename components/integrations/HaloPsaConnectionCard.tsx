"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ticket, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";
import { HaloPsaCredentialForm } from "./HaloPsaCredentialForm";
import type { HaloPsaCredentialStatus } from "@/lib/services/integrations";

const VENDOR_NOTE =
  'Menu labels vary by plan/version — search your admin panel for "API" or "Integrations" if these don\'t match exactly.';

const STEPS = [
  "In HaloPSA, go to Configuration → Integrations → HaloPSA API (some versions call this API Applications).",
  "Create a new API application and note the Client ID and Client Secret it generates.",
  "Note your HaloPSA instance URL (e.g. https://yourcompany.halopsa.com).",
  "Enter the instance URL, Client ID, and Client Secret below, then save — it tests the connection immediately.",
];

export function HaloPsaConnectionCard({ status }: { status: HaloPsaCredentialStatus }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(!status.configured);

  async function disconnect() {
    setBusy(true);
    await fetch("/api/integrations/halopsa/config", { method: "DELETE" });
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
          <HaloPsaCredentialForm status={status} />
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-panel-raised p-3">
      <div className="mb-3 text-sm text-text">Add your HaloPSA API application credentials to connect.</div>
      <HaloPsaCredentialForm status={status} />
    </div>
  );

  return (
    <IntegrationCard
      icon={Ticket}
      name="HaloPSA"
      statusLabel={status.configured ? "Connected" : "Mocked"}
      tone={status.configured ? "ok" : "mocked"}
      description={
        status.configured
          ? "Live — powers Operations (tickets, load, attention flags)."
          : "Powers Operations (tickets, load, attention flags). Seeded fixture data until connected."
      }
    >
      <div className="flex flex-col gap-3">
        {status.configured && (
          <div className="flex flex-col gap-1 font-data text-xs text-text-muted">
            <span>
              Instance: <span className="text-text">{status.instanceUrl}</span>
            </span>
            <span>Client ID: {status.clientId}</span>
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
                This removes the stored credentials. Operations will fall back to mocked data
                until reconnected.
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
