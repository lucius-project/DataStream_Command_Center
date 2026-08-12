// United Cloud (iplogin / NetSapiens hosted PBX) adapter — powers Call
// Activity. Field names below are confirmed against real CDR responses
// (not vendor-doc guesses — the docs turned out to disagree with the live
// API on several fields, see call-direction below) — the raw first CDR is
// still logged on every sync as a quick sanity check if the instance's
// shape ever drifts.
//
// Auth is simpler than HaloPSA/Microsoft: the API key itself is the
// bearer token, no OAuth exchange step.

import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/crypto";
import { KNOWN_TECHS, type Tech } from "./halopsa";
import { matchKnownTech, withComputeThrottle, HOURS_THROTTLE_MS } from "./haloShared";

type RawCdr = Record<string, unknown>;

function firstString(raw: RawCdr, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function firstNumber(raw: RawCdr, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && !Number.isNaN(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return undefined;
}

function mapDate(raw: RawCdr, keys: string[]): Date | null {
  const value = firstString(raw, keys);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

// Vendor docs claim call-direction is a string ("Inbound"/"Outbound"/"Missed"),
// but the live API actually returns undocumented numeric codes. Mapping below
// was reverse-engineered from a week of real CDRs by cross-referencing which
// of call-orig-user/call-term-user/call-through-user were populated and
// whether the call was answered: 0 always has only call-orig-user set
// (extension dialing out); 1 and 2 always have call-term-user +
// call-through-user set (call routed to an extension), differing mainly in
// answer rate — 2 is the "missed" case, but the app already derives a
// separate `missed` flag from call-answer-datetime, so both fold to Inbound.
function mapDirection(raw: RawCdr): string {
  const value = raw["call-direction"];
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("out")) return "Outbound";
    if (normalized.includes("in")) return "Inbound";
  }
  if (value === 0) return "Outbound";
  if (value === 1 || value === 2) return "Inbound";
  return "Unknown";
}

// The external party's number, normalized to the last 10 digits (NANP) —
// used to cross-reference against HaloPSA contact phone numbers in
// contactDirectory.ts. Inbound CDRs carry it as a SIP URI
// ("sip:+12507330906@15.222.191.147") — naively stripping non-digits from
// the whole string would pull digits out of the IP address too, so this
// isolates the user-info portion (before "@") first. Outbound CDRs carry
// it as a plain number in call-orig-to-user, which this handles the same
// way (no "@" to split on, so the whole string is used).
function extractExternalNumber(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const str = String(value);
  const sipMatch = str.match(/sip:([^@]+)@/i);
  const userInfo = sipMatch ? sipMatch[1] : str;
  const digits = userInfo.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// The internal extension that handled the call — short (2-4 digit)
// numeric string, used to cross-reference against United Cloud's own
// extension directory in contactDirectory.ts (fetchExtensionDirectory,
// below). For a call routed through a
// hunt group this may be the group's own pseudo-extension rather than an
// individual's — that's fine, it just won't match any agent and the call
// stays unattributed instead of being guessed.
function extractExtension(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function unwrapCdrList(data: unknown): RawCdr[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["cdrs", "data", "results"]) {
      if (Array.isArray(record[key])) return record[key] as RawCdr[];
    }
  }
  return [];
}

// Cheap read-only call used to validate a key before it's saved, mirroring
// the role getHaloAccessToken plays for HaloPSA.
export async function testUnitedCloudConnection(
  apiBaseUrl: string,
  apiKey: string,
): Promise<void> {
  const res = await fetch(`${normalizeBaseUrl(apiBaseUrl)}/apikeys/~`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`United Cloud connection test failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

async function fetchRecentCdrs(apiBaseUrl: string, domain: string, apiKey: string): Promise<RawCdr[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    "datetime-start": start.toISOString(),
    "datetime-end": end.toISOString(),
    limit: "1000",
  });
  const url = `${normalizeBaseUrl(apiBaseUrl)}/domains/${encodeURIComponent(domain)}/cdrs?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`United Cloud CDR request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return unwrapCdrList(await res.json());
}

// No mock fallback here — unlike HaloPSA/Graph, this integration has no
// seeded fixture baseline from the original brief. No credential means
// Call Activity honestly shows "not connected", not fabricated rows.
export async function syncCallActivity(): Promise<{ synced: number; error?: string }> {
  const credential = await prisma.unitedCloudCredential.findUnique({ where: { id: "unitedcloud" } });
  if (!credential) {
    return { synced: 0 };
  }

  try {
    const apiKey = decryptToken(credential.encryptedApiKey);
    const rawCdrs = await fetchRecentCdrs(credential.apiBaseUrl, credential.domain, apiKey);

    if (rawCdrs.length > 0) {
      console.log("United Cloud raw CDR sample (first result, for field-mapping reference):", JSON.stringify(rawCdrs[0]));
    }

    let synced = 0;
    for (const raw of rawCdrs) {
      const unitedCloudCallId = firstString(raw, ["id", "call-parent-cdr-id"]);
      if (!unitedCloudCallId) continue;

      const direction = mapDirection(raw);
      const fromLabel =
        firstString(raw, ["call-orig-caller-id", "call-orig-from-user", "call-orig-from-uri"]) || "Unknown";
      const toLabel =
        firstString(raw, ["call-term-caller-id", "call-orig-to-user", "call-term-to-uri"]) || "Unknown";
      const startAt = mapDate(raw, ["call-start-datetime"]) ?? new Date();
      const answeredAt = mapDate(raw, ["call-answer-datetime"]);
      const durationSeconds = firstNumber(raw, ["call-total-duration-seconds"]) ?? 0;
      const missed = !answeredAt;

      // Outbound (code 0): we dialed out, so the external number is the
      // callee (call-orig-to-user) and the internal extension is the
      // dialing tech (call-orig-user). Inbound/missed (code 1/2): the
      // external number is the caller (call-orig-from-uri, a SIP URI)
      // and the internal extension is whoever it rang to (call-term-user).
      const isOutbound = raw["call-direction"] === 0;
      const externalNumber = isOutbound
        ? extractExternalNumber(firstString(raw, ["call-orig-to-user", "call-orig-request-uri"]))
        : extractExternalNumber(firstString(raw, ["call-orig-from-uri"]));
      const internalExtension = isOutbound
        ? extractExtension(firstString(raw, ["call-orig-user"]))
        : extractExtension(firstString(raw, ["call-term-user"]));

      await prisma.callRecord.upsert({
        where: { unitedCloudCallId },
        update: { direction, fromLabel, toLabel, externalNumber, internalExtension, startAt, answeredAt, durationSeconds, missed },
        create: { unitedCloudCallId, direction, fromLabel, toLabel, externalNumber, internalExtension, startAt, answeredAt, durationSeconds, missed },
      });
      synced++;
    }

    return { synced };
  } catch (err) {
    const message = err instanceof Error ? err.message : "United Cloud sync failed.";
    console.error("United Cloud call activity sync failed:", err);
    return { synced: 0, error: message };
  }
}

// Extension -> tech, sourced from United Cloud's own /domains/{domain}/users
// directory rather than HaloPSA's agent list. Confirmed live: this endpoint
// carries name-first-name/name-last-name per extension directly from the
// phone system, so it's the more authoritative source for "who sits at
// this extension" than HaloPSA (whose agent records turned out to be
// missing extensionnumber for some techs — see haloShared.ts's
// matchKnownTech usage elsewhere). Non-person extensions (voicemail boxes,
// queues, conference bridges, TOD routes) simply won't substring-match
// any KNOWN_TECHS name and are silently skipped, not guessed.
async function fetchExtensionDirectory(): Promise<Map<string, Tech>> {
  const map = new Map<string, Tech>();
  const credential = await prisma.unitedCloudCredential.findUnique({ where: { id: "unitedcloud" } });
  if (!credential) return map;

  const apiKey = decryptToken(credential.encryptedApiKey);
  const base = normalizeBaseUrl(credential.apiBaseUrl);
  const res = await fetch(`${base}/domains/${encodeURIComponent(credential.domain)}/users`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`United Cloud users request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const users = (await res.json()) as Record<string, unknown>[];
  for (const user of users) {
    const extension = firstString(user, ["user"]);
    const firstName = firstString(user, ["name-first-name"]);
    const lastName = firstString(user, ["name-last-name"]);
    if (!extension || !firstName) continue;
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    const tech = matchKnownTech(fullName, KNOWN_TECHS);
    if (tech) map.set(extension, tech);
  }

  return map;
}

export async function getUnitedCloudExtensionDirectory(): Promise<Map<string, Tech>> {
  return withComputeThrottle("unitedCloudExtensionDirectory", HOURS_THROTTLE_MS, fetchExtensionDirectory);
}
