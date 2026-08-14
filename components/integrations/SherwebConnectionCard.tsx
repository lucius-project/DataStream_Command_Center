"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, ChevronDown, ChevronUp } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";
import { SherwebCredentialForm } from "./SherwebCredentialForm";
import { TestConnectionButton } from "./TestConnectionButton";
import type { SherwebCredentialStatus } from "@/lib/services/integrations";

const VENDOR_NOTE =
  "Menu labels vary by portal version — look for \"Security\" or \"APIs\" in the Sherweb partner portal (cumulus.sherweb.com) if these don't match exactly.";

const STEPS = [
  "In the Sherweb partner portal (cumulus.sherweb.com), go to Security > APIs and add a new application.",
  "Note the Client ID, Client Secret, and Subscription Key (each shown once) generated for it.",
  "Enter all three below, then save — it tests the connection immediately.",
];

// Vendor Licensing Phase 1 — credential plumbing only. No sync yet:
// Phase 1b (customers/subscriptions/renewal-date sync) depends on live
// discovery against these credentials once they're saved, same "verify
// before designing a field mapping" discipline as every other
// integration in this app.
export function SherwebConnectionCard({ status }: { status: SherwebCredentialStatus }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(!status.configured);

  async function disconnect() {
    setBusy(true);
    await fetch("/api/integrations/sherweb/config", { method: "DELETE" });
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
          <SherwebCredentialForm status={status} />
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-md border border-border bg-panel-raised p-3">
      <div className="mb-3 text-sm text-text">Add your Sherweb API credentials to connect.</div>
      <SherwebCredentialForm status={status} />
    </div>
  );

  return (
    <IntegrationCard
      icon={Receipt}
      name="Sherweb"
      statusLabel={status.configured ? (status.healthy ? "Connected" : "Disconnected") : "Not connected"}
      tone={status.configured ? (status.healthy ? "ok" : "error") : "off"}
      description={
        status.configured
          ? status.healthy
            ? "Live — credentials verified. License/renewal sync is not built yet."
            : `Connection issue: ${status.healthError}`
          : "M365, Keeper, and Nerdio licensing. Not connected."
      }
    >
      <div className="flex flex-col gap-3">
        {status.configured && (
          <div className="flex flex-col gap-1 font-data text-xs text-text-muted">
            <span>
              Client ID: <span className="text-text">{status.clientId}</span>
            </span>
          </div>
        )}

        {status.configured && <TestConnectionButton testUrl="/api/integrations/sherweb/test" />}

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
              <span className="text-xs text-status-critical">This removes the stored credentials.</span>
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
