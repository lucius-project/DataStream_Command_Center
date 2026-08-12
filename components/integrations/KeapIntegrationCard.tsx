"use client";

import { Users } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import { InstructionsToggle } from "./InstructionsToggle";

const VENDOR_NOTE =
  'Menu labels vary by plan/version — search your admin panel for "API" or "Integrations" if these don\'t match exactly.';

const STEPS = [
  "In the Keap Developer Portal (or Keap admin → Settings → Application), create an app and generate API credentials.",
  "Note the Client ID and Client Secret (OAuth), or your legacy API key if you use that instead.",
  "Nothing to enter yet — this integration isn't wired to any screen in Phase 1. These will go into .env as KEAP_CLIENT_ID / KEAP_CLIENT_SECRET later.",
];

export function KeapIntegrationCard() {
  return (
    <IntegrationCard
      icon={Users}
      name="Keap"
      statusLabel="Mocked"
      tone="mocked"
      description="Reserved for the future CRM and Marketing Automation modules. Not wired to any screen yet."
    >
      <InstructionsToggle steps={STEPS} note={VENDOR_NOTE} />
    </IntegrationCard>
  );
}
