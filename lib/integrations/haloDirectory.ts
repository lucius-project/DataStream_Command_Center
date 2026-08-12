// HaloPSA phone directory — cross-references Call Activity against
// HaloPSA's own contact and agent records, entirely read-only. Two lookups:
//
//   phoneToCompany:    normalized 10-digit number -> client name, built
//                       from /api/Users (contacts). A single count=5000
//                       call returns the full list (confirmed live: this
//                       instance has 1280 contacts, well under that cap —
//                       no per-record fan-out like the Actions endpoint).
//   extensionToTech:    extension string -> one of the four known techs,
//                       built from /api/Agent's extensionnumber field
//                       matched against KNOWN_TECHS by name.
//
// Confirmed against real data: not every known tech has an extension
// recorded in HaloPSA (two of four are blank as of this writing) — those
// techs' calls stay unattributed rather than guessed. Same honesty
// pattern as everywhere else a HaloPSA field turned out incomplete.
//
// Throttled like the Actions-derived hours computations: this is only two
// fixed-cost HaloPSA calls (no fan-out), but Call Activity and Tech
// Performance both call it on every page load, so it's still worth not
// re-fetching on rapid repeat visits.

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getHaloAccessToken, KNOWN_TECHS, type Tech } from "./halopsa";
import { normalizeInstanceUrl, firstString, matchKnownTech, withComputeThrottle, HOURS_THROTTLE_MS } from "./haloShared";

export type HaloDirectory = {
  phoneToCompany: Map<string, string>;
  extensionToTech: Map<string, Tech>;
};

const PHONE_FIELDS = ["phonenumber", "phonenumber_preferred", "sitephonenumber"];

// Same "last 10 digits" normalization as the United Cloud side (see
// extractExternalNumber in unitedCloud.ts) so the two sides of the match
// use an identical key space regardless of formatting
// ("(250) 739-2952" vs "2507392952" vs a stray literal "undefined").
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

async function fetchDirectory(): Promise<HaloDirectory | null> {
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) return null;

  const clientSecret = decryptToken(credential.encryptedClientSecret);
  const accessToken = await getHaloAccessToken(credential.instanceUrl, credential.clientId, clientSecret);
  const base = normalizeInstanceUrl(credential.instanceUrl);

  const [usersRes, agentsRes] = await Promise.all([
    fetch(`${base}/api/Users?count=5000`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    fetch(`${base}/api/Agent`, { headers: { Authorization: `Bearer ${accessToken}` } }),
  ]);
  if (!usersRes.ok) {
    const body = await usersRes.text().catch(() => "");
    throw new Error(`HaloPSA Users request failed (${usersRes.status}): ${body.slice(0, 300)}`);
  }
  if (!agentsRes.ok) {
    const body = await agentsRes.text().catch(() => "");
    throw new Error(`HaloPSA Agent request failed (${agentsRes.status}): ${body.slice(0, 300)}`);
  }

  const usersData: unknown = await usersRes.json();
  const users: Record<string, unknown>[] = Array.isArray(usersData)
    ? usersData
    : ((usersData as { users?: unknown[] })?.users ?? []) as Record<string, unknown>[];
  const agents = (await agentsRes.json()) as Record<string, unknown>[];

  const phoneToCompany = new Map<string, string>();
  for (const user of users) {
    const client = firstString(user, ["client_name"]);
    if (!client) continue;
    for (const field of PHONE_FIELDS) {
      const normalized = normalizePhone(user[field]);
      if (normalized) phoneToCompany.set(normalized, client);
    }
  }

  const extensionToTech = new Map<string, Tech>();
  for (const agent of agents) {
    const extension = firstString(agent, ["extensionnumber"]);
    const name = firstString(agent, ["name"]);
    if (!extension || !name) continue;
    const tech = matchKnownTech(name, KNOWN_TECHS);
    if (tech) extensionToTech.set(extension, tech);
  }

  return { phoneToCompany, extensionToTech };
}

export async function getHaloDirectory(): Promise<HaloDirectory | null> {
  return withComputeThrottle("haloDirectory", HOURS_THROTTLE_MS, fetchDirectory);
}
