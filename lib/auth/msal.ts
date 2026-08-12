import {
  ConfidentialClientApplication,
  type Configuration,
  type ICachePlugin,
  type TokenCacheContext,
  type AccountInfo,
} from "@azure/msal-node";
import { prisma } from "@/lib/prisma";
import { encryptToken, decryptToken } from "@/lib/crypto";

const PROVIDER = "microsoft";

// Resource scopes requested for silent/interactive token acquisition.
// No Mail.Send — replies are drafts only, the CEO sends them manually.
export const GRAPH_SCOPES = ["Mail.Read", "Mail.ReadWrite"];

// Requested only on the initial authorization request, so MSAL's cache
// picks up a refresh token to persist for future silent acquisition.
const LOGIN_SCOPES = [...GRAPH_SCOPES, "offline_access"];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. See .env.example.`);
  }
  return value;
}

// Credentials configured on the Integrations page (encrypted in the DB)
// take precedence; .env is the fallback for anyone who prefers that.
async function resolveMicrosoftCredentials(): Promise<{
  clientId: string;
  tenantId: string;
  clientSecret: string;
}> {
  const row = await prisma.microsoftAppCredential.findUnique({ where: { id: "microsoft" } });
  if (row) {
    return {
      clientId: row.clientId,
      tenantId: row.tenantId,
      clientSecret: decryptToken(row.encryptedClientSecret),
    };
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !tenantId || !clientSecret) {
    throw new Error(
      "Microsoft app credentials aren't configured yet. Add them on the Integrations page.",
    );
  }
  return { clientId, tenantId, clientSecret };
}

function buildCachePlugin(): ICachePlugin {
  return {
    beforeCacheAccess: async (context: TokenCacheContext) => {
      const row = await prisma.oAuthToken.findUnique({ where: { provider: PROVIDER } });
      if (row) {
        context.tokenCache.deserialize(decryptToken(row.encryptedCache));
      }
    },
    afterCacheAccess: async (context: TokenCacheContext) => {
      if (!context.cacheHasChanged) return;
      const encryptedCache = encryptToken(context.tokenCache.serialize());
      const existing = await prisma.oAuthToken.findUnique({ where: { provider: PROVIDER } });
      await prisma.oAuthToken.upsert({
        where: { provider: PROVIDER },
        update: { encryptedCache },
        create: {
          provider: PROVIDER,
          encryptedCache,
          accountEmail: existing?.accountEmail ?? "",
          scope: GRAPH_SCOPES.join(" "),
        },
      });
    },
  };
}

async function buildMsalConfig(): Promise<Configuration> {
  const { clientId, tenantId, clientSecret } = await resolveMicrosoftCredentials();
  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
    cache: { cachePlugin: buildCachePlugin() },
  };
}

export async function getMsalClient(): Promise<ConfidentialClientApplication> {
  return new ConfidentialClientApplication(await buildMsalConfig());
}

export function getRedirectUri(): string {
  return requiredEnv("MICROSOFT_REDIRECT_URI");
}

export async function getAuthCodeUrl(state: string): Promise<string> {
  const msal = await getMsalClient();
  return msal.getAuthCodeUrl({
    scopes: LOGIN_SCOPES,
    redirectUri: getRedirectUri(),
    state,
  });
}

export async function handleAuthCallback(code: string): Promise<AccountInfo> {
  const msal = await getMsalClient();
  const result = await msal.acquireTokenByCode({
    code,
    scopes: LOGIN_SCOPES,
    redirectUri: getRedirectUri(),
  });
  if (!result?.account) {
    throw new Error("Microsoft sign-in did not return an account.");
  }
  try {
    await prisma.oAuthToken.update({
      where: { provider: PROVIDER },
      data: { accountEmail: result.account.username },
    });
  } catch (err) {
    throw new Error(
      `Token exchange succeeded but saving the connection record failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return result.account;
}

export async function isConnected(): Promise<boolean> {
  const row = await prisma.oAuthToken.findUnique({ where: { provider: PROVIDER } });
  return Boolean(row);
}

export async function getConnectedAccountEmail(): Promise<string | null> {
  const row = await prisma.oAuthToken.findUnique({ where: { provider: PROVIDER } });
  return row?.accountEmail || null;
}

export async function getGraphAccessToken(): Promise<string> {
  const msal = await getMsalClient();
  const accounts = await msal.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    throw new Error("Not connected to Microsoft 365. Visit /api/auth/microsoft/login.");
  }
  const result = await msal.acquireTokenSilent({
    account: accounts[0],
    scopes: GRAPH_SCOPES,
  });
  if (!result) {
    throw new Error("Failed to silently acquire a Microsoft Graph access token.");
  }
  return result.accessToken;
}
