import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/crypto";

export type MicrosoftConnectionInfo =
  | { connected: false }
  | { connected: true; accountEmail: string; scope: string; connectedAt: Date };

export async function getMicrosoftConnectionInfo(): Promise<MicrosoftConnectionInfo> {
  const row = await prisma.oAuthToken.findUnique({ where: { provider: "microsoft" } });
  if (!row) return { connected: false };
  return {
    connected: true,
    accountEmail: row.accountEmail,
    scope: row.scope,
    connectedAt: row.updatedAt,
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
  | { configured: true; instanceUrl: string; clientId: string; hasSecret: true };

export async function getHaloPsaCredentialStatus(): Promise<HaloPsaCredentialStatus> {
  const row = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!row) return { configured: false, instanceUrl: "", clientId: "", hasSecret: false };
  return { configured: true, instanceUrl: row.instanceUrl, clientId: row.clientId, hasSecret: true };
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
  | { connected: true; connectedAt: Date };

export async function getNinjaRmmConnectionInfo(): Promise<NinjaRmmConnectionInfo> {
  const row = await prisma.ninjaRmmOAuthToken.findUnique({ where: { id: "ninjarmm" } });
  if (!row) return { connected: false };
  return { connected: true, connectedAt: row.connectedAt };
}

const UNITED_CLOUD_DEFAULT_BASE_URL = "https://api.iplogin.ca/ns-api/v2";
const UNITED_CLOUD_DEFAULT_DOMAIN = "~";

export type UnitedCloudCredentialStatus =
  | { configured: false; apiBaseUrl: string; domain: string; hasSecret: false }
  | { configured: true; apiBaseUrl: string; domain: string; hasSecret: true };

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
  return { configured: true, apiBaseUrl: row.apiBaseUrl, domain: row.domain, hasSecret: true };
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
  | { connected: true; connectedAt: Date; realmId: string };

export async function getQuickBooksConnectionInfo(): Promise<QuickBooksConnectionInfo> {
  const row = await prisma.quickBooksOAuthToken.findUnique({ where: { id: "quickbooks" } });
  if (!row) return { connected: false };
  return { connected: true, connectedAt: row.connectedAt, realmId: row.realmId };
}

const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";

export type AnthropicCredentialStatus =
  | { configured: false; model: string; hasSecret: false }
  | { configured: true; model: string; hasSecret: true };

export async function getAnthropicCredentialStatus(): Promise<AnthropicCredentialStatus> {
  const row = await prisma.anthropicCredential.findUnique({ where: { id: "anthropic" } });
  if (!row) return { configured: false, model: ANTHROPIC_DEFAULT_MODEL, hasSecret: false };
  return { configured: true, model: row.model, hasSecret: true };
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
