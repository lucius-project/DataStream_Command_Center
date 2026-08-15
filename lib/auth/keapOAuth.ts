// Keap (CRM/Sales, Phase C) OAuth2 authorization-code flow — same role
// lib/auth/msal.ts, lib/auth/ninjaRmmOAuth.ts, and lib/auth/quickbooksOAuth.ts
// play for their providers. Keap is a confidential client (a real
// client secret is issued) with no PKCE, closer in shape to QuickBooks'
// adapter than NinjaRMM's — but unlike QuickBooks, which authenticates
// the token request via HTTP Basic, Keap's own docs (developer.infusionsoft.com/
// authentication/) confirm client_id/client_secret go directly in the
// POST body alongside grant_type/code/redirect_uri, same as HaloPSA's
// token request shape.
//
// Endpoints and the "full" scope are confirmed via Keap's own developer
// docs, not guessed:
//   authorize: https://signin.infusionsoft.com/app/oauth/authorize
//   token:     https://api.infusionsoft.com/token (form-urlencoded)
// Access tokens last 3600s; refresh tokens are returned on every
// response — same "always overwrite with whatever came back" handling
// as every other adapter here, since whether Keap rotates the refresh
// token on each use isn't confirmed and storeTokens' fallback-to-existing
// behavior is safe either way.

import { prisma } from "@/lib/prisma";
import { encryptToken, decryptToken } from "@/lib/crypto";

const AUTHORIZE_URL = "https://signin.infusionsoft.com/app/oauth/authorize";
const TOKEN_URL = "https://api.infusionsoft.com/token";
const SCOPE = "full";
const REFRESH_SAFETY_MARGIN_MS = 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. See .env.example.`);
  }
  return value;
}

async function getCredential() {
  const row = await prisma.keapCredential.findUnique({ where: { id: "keap" } });
  if (!row) {
    throw new Error("Keap app credentials aren't configured yet. Add them on the Integrations page.");
  }
  return row;
}

export function getRedirectUri(): string {
  return requiredEnv("KEAP_REDIRECT_URI");
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

async function requestToken(extraParams: Record<string, string>): Promise<TokenResponse> {
  const credential = await getCredential();
  const clientSecret = decryptToken(credential.encryptedClientSecret);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: credential.clientId,
      client_secret: clientSecret,
      ...extraParams,
    }),
  });
  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    throw new Error(`Keap token request failed (${res.status}): ${responseBody.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

async function storeTokens(data: TokenResponse, existingRefreshToken?: string): Promise<void> {
  if (!data.access_token) {
    throw new Error("Keap token response did not include an access_token.");
  }
  const refreshToken = data.refresh_token ?? existingRefreshToken;
  if (!refreshToken) {
    throw new Error("Keap token response did not include a refresh_token.");
  }
  const expiresInSeconds = data.expires_in ?? 3600;
  const accessTokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  await prisma.keapOAuthToken.upsert({
    where: { id: "keap" },
    update: {
      encryptedAccessToken: encryptToken(data.access_token),
      encryptedRefreshToken: encryptToken(refreshToken),
      accessTokenExpiresAt,
    },
    create: {
      id: "keap",
      encryptedAccessToken: encryptToken(data.access_token),
      encryptedRefreshToken: encryptToken(refreshToken),
      accessTokenExpiresAt,
    },
  });
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const data = await requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
  });
  await storeTokens(data);
}

async function refreshAccessToken(): Promise<void> {
  const existing = await prisma.keapOAuthToken.findUnique({ where: { id: "keap" } });
  if (!existing) {
    throw new Error("Not connected to Keap. Visit /api/auth/keap/login.");
  }
  const refreshToken = decryptToken(existing.encryptedRefreshToken);
  const data = await requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
  await storeTokens(data, refreshToken);
}

export async function getValidKeapAccessToken(): Promise<string> {
  const existing = await prisma.keapOAuthToken.findUnique({ where: { id: "keap" } });
  if (!existing) {
    throw new Error("Not connected to Keap. Visit /api/auth/keap/login.");
  }
  if (existing.accessTokenExpiresAt.getTime() - REFRESH_SAFETY_MARGIN_MS <= Date.now()) {
    await refreshAccessToken();
    const refreshed = await prisma.keapOAuthToken.findUnique({ where: { id: "keap" } });
    if (!refreshed) {
      throw new Error("Keap token refresh did not persist.");
    }
    return decryptToken(refreshed.encryptedAccessToken);
  }
  return decryptToken(existing.encryptedAccessToken);
}

export async function isKeapConnected(): Promise<boolean> {
  const row = await prisma.keapOAuthToken.findUnique({ where: { id: "keap" } });
  return Boolean(row);
}

export async function getKeapConnectedAt(): Promise<Date | null> {
  const row = await prisma.keapOAuthToken.findUnique({ where: { id: "keap" } });
  return row?.connectedAt ?? null;
}
