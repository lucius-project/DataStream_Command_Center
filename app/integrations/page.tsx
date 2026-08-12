import type { ReactNode } from "react";
import {
  getMicrosoftConnectionInfo,
  getMicrosoftCredentialStatus,
  getHaloPsaCredentialStatus,
  getUnitedCloudCredentialStatus,
  getNinjaRmmCredentialStatus,
  getNinjaRmmConnectionInfo,
  getQuickBooksCredentialStatus,
  getQuickBooksConnectionInfo,
  getAnthropicCredentialStatus,
} from "@/lib/services/integrations";
import { MicrosoftConnectionCard } from "@/components/integrations/MicrosoftConnectionCard";
import { HaloPsaConnectionCard } from "@/components/integrations/HaloPsaConnectionCard";
import { UnitedCloudConnectionCard } from "@/components/integrations/UnitedCloudConnectionCard";
import { NinjaRmmConnectionCard } from "@/components/integrations/NinjaRmmConnectionCard";
import { QuickBooksConnectionCard } from "@/components/integrations/QuickBooksConnectionCard";
import { AnthropicConnectionCard } from "@/components/integrations/AnthropicConnectionCard";
import { KeapIntegrationCard } from "@/components/integrations/KeapIntegrationCard";

export default async function IntegrationsPage() {
  const [
    microsoft,
    credentialStatus,
    haloPsaStatus,
    unitedCloudStatus,
    ninjaRmmStatus,
    ninjaRmmInfo,
    quickBooksStatus,
    quickBooksInfo,
    anthropicStatus,
  ] = await Promise.all([
    getMicrosoftConnectionInfo(),
    getMicrosoftCredentialStatus(),
    getHaloPsaCredentialStatus(),
    getUnitedCloudCredentialStatus(),
    getNinjaRmmCredentialStatus(),
    getNinjaRmmConnectionInfo(),
    getQuickBooksCredentialStatus(),
    getQuickBooksConnectionInfo(),
    getAnthropicCredentialStatus(),
  ]);
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI || "http://localhost:3001/api/auth/microsoft/callback";
  const ninjaRmmRedirectUri =
    process.env.NINJARMM_REDIRECT_URI || "http://localhost:3001/api/auth/ninjarmm/callback";
  const quickBooksRedirectUri =
    process.env.QUICKBOOKS_REDIRECT_URI || "http://localhost:3001/api/auth/quickbooks/callback";

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="font-display text-2xl font-semibold text-text">Integrations</h1>
      <p className="mt-1 text-sm text-text-muted">
        Every connection this app uses, and whether it&apos;s live or mocked.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <IntegrationCategory title="Identity & Email">
          <MicrosoftConnectionCard info={microsoft} redirectUri={redirectUri} credentialStatus={credentialStatus} />
        </IntegrationCategory>

        <IntegrationCategory title="Service Delivery">
          <HaloPsaConnectionCard status={haloPsaStatus} />
          <NinjaRmmConnectionCard
            info={ninjaRmmInfo}
            redirectUri={ninjaRmmRedirectUri}
            credentialStatus={ninjaRmmStatus}
          />
        </IntegrationCategory>

        <IntegrationCategory title="Telephony">
          <UnitedCloudConnectionCard status={unitedCloudStatus} />
        </IntegrationCategory>

        <IntegrationCategory title="Finance">
          <QuickBooksConnectionCard
            info={quickBooksInfo}
            redirectUri={quickBooksRedirectUri}
            credentialStatus={quickBooksStatus}
          />
        </IntegrationCategory>

        <IntegrationCategory title="AI">
          <AnthropicConnectionCard status={anthropicStatus} />
        </IntegrationCategory>

        <IntegrationCategory title="CRM & Marketing">
          <KeapIntegrationCard />
        </IntegrationCategory>
      </div>
    </div>
  );
}

function IntegrationCategory({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-sm font-medium text-text-muted">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
