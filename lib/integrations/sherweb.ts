// Sherweb (Microsoft CSP/distributor) — Vendor Licensing Phase 1.
// Credential plumbing + a connection test only. No sync logic yet: the
// real customers/subscriptions endpoint shapes (renewal date field name,
// quantity, customer<->Client mapping) are unconfirmed against the live
// API, and this app's own established rule is to never build a field
// mapping on a guess (see haloClients.ts/unitedCloud.ts's own comments
// on the same discipline). That comes in Phase 1b, after a live
// discovery pass once real credentials are entered on /integrations.
//
// Auth is client-credentials OAuth (confirmed from Sherweb's public
// developer docs) against a fixed global endpoint — no per-tenant
// instance URL like HaloPSA, no per-user redirect flow like Microsoft/
// NinjaOne. The "Subscription Key" is Azure API Management's own
// per-product key convention (the docs' terminology matches APIM
// exactly) — inferred to belong on actual API calls as an
// Ocp-Apim-Subscription-Key header, not the token request itself; this
// is unconfirmed until Phase 1b's live discovery actually calls the
// Service Provider API.

const SHERWEB_TOKEN_URL = "https://api.sherweb.com/auth/oidc/connect/token";

export async function getSherwebAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(SHERWEB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "service-provider",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sherweb token request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Sherweb token response did not include an access_token.");
  }
  return data.access_token;
}

// Cheap validation used to catch a bad Client ID/Secret at save time
// (mirrors testUnitedCloudConnection's role) — a successful token
// exchange is real proof the credentials work, without guessing at a
// Service Provider API data endpoint that hasn't been confirmed yet.
export async function testSherwebConnection(clientId: string, clientSecret: string): Promise<void> {
  await getSherwebAccessToken(clientId, clientSecret);
}
