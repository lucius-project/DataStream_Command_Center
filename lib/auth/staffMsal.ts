// Identity-only Microsoft sign-in for this app's own staff login —
// reuses the same Entra app registration as lib/auth/msal.ts
// (resolveMicrosoftCredentials) but builds its own MsalClient with NO
// cache plugin: msal.ts's cache plugin persists into the single shared
// OAuthToken row that Inbox Command's mailbox connection owns, and this
// flow has nothing to do with that. A fresh in-memory MSAL client per
// call is correct here — the only thing this flow needs out of MSAL is
// one acquireTokenByCode() call's account info (email/name); this app's
// own StaffUser + signed session cookie is the actual persistence
// layer, not MSAL's token cache.

import { ConfidentialClientApplication, type AccountInfo } from "@azure/msal-node";
import { resolveMicrosoftCredentials } from "./msal";

// openid/profile/email only — no Mail.Read/ReadWrite, this flow never
// touches a mailbox.
const STAFF_LOGIN_SCOPES = ["openid", "profile", "email"];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. See .env.example.`);
  }
  return value;
}

export function getStaffRedirectUri(): string {
  return requiredEnv("STAFF_REDIRECT_URI");
}

async function getStaffMsalClient(): Promise<ConfidentialClientApplication> {
  const { clientId, tenantId, clientSecret } = await resolveMicrosoftCredentials();
  return new ConfidentialClientApplication({
    auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, clientSecret },
  });
}

export async function getStaffAuthCodeUrl(state: string): Promise<string> {
  const msal = await getStaffMsalClient();
  return msal.getAuthCodeUrl({
    scopes: STAFF_LOGIN_SCOPES,
    redirectUri: getStaffRedirectUri(),
    state,
  });
}

export async function handleStaffAuthCallback(code: string): Promise<AccountInfo> {
  const msal = await getStaffMsalClient();
  const result = await msal.acquireTokenByCode({
    code,
    scopes: STAFF_LOGIN_SCOPES,
    redirectUri: getStaffRedirectUri(),
  });
  if (!result?.account) {
    throw new Error("Microsoft sign-in did not return an account.");
  }
  return result.account;
}
