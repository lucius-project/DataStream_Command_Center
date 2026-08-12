// Call Activity's cross-reference directory — two independent lookups,
// each sourced from whichever integration actually owns that data:
//
//   phoneToCompany:    normalized 10-digit number -> client name, built
//                       from HaloPSA's /api/Users (contacts). A single
//                       count=5000 call returns the full list (confirmed
//                       live: this instance has 1280 contacts, well under
//                       that cap — no per-record fan-out like Actions).
//   extensionToTech:    extension string -> one of the four known techs,
//                       built from United Cloud's own /domains/{domain}/users
//                       directory (see fetchExtensionDirectory in
//                       unitedCloud.ts). Originally this came from
//                       HaloPSA's /api/Agent, but that instance's agent
//                       records turned out to be missing extensionnumber
//                       for some techs (confirmed: Darryl's extension, 103,
//                       resolves fine in United Cloud but was blank in
//                       HaloPSA) — the phone system itself is the more
//                       authoritative source for "who sits at this
//                       extension" anyway.
//   systemExtensions:   extensions that are never an individual's desk —
//                       queues, TOD routes, the auto-attendant, the
//                       conference bridge (see unitedCloud.ts's
//                       fetchExtensionDirectory). Used to exclude a
//                       "missed" call that never actually reached a
//                       desk phone from missed-call metrics.
//
// The two lookups are independent: HaloPSA being disconnected doesn't
// blank out extensionToTech, and vice versa. Each source failing throws
// on its own so the page-level catch can report which integration broke,
// same honesty pattern as everywhere else a source turned out incomplete.
//
// Throttled like the Actions-derived hours computations: these are cheap
// fixed-cost calls (no fan-out), but Call Activity and Tech Performance
// both call this on every page load, so it's still worth not re-fetching
// on rapid repeat visits.

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { getHaloAccessToken, type Tech } from "./halopsa";
import { normalizeInstanceUrl, firstString, withComputeThrottle, HOURS_THROTTLE_MS } from "./haloShared";
import { getUnitedCloudExtensionDirectory } from "./unitedCloud";

export type ContactDirectory = {
  phoneToCompany: Map<string, string>;
  extensionToTech: Map<string, Tech>;
  systemExtensions: Set<string>;
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

async function fetchPhoneToCompany(): Promise<Map<string, string>> {
  const phoneToCompany = new Map<string, string>();
  const credential = await prisma.haloPsaCredential.findUnique({ where: { id: "halopsa" } });
  if (!credential) return phoneToCompany;

  const clientSecret = decryptToken(credential.encryptedClientSecret);
  const accessToken = await getHaloAccessToken(credential.instanceUrl, credential.clientId, clientSecret);
  const base = normalizeInstanceUrl(credential.instanceUrl);

  const usersRes = await fetch(`${base}/api/Users?count=5000`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!usersRes.ok) {
    const body = await usersRes.text().catch(() => "");
    throw new Error(`HaloPSA Users request failed (${usersRes.status}): ${body.slice(0, 300)}`);
  }

  const usersData: unknown = await usersRes.json();
  const users: Record<string, unknown>[] = Array.isArray(usersData)
    ? usersData
    : ((usersData as { users?: unknown[] })?.users ?? []) as Record<string, unknown>[];

  for (const user of users) {
    const client = firstString(user, ["client_name"]);
    if (!client) continue;
    for (const field of PHONE_FIELDS) {
      const normalized = normalizePhone(user[field]);
      if (normalized) phoneToCompany.set(normalized, client);
    }
  }

  return phoneToCompany;
}

async function fetchDirectory(): Promise<ContactDirectory> {
  const [phoneToCompany, unitedCloudDirectory] = await Promise.all([
    fetchPhoneToCompany(),
    getUnitedCloudExtensionDirectory(),
  ]);
  return {
    phoneToCompany,
    extensionToTech: unitedCloudDirectory.extensionToTech,
    systemExtensions: unitedCloudDirectory.systemExtensions,
  };
}

export async function getContactDirectory(): Promise<ContactDirectory> {
  return withComputeThrottle("contactDirectory", HOURS_THROTTLE_MS, fetchDirectory);
}
