import { prisma } from "@/lib/prisma";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { getGraphAccessToken } from "@/lib/auth/msal";
import { testGraphConnection } from "@/lib/integrations/graph";
import { fetchNinjaOrganizations } from "@/lib/integrations/ninjaRmm";
import { fetchCustomers as fetchQuickBooksCustomers } from "@/lib/integrations/quickbooks";
import { getHaloAccessToken } from "@/lib/integrations/halopsa";
import { testUnitedCloudConnection } from "@/lib/integrations/unitedCloud";
import { testAnthropicConnection } from "@/lib/integrations/anthropic";
import { testSherwebConnection } from "@/lib/integrations/sherweb";

export type HealthResult = { healthy: true } | { healthy: false; healthError: string };

// Shared by every status/connection-info function below — a live proof
// the vendor's API still accepts these credentials, not just that a
// row exists in the database (see this file's own history: HaloPSA and
// NinjaRMM both showed "Connected" here while actually 401ing on real
// requests elsewhere in the app). Never throws — a health-check failure
// must never break /integrations' own render. Timeout guards against one
// dead vendor stalling the whole page.
async function runHealthCheck(fn: () => Promise<unknown>, timeoutMs = 8000): Promise<HealthResult> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Health check timed out.")), timeoutMs)),
    ]);
    return { healthy: true };
  } catch (err) {
    return { healthy: false, healthError: err instanceof Error ? err.message : "Connection test failed." };
  }
}

export type MicrosoftConnectionInfo =
  | { connected: false }
  | ({ connected: true; accountEmail: string; scope: string; connectedAt: Date } & HealthResult);

export async function getMicrosoftConnectionInfo(): Promise<MicrosoftConnectionInfo> {
  const row = await prisma.oAuthToken.findUnique({ where: { provider: "microsoft" } });
  if (!row) return { connected: false };
  const health = await runHealthCheck(async () => testGraphConnection(await getGraphAccessToken()));
  return {
    connected: true,
    accountEmail: row.accountEmail,
    scope: row.scope,
    connectedAt: row.updatedAt,
    ...health,
  };
}

export type MicrosoftCredentialStatus = {
  configured: boolean;
  clientId: string;
  tenantId: string;
  hasSecret: boolean;
  source: "database" | "env" | "none";
};

export async function getMicrosoftCredentialStatus(): Promise<MicrosoftCredentialStatus> {
  const row = await prisma.microsoftAppCredential.findUnique({ where: { id: "microsoft" } });
  if (row) {
    return { configured: true, clientId: row.clientId, tenantId: row.tenantId, hasSecret: true, source: "database" };
  }

  const envClientId = process.env.MICROSOFT_CLIENT_ID;
  const envTenantId = process.env.MICROSOFT_TENANT_ID;
  const envSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (envClientId && envTenantId && envSecret) {
    return { configured: true, clientId: envClientId, tenantId: envTenantId, hasSecret: true, source: "env" };
  }

  return {
    configured: false,
    clientId: envClientId ?? "",
    tenantId: envTenantId ?? "",
    hasSecret: Boolean(envSecret),
    source: "none",
  };
}

export async function saveMicrosoftAppCredential(input: {
  clientId: string;
  tenantId: string;
  clientSecret?: string;
}): Promise<void> {
  const existing = await prisma.microsoftAppCredential.findUnique({ where: { id: "microsoft" } });
  const encryptedClientSecret = input.clientSecret
    ? encryptToken(input.clientSecret)
    : existing?.encryptedClientSecret;

  if (!encryptedClientSecret) {
    throw new Error("Client secret is required.");
  }

  await prisma.microsoftAppCredential.upsert({
    where: { id: "microsoft" },
    update: { clientId: input.clientId, tenantId: input.tenantId, encryptedClientSecret },
    create: { id: "microsoft", clientId: input.clientId, tenantId: input.tenantId, encryptedClientSecret },
  });
}

export type HaloPsaCredentialStatus =
  | { configured: false; instanceUrl: string; clientId: string; hasSecret: false }
  | ({ configured: true; instanceUrl: string; clientId: string; hasSecret: true } & HealthResult);

export async function getHaloPsaCredentialStatus(): Promise<HaloPsaCredentialStatus> {
  const row = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!row) return { configured: false, instanceUrl: "", clientId: "", hasSecret: false };
  const health = await runHealthCheck(() =>
    getHaloAccessToken(row.instanceUrl, row.clientId, decryptToken(row.encryptedClientSecret)),
  );
  return { configured: true, instanceUrl: row.instanceUrl, clientId: row.clientId, hasSecret: true, ...health };
}

export async function saveHaloPsaCredential(input: {
  instanceUrl: string;
  clientId: string;
  clientSecret?: string;
}): Promise<void> {
  const existing = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  const encryptedClientSecret = input.clientSecret
    ? encryptToken(input.clientSecret)
    : existing?.encryptedClientSecret;

  if (!encryptedClientSecret) {
    throw new Error("Client secret is required.");
  }

  await prisma.haloPsaCredential.upsert({
    where: { id: "halopsa" },
    update: { instanceUrl: input.instanceUrl, clientId: input.clientId, encryptedClientSecret },
    create: { id: "halopsa", instanceUrl: input.instanceUrl, clientId: input.clientId, encryptedClientSecret },
  });
}

export async function removeHaloPsaCredential(): Promise<void> {
  await prisma.haloPsaCredential.deleteMany({ where: { id: "halopsa" } });
}

const NINJARMM_DEFAULT_BASE_URL = "https://ca.ninjarmm.com";

// hasSecret is informational only — NinjaRMM's authorization-code apps
// on this account are PKCE public clients (confirmed: the app-creation
// wizard has no Client Secret field at all), so a secret isn't required
// to connect. Kept optional in case some accounts do get a
// confidential (secret-bearing) app type.
export type NinjaRmmCredentialStatus = {
  configured: boolean;
  apiBaseUrl: string;
  clientId: string;
  hasSecret: boolean;
};

export async function getNinjaRmmCredentialStatus(): Promise<NinjaRmmCredentialStatus> {
  const row = await prisma.ninjaRmmCredential.findUnique({ where: { id: "ninjarmm" } });
  if (!row) return { configured: false, apiBaseUrl: NINJARMM_DEFAULT_BASE_URL, clientId: "", hasSecret: false };
  return { configured: true, apiBaseUrl: row.apiBaseUrl, clientId: row.clientId, hasSecret: Boolean(row.encryptedClientSecret) };
}

export async function saveNinjaRmmCredential(input: {
  apiBaseUrl: string;
  clientId: string;
  clientSecret?: string;
}): Promise<void> {
  const existing = await prisma.ninjaRmmCredential.findUnique({ where: { id: "ninjarmm" } });
  const encryptedClientSecret = input.clientSecret
    ? encryptToken(input.clientSecret)
    : (existing?.encryptedClientSecret ?? null);

  await prisma.ninjaRmmCredential.upsert({
    where: { id: "ninjarmm" },
    update: { apiBaseUrl: input.apiBaseUrl, clientId: input.clientId, encryptedClientSecret },
    create: { id: "ninjarmm", apiBaseUrl: input.apiBaseUrl, clientId: input.clientId, encryptedClientSecret },
  });
}

// The per-login connection (OAuth2 authorization-code result), separate
// from NinjaRmmCredential (the app registration) — same split as
// getMicrosoftConnectionInfo/MicrosoftAppCredential.
export type NinjaRmmConnectionInfo =
  | { connected: false }
  | ({ connected: true; connectedAt: Date } & HealthResult);

export async function getNinjaRmmConnectionInfo(): Promise<NinjaRmmConnectionInfo> {
  const row = await prisma.ninjaRmmOAuthToken.findUnique({ where: { id: "ninjarmm" } });
  if (!row) return { connected: false };
  // fetchNinjaOrganizations already refreshes/validates the token and
  // makes a real request — the 401 that motivated this whole feature
  // came from a real data request with a token already in hand, not
  // from token refresh itself, so the health check needs a real request
  // too (this is the cheapest one this integration already has).
  const health = await runHealthCheck(() => fetchNinjaOrganizations());
  return { connected: true, connectedAt: row.connectedAt, ...health };
}

const UNITED_CLOUD_DEFAULT_BASE_URL = "https://api.iplogin.ca/ns-api/v2";
const UNITED_CLOUD_DEFAULT_DOMAIN = "~";

export type UnitedCloudCredentialStatus =
  | { configured: false; apiBaseUrl: string; domain: string; hasSecret: false }
  | ({ configured: true; apiBaseUrl: string; domain: string; hasSecret: true } & HealthResult);

export async function getUnitedCloudCredentialStatus(): Promise<UnitedCloudCredentialStatus> {
  const row = await prisma.unitedCloudCredential.findUnique({ where: { id: "unitedcloud" } });
  if (!row) {
    return {
      configured: false,
      apiBaseUrl: UNITED_CLOUD_DEFAULT_BASE_URL,
      domain: UNITED_CLOUD_DEFAULT_DOMAIN,
      hasSecret: false,
    };
  }
  const health = await runHealthCheck(() => testUnitedCloudConnection(row.apiBaseUrl, decryptToken(row.encryptedApiKey)));
  return { configured: true, apiBaseUrl: row.apiBaseUrl, domain: row.domain, hasSecret: true, ...health };
}

export async function saveUnitedCloudCredential(input: {
  apiBaseUrl: string;
  domain: string;
  apiKey?: string;
}): Promise<void> {
  const existing = await prisma.unitedCloudCredential.findUnique({ where: { id: "unitedcloud" } });
  const encryptedApiKey = input.apiKey ? encryptToken(input.apiKey) : existing?.encryptedApiKey;

  if (!encryptedApiKey) {
    throw new Error("API key is required.");
  }

  await prisma.unitedCloudCredential.upsert({
    where: { id: "unitedcloud" },
    update: { apiBaseUrl: input.apiBaseUrl, domain: input.domain, encryptedApiKey },
    create: { id: "unitedcloud", apiBaseUrl: input.apiBaseUrl, domain: input.domain, encryptedApiKey },
  });
}

export async function removeUnitedCloudCredential(): Promise<void> {
  await prisma.unitedCloudCredential.deleteMany({ where: { id: "unitedcloud" } });
}

export type QuickBooksCredentialStatus = {
  configured: boolean;
  environment: string;
  clientId: string;
  hasSecret: boolean;
};

export async function getQuickBooksCredentialStatus(): Promise<QuickBooksCredentialStatus> {
  const row = await prisma.quickBooksCredential.findUnique({ where: { id: "quickbooks" } });
  if (!row) return { configured: false, environment: "sandbox", clientId: "", hasSecret: false };
  return { configured: true, environment: row.environment, clientId: row.clientId, hasSecret: true };
}

export async function saveQuickBooksAppCredential(input: {
  environment: string;
  clientId: string;
  clientSecret?: string;
}): Promise<void> {
  const existing = await prisma.quickBooksCredential.findUnique({ where: { id: "quickbooks" } });
  const encryptedClientSecret = input.clientSecret
    ? encryptToken(input.clientSecret)
    : existing?.encryptedClientSecret;

  if (!encryptedClientSecret) {
    throw new Error("Client secret is required.");
  }

  await prisma.quickBooksCredential.upsert({
    where: { id: "quickbooks" },
    update: { environment: input.environment, clientId: input.clientId, encryptedClientSecret },
    create: { id: "quickbooks", environment: input.environment, clientId: input.clientId, encryptedClientSecret },
  });
}

// The per-connection OAuth result, separate from QuickBooksCredential
// (the app registration) — same split as getMicrosoftConnectionInfo/
// MicrosoftAppCredential.
export type QuickBooksConnectionInfo =
  | { connected: false }
  | ({ connected: true; connectedAt: Date; realmId: string } & HealthResult);

export async function getQuickBooksConnectionInfo(): Promise<QuickBooksConnectionInfo> {
  const row = await prisma.quickBooksOAuthToken.findUnique({ where: { id: "quickbooks" } });
  if (!row) return { connected: false };
  const health = await runHealthCheck(() => fetchQuickBooksCustomers());
  return { connected: true, connectedAt: row.connectedAt, realmId: row.realmId, ...health };
}

const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";

export type AnthropicCredentialStatus =
  | { configured: false; model: string; hasSecret: false }
  | ({ configured: true; model: string; hasSecret: true } & HealthResult);

export async function getAnthropicCredentialStatus(): Promise<AnthropicCredentialStatus> {
  const row = await prisma.anthropicCredential.findUnique({ where: { id: "anthropic" } });
  if (!row) return { configured: false, model: ANTHROPIC_DEFAULT_MODEL, hasSecret: false };
  const health = await runHealthCheck(() => testAnthropicConnection(decryptToken(row.encryptedApiKey)));
  return { configured: true, model: row.model, hasSecret: true, ...health };
}

export async function saveAnthropicCredential(input: { model?: string; apiKey?: string }): Promise<void> {
  const existing = await prisma.anthropicCredential.findUnique({ where: { id: "anthropic" } });
  const encryptedApiKey = input.apiKey ? encryptToken(input.apiKey) : existing?.encryptedApiKey;

  if (!encryptedApiKey) {
    throw new Error("API key is required.");
  }

  const model = input.model?.trim() || existing?.model || ANTHROPIC_DEFAULT_MODEL;

  await prisma.anthropicCredential.upsert({
    where: { id: "anthropic" },
    update: { model, encryptedApiKey },
    create: { id: "anthropic", model, encryptedApiKey },
  });
}

export async function removeAnthropicCredential(): Promise<void> {
  await prisma.anthropicCredential.deleteMany({ where: { id: "anthropic" } });
}

export type SherwebCredentialStatus =
  | { configured: false; clientId: string; hasSecret: false }
  | ({ configured: true; clientId: string; hasSecret: true } & HealthResult);

export async function getSherwebCredentialStatus(): Promise<SherwebCredentialStatus> {
  const row = await prisma.sherwebCredential.findUnique({ where: { id: "sherweb" } });
  if (!row) return { configured: false, clientId: "", hasSecret: false };
  const health = await runHealthCheck(() => testSherwebConnection(row.clientId, decryptToken(row.encryptedClientSecret)));
  return { configured: true, clientId: row.clientId, hasSecret: true, ...health };
}

export async function saveSherwebCredential(input: {
  clientId: string;
  clientSecret?: string;
  subscriptionKey?: string;
}): Promise<void> {
  const existing = await prisma.sherwebCredential.findUnique({ where: { id: "sherweb" } });
  const encryptedClientSecret = input.clientSecret ? encryptToken(input.clientSecret) : existing?.encryptedClientSecret;
  const encryptedSubscriptionKey = input.subscriptionKey
    ? encryptToken(input.subscriptionKey)
    : existing?.encryptedSubscriptionKey;

  if (!encryptedClientSecret) {
    throw new Error("Client Secret is required.");
  }
  if (!encryptedSubscriptionKey) {
    throw new Error("Subscription Key is required.");
  }

  await prisma.sherwebCredential.upsert({
    where: { id: "sherweb" },
    update: { clientId: input.clientId, encryptedClientSecret, encryptedSubscriptionKey },
    create: { id: "sherweb", clientId: input.clientId, encryptedClientSecret, encryptedSubscriptionKey },
  });
}

export async function removeSherwebCredential(): Promise<void> {
  await prisma.sherwebCredential.deleteMany({ where: { id: "sherweb" } });
}
