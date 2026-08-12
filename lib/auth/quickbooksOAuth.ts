// QuickBooks Online OAuth2 authorization-code flow — same role
// lib/auth/msal.ts and lib/auth/ninjaRmmOAuth.ts play for their
// providers, hand-rolled since this isn't MSAL and isn't PKCE (Intuit
// apps are real confidential clients — a client secret is issued, unlike
// NinjaRMM on this account).
//
// Endpoints confirmed via search + Intuit's well-established, stable
// public OAuth2 behavior (their interactive docs site is JS-rendered and
// didn't return content via fetch, so this is corroborated rather than
// directly quoted — flagged honestly, same as every other adapter here):
//   authorize: https://appcenter.intuit.com/connect/oauth2
//   token:     https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
//              (HTTP Basic auth: client_id:client_secret, NOT in the body)
// Access tokens last 1 hour. Refresh tokens roll on a 100-day window and
// — unlike NinjaRMM's, which stays the same call to call — QuickBooks
// issues a NEW refresh token on every refresh; the old one must be
// discarded, not just the new one stored.
//
// The accounting API's base URL (sandbox vs production) depends on
// QuickBooksCredential.environment — that's lib/integrations/quickbooks.ts's
// concern, not this file's; auth endpoints are the same for both.

import { prisma } from "@/lib/prisma";
import { encryptToken, decryptToken } from "@/lib/crypto";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";
const REFRESH_SAFETY_MARGIN_MS = 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. See .env.example.`);
  }
  return value;
}

async function getCredential() {
  const row = await prisma.quickBooksCredential.findUnique({ where: { id: "quickbooks" } });
  if (!row) {
    throw new Error("QuickBooks app credentials aren't configured yet. Add them on the Integrations page.");
  }
  return row;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function getRedirectUri(): string {
  return requiredEnv("QUICKBOOKS_REDIRECT_URI");
}

export async function getAuthorizeUrl(state: string): Promise<string> {
  const credential = await getCredential();
  const params = new URLSearchParams({
    client_id: credential.clientId,
    response_type: "code",
    scope: SCOPE,
    redirect_uri: getRedirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const credential = await getCredential();
  const clientSecret = decryptToken(credential.encryptedClientSecret);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuthHeader(credential.clientId, clientSecret),
    },
    body,
  });
  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    throw new Error(`QuickBooks token request failed (${res.status}): ${responseBody.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

async function storeTokens(data: TokenResponse, realmId: string): Promise<void> {
  if (!data.access_token || !data.refresh_token) {
    throw new Error("QuickBooks token response did not include an access_token/refresh_token.");
  }
  const expiresInSeconds = data.expires_in ?? 3600;
  const accessTokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  await prisma.quickBooksOAuthToken.upsert({
    where: { id: "quickbooks" },
    update: {
      realmId,
      encryptedAccessToken: encryptToken(data.access_token),
      encryptedRefreshToken: encryptToken(data.refresh_token),
      accessTokenExpiresAt,
    },
    create: {
      id: "quickbooks",
      realmId,
      encryptedAccessToken: encryptToken(data.access_token),
      encryptedRefreshToken: encryptToken(data.refresh_token),
      accessTokenExpiresAt,
    },
  });
}

export async function exchangeCodeForTokens(code: string, realmId: string): Promise<void> {
  const data = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    }),
  );
  await storeTokens(data, realmId);
}

async function refreshAccessToken(): Promise<void> {
  const existing = await prisma.quickBooksOAuthToken.findUnique({ where: { id: "quickbooks" } });
  if (!existing) {
    throw new Error("Not connected to QuickBooks. Visit /api/auth/quickbooks/login.");
  }
  const data = await requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptToken(existing.encryptedRefreshToken),
    }),
  );
  await storeTokens(data, existing.realmId);
}

export async function getValidQuickBooksAccessToken(): Promise<{ accessToken: string; realmId: string }> {
  const existing = await prisma.quickBooksOAuthToken.findUnique({ where: { id: "quickbooks" } });
  if (!existing) {
    throw new Error("Not connected to QuickBooks. Visit /api/auth/quickbooks/login.");
  }
  if (existing.accessTokenExpiresAt.getTime() - REFRESH_SAFETY_MARGIN_MS <= Date.now()) {
    await refreshAccessToken();
    const refreshed = await prisma.quickBooksOAuthToken.findUnique({ where: { id: "quickbooks" } });
    if (!refreshed) {
      throw new Error("QuickBooks token refresh did not persist.");
    }
    return { accessToken: decryptToken(refreshed.encryptedAccessToken), realmId: refreshed.realmId };
  }
  return { accessToken: decryptToken(existing.encryptedAccessToken), realmId: existing.realmId };
}

export async function isQuickBooksConnected(): Promise<boolean> {
  const row = await prisma.quickBooksOAuthToken.findUnique({ where: { id: "quickbooks" } });
  return Boolean(row);
}

export async function getQuickBooksConnectedAt(): Promise<Date | null> {
  const row = await prisma.quickBooksOAuthToken.findUnique({ where: { id: "quickbooks" } });
  return row?.connectedAt ?? null;
}
