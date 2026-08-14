// NinjaRMM OAuth2 authorization-code flow — hand-rolled equivalent of
// lib/auth/msal.ts's exported surface (same function shapes), since
// NinjaRMM isn't Azure/MSAL. Confirmed live against this account:
//   1. client_credentials is unavailable — no such grant type on the app
//      ("unauthorized_client" against four different request shapes).
//   2. The "Native"/"Single Page" app platforms in NinjaRMM's wizard
//      produce PKCE public clients with no Client Secret field at all
//      (RFC 7636, confirmed against NinjaOne's own "Authorization Code
//      Flow with PKCE" docs page); the "Web" platform instead issues a
//      real Client Secret (confidential client). Both are supported
//      here — see withClientSecret below — since which one an account
//      gets isn't something to assume.
//
// Endpoints and the "offline_access" scope (needed to actually receive
// a refresh token) are confirmed via a real NinjaOne-published
// automation example, not guessed:
//   authorize: {apiBaseUrl}/ws/oauth/authorize
//   token:     {apiBaseUrl}/ws/oauth/token (form-urlencoded — a JSON
//              body attempt got a real 415 from the live endpoint)

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encryptToken, decryptToken } from "@/lib/crypto";

const LOGIN_SCOPE = "monitoring offline_access";
const REFRESH_SAFETY_MARGIN_MS = 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. See .env.example.`);
  }
  return value;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// RFC 7636: verifier is a random string; challenge is base64url(SHA256(verifier)).
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

async function getCredential() {
  const row = await prisma.ninjaRmmCredential.findUnique({ where: { id: "ninjarmm" } });
  if (!row) {
    throw new Error("NinjaRMM app credentials aren't configured yet. Add them on the Integrations page.");
  }
  return row;
}

export function getRedirectUri(): string {
  return requiredEnv("NINJARMM_REDIRECT_URI");
}

export async function getAuthorizeUrl(state: string, codeChallenge: string): Promise<string> {
  const credential = await getCredential();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: credential.clientId,
    redirect_uri: getRedirectUri(),
    scope: LOGIN_SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${normalizeBaseUrl(credential.apiBaseUrl)}/ws/oauth/authorize?${params}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const credential = await getCredential();
  const res = await fetch(`${normalizeBaseUrl(credential.apiBaseUrl)}/ws/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const responseBody = await res.text().catch(() => "");
    throw new Error(`NinjaRMM token request failed (${res.status}): ${responseBody.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

async function storeTokens(data: TokenResponse, existingRefreshToken?: string): Promise<void> {
  if (!data.access_token) {
    throw new Error("NinjaRMM token response did not include an access_token.");
  }
  const refreshToken = data.refresh_token ?? existingRefreshToken;
  if (!refreshToken) {
    throw new Error("NinjaRMM token response did not include a refresh_token.");
  }
  const expiresInSeconds = data.expires_in ?? 3600;
  const accessTokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  await prisma.ninjaRmmOAuthToken.upsert({
    where: { id: "ninjarmm" },
    update: {
      encryptedAccessToken: encryptToken(data.access_token),
      encryptedRefreshToken: encryptToken(refreshToken),
      accessTokenExpiresAt,
    },
    create: {
      id: "ninjarmm",
      encryptedAccessToken: encryptToken(data.access_token),
      encryptedRefreshToken: encryptToken(refreshToken),
      accessTokenExpiresAt,
    },
  });
}

// PKCE's code_verifier is the proof of possession for a public client
// (no secret). Some accounts' "Web" app type instead issues a real
// Client Secret (confidential client) — when one is stored, it's sent
// too; NinjaRMM's /ws/oauth/token accepts either shape, and a public
// client's credential row simply has no secret to add here.
function withClientSecret(params: URLSearchParams, encryptedClientSecret: string | null): URLSearchParams {
  if (encryptedClientSecret) {
    params.set("client_secret", decryptToken(encryptedClientSecret));
  }
  return params;
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<void> {
  const credential = await getCredential();
  const data = await requestToken(
    withClientSecret(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUri(),
        client_id: credential.clientId,
        code_verifier: codeVerifier,
      }),
      credential.encryptedClientSecret,
    ),
  );
  await storeTokens(data);
}

async function refreshAccessToken(): Promise<void> {
  const credential = await getCredential();
  const existing = await prisma.ninjaRmmOAuthToken.findUnique({ where: { id: "ninjarmm" } });
  if (!existing) {
    throw new Error("Not connected to NinjaRMM. Visit /api/auth/ninjarmm/login.");
  }
  const refreshToken = decryptToken(existing.encryptedRefreshToken);
  const data = await requestToken(
    withClientSecret(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: credential.clientId,
      }),
      credential.encryptedClientSecret,
    ),
  );
  await storeTokens(data, refreshToken);
}

export async function getValidNinjaRmmAccessToken(): Promise<string> {
  const existing = await prisma.ninjaRmmOAuthToken.findUnique({ where: { id: "ninjarmm" } });
  if (!existing) {
    throw new Error("Not connected to NinjaRMM. Visit /api/auth/ninjarmm/login.");
  }
  if (existing.accessTokenExpiresAt.getTime() - REFRESH_SAFETY_MARGIN_MS <= Date.now()) {
    await refreshAccessToken();
    const refreshed = await prisma.ninjaRmmOAuthToken.findUnique({ where: { id: "ninjarmm" } });
    if (!refreshed) {
      throw new Error("NinjaRMM token refresh did not persist.");
    }
    return decryptToken(refreshed.encryptedAccessToken);
  }
  return decryptToken(existing.encryptedAccessToken);
}

export async function isNinjaRmmConnected(): Promise<boolean> {
  const row = await prisma.ninjaRmmOAuthToken.findUnique({ where: { id: "ninjarmm" } });
  return Boolean(row);
}

export async function getNinjaRmmConnectedAt(): Promise<Date | null> {
  const row = await prisma.ninjaRmmOAuthToken.findUnique({ where: { id: "ninjarmm" } });
  return row?.connectedAt ?? null;
}
