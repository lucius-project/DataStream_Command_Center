// NinjaRMM adapter — powers Device Health. Auth is the OAuth2
// authorization-code flow (lib/auth/ninjaRmmOAuth.ts) — client_credentials
// was tried first but confirmed unavailable on this account
// ("unauthorized_client" against every request shape tried; the app has
// no Client Credentials grant type option, only a redirect-URI-required
// Authorization Code app).
//
// Device field names confirmed against a real response from this
// account: id, organizationId, offline, systemName, dnsName, lastContact
// (unix seconds, fractional) — no displayName or OS-name field exists at
// all on this endpoint. The closest available signal is nodeClass (e.g.
// "WINDOWS_WORKSTATION"), lightly formatted for display.

import { prisma } from "@/lib/prisma";
import { getValidNinjaRmmAccessToken, isNinjaRmmConnected } from "@/lib/auth/ninjaRmmOAuth";
import { withComputeThrottle } from "./haloShared";

type RawDevice = Record<string, unknown>;

function firstString(raw: RawDevice, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function mapDate(raw: RawDevice, keys: string[]): Date | null {
  for (const key of keys) {
    const value = raw[key];
    // NinjaRMM timestamps are commonly unix seconds, not ISO strings.
    if (typeof value === "number" && value > 0) {
      const date = new Date(value * 1000);
      if (!Number.isNaN(date.getTime())) return date;
    }
    if (typeof value === "string" && value.trim()) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

// "WINDOWS_WORKSTATION" -> "Windows Workstation"
function formatNodeClass(nodeClass: string): string {
  return nodeClass
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function fetchDevices(apiBaseUrl: string, accessToken: string): Promise<RawDevice[]> {
  const res = await fetch(`${normalizeBaseUrl(apiBaseUrl)}/v2/devices`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NinjaRMM device request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// A device missing from a successful fetch has been removed/decommissioned
// in NinjaRMM — /v2/devices always returns the full current inventory, so
// (unlike CDRs) this reconciles the same way ticket sync does.
async function reconcileDevices(liveNinjaDeviceIds: string[]): Promise<void> {
  await prisma.ninjaDevice.deleteMany({ where: { ninjaDeviceId: { notIn: liveNinjaDeviceIds } } });
}

// Live fetch for the account-linking dropdown — not persisted, same
// approach as QuickBooks' fetchCustomers.
export async function fetchNinjaOrganizations(): Promise<{ id: string; name: string }[]> {
  const credential = await prisma.ninjaRmmCredential.findUnique({ where: { id: "ninjarmm" } });
  if (!credential || !(await isNinjaRmmConnected())) return [];

  const accessToken = await getValidNinjaRmmAccessToken();
  const res = await fetch(`${normalizeBaseUrl(credential.apiBaseUrl)}/v2/organizations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NinjaRMM organizations request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const rows: RawDevice[] = Array.isArray(data) ? data : [];
  return rows
    .map((r) => ({ id: firstString(r, ["id"]), name: firstString(r, ["name"]) }))
    .filter((r): r is { id: string; name: string } => Boolean(r.id && r.name));
}

async function fetchAntivirusStatus(apiBaseUrl: string, accessToken: string): Promise<RawDevice[]> {
  const res = await fetch(`${normalizeBaseUrl(apiBaseUrl)}/v2/queries/antivirus-status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NinjaRMM antivirus-status request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  // Confirmed real shape: a bare array of per-device records
  // ({ productName, productState, definitionStatus, version, deviceId,
  // timestamp }) — the { results: [...] } fallback below is defensive
  // in case that differs for accounts with no AV data at all.
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).results)) {
    return (data as Record<string, unknown>).results as RawDevice[];
  }
  return [];
}

// Antivirus only — the only NinjaRMM tool signal confirmed to exist.
// Compares the installed count against the matching HaloPSA agreement
// item's billed quantity (best-effort name match: "antivirus" or "AV").
export async function syncSeatReconciliation(clientId: string): Promise<{ error?: string }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { agreementItems: true },
  });
  if (!client?.ninjaOrganizationId) return {};

  const credential = await prisma.ninjaRmmCredential.findUnique({ where: { id: "ninjarmm" } });
  if (!credential || !(await isNinjaRmmConnected())) return {};

  try {
    const accessToken = await getValidNinjaRmmAccessToken();
    const rawStatus = await fetchAntivirusStatus(credential.apiBaseUrl, accessToken);

    if (rawStatus.length > 0) {
      console.log(
        "NinjaRMM raw antivirus-status sample (first result, for field-mapping reference):",
        JSON.stringify(rawStatus[0]),
      );
    }

    // Confirmed real shape: { productName, productState, definitionStatus,
    // version, deviceId, timestamp } — no organizationId on the record
    // itself, so cross-reference deviceId against our own synced
    // NinjaDevice rows (which do carry organizationId) to scope by org.
    const orgDeviceIds = new Set(
      (
        await prisma.ninjaDevice.findMany({
          where: { organizationId: client.ninjaOrganizationId },
          select: { ninjaDeviceId: true },
        })
      ).map((d) => d.ninjaDeviceId),
    );
    const installedDeviceIds = new Set(
      rawStatus
        .map((r) => firstString(r, ["deviceId", "device_id"]))
        .filter((id): id is string => Boolean(id) && orgDeviceIds.has(id!)),
    );
    const installedCount = installedDeviceIds.size;

    const billedItem = client.agreementItems.find(
      (item) => item.name.toLowerCase().includes("antivirus") || /\bav\b/i.test(item.name),
    );
    const billedQuantity = billedItem?.quantity ?? 0;

    await prisma.seatReconciliation.upsert({
      where: { clientId_tool: { clientId, tool: "Antivirus" } },
      update: { installedCount, billedQuantity },
      create: { clientId, tool: "Antivirus", installedCount, billedQuantity },
    });

    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "NinjaRMM seat reconciliation sync failed.";
    console.error("NinjaRMM seat reconciliation sync failed:", err);
    return { error: message };
  }
}

export async function syncDevices(): Promise<{ synced: number; error?: string }> {
  const credential = await prisma.ninjaRmmCredential.findUnique({ where: { id: "ninjarmm" } });
  if (!credential || !(await isNinjaRmmConnected())) {
    return { synced: 0 };
  }

  try {
    const accessToken = await getValidNinjaRmmAccessToken();
    const rawDevices = await fetchDevices(credential.apiBaseUrl, accessToken);

    if (rawDevices.length > 0) {
      console.log("NinjaRMM raw device sample (first result, for field-mapping reference):", JSON.stringify(rawDevices[0]));
    }

    const liveNinjaDeviceIds: string[] = [];
    for (const raw of rawDevices) {
      const ninjaDeviceId = firstString(raw, ["id"]);
      if (!ninjaDeviceId) continue;
      liveNinjaDeviceIds.push(ninjaDeviceId);

      const displayName = firstString(raw, ["displayName", "systemName", "dnsName"]) || "(unnamed device)";
      const systemName = firstString(raw, ["systemName"]) ?? null;
      const organizationId = firstString(raw, ["organizationId"]) ?? null;
      const offline = raw["offline"] === true;
      const lastContact = mapDate(raw, ["lastContact"]);
      const nodeClass = firstString(raw, ["nodeClass"]);
      const osName = nodeClass ? formatNodeClass(nodeClass) : null;

      await prisma.ninjaDevice.upsert({
        where: { ninjaDeviceId },
        update: { displayName, systemName, organizationId, offline, lastContact, osName },
        create: { ninjaDeviceId, displayName, systemName, organizationId, offline, lastContact, osName },
      });
    }

    await reconcileDevices(liveNinjaDeviceIds);

    return { synced: rawDevices.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "NinjaRMM sync failed.";
    console.error("NinjaRMM device sync failed:", err);
    return { synced: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// Remote Session Analytics (Phase 8) — confirmed live against a real
// response: /v2/activities entries with activityType "NINJA_REMOTE" form
// a session's lifecycle ("Remote control session requested" -> "Session
// started" -> "Session terminated", or "Session failed to start" /
// "Cancel Requested" instead of a normal finish), all sharing one
// seriesUid. The terminated event's own data.message.params.duration
// (seconds, as a string) is NinjaOne's own computed session length —
// used directly rather than re-derived from startedAt/endedAt.
//
// NINJA_QUICK_CONNECT was also checked (confirmed live, ~11k activities
// scanned): every instance seen was an invitation-lifecycle event
// ("Invitation Created/Disabled", "device registered") with no
// start/end pairing or duration field at all — a different feature
// (ad-hoc guest connections), not remote-session-duration data. Not
// treated as a remote session here; revisit if a differently-shaped
// Quick Connect session event ever turns up.
// ---------------------------------------------------------------------------

type RawActivity = Record<string, unknown>;

// Live, unpersisted — same "small directory, always fresh" approach as
// fetchNinjaOrganizations above. Confirmed live: id (number), firstName,
// lastName, email, userType ("TECHNICIAN" etc.).
export async function fetchNinjaUsers(): Promise<Map<string, string>> {
  const credential = await prisma.ninjaRmmCredential.findUnique({ where: { id: "ninjarmm" } });
  if (!credential || !(await isNinjaRmmConnected())) return new Map();

  const accessToken = await getValidNinjaRmmAccessToken();
  const res = await fetch(`${normalizeBaseUrl(credential.apiBaseUrl)}/v2/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NinjaRMM users request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const rows: RawDevice[] = Array.isArray(data) ? data : [];

  const byId = new Map<string, string>();
  for (const r of rows) {
    const id = firstString(r, ["id"]);
    const first = firstString(r, ["firstName"]);
    const last = firstString(r, ["lastName"]);
    if (!id) continue;
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (name) byId.set(id, name);
  }
  return byId;
}

const ACTIVITIES_PAGE_SIZE = 250;
// Safety cap on pages fetched per sync run (~10,000 activities) — the
// account-wide feed is mostly monitor/patch noise (95 of a sampled 100
// were non-remote, confirmed live), so a real remote session can be many
// pages back — and confirmed live that 40 pages (10,000 activities) only
// reaches back about one day on this account. A true 30-day backward
// scan on every page load isn't viable (see NinjaActivitySyncState's
// schema comment), so this cap only bounds the *first-ever* sync;
// every sync after that stops as soon as it reaches the previously-seen
// cursor, which is normally a page or two.
const ACTIVITIES_MAX_PAGES = 40;
// Bound on the very first sync (no cursor yet), so history starts
// shallow rather than scanning unboundedly on a cold start.
const ACTIVITIES_SYNC_WINDOW_DAYS = 7;

const SYNC_STATE_ID = "ninja-activities";

// /v2/activities has no server-side type filter that actually works
// (confirmed live — an activityType query param is silently ignored,
// still returns the default unfiltered feed) so this pages backward via
// the `olderThan` cursor and filters NINJA_REMOTE client-side. Stops at
// whichever comes first: the previously-processed cursor (normal case —
// cheap, just the activity produced since the last sync), the
// first-sync day window, or the page cap (safety net either way).
async function fetchRemoteActivities(
  apiBaseUrl: string,
  accessToken: string,
): Promise<{ activities: RawActivity[]; newestSeenId: number | null }> {
  const state = await prisma.ninjaActivitySyncState.findUnique({ where: { id: SYNC_STATE_ID } });
  const stopAtId = state?.newestActivityId ?? null;
  const cutoffSeconds = Date.now() / 1000 - ACTIVITIES_SYNC_WINDOW_DAYS * 24 * 60 * 60;

  const collected: RawActivity[] = [];
  let olderThan: number | undefined;
  let newestSeenId: number | null = null;

  for (let page = 0; page < ACTIVITIES_MAX_PAGES; page++) {
    const url = `${normalizeBaseUrl(apiBaseUrl)}/v2/activities?pageSize=${ACTIVITIES_PAGE_SIZE}${olderThan ? `&olderThan=${olderThan}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`NinjaRMM activities request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const acts: RawActivity[] = Array.isArray(data?.activities) ? data.activities : [];
    if (acts.length === 0) break;

    if (newestSeenId === null) {
      const firstId = acts[0]["id"];
      if (typeof firstId === "number") newestSeenId = firstId;
    }

    let reachedKnownActivity = false;
    for (const a of acts) {
      const id = a["id"];
      if (stopAtId !== null && typeof id === "number" && id <= stopAtId) {
        reachedKnownActivity = true;
        break;
      }
      if (a["activityType"] === "NINJA_REMOTE") collected.push(a);
    }
    if (reachedKnownActivity) break;

    const last = acts[acts.length - 1];
    const lastId = typeof last["id"] === "number" ? (last["id"] as number) : undefined;
    if (lastId === undefined) break;

    // Only the first-ever sync (no stored cursor) falls back to a
    // calendar cutoff — once a cursor exists, reaching it is the only
    // stop condition, since it always represents "caught up."
    if (stopAtId === null) {
      const lastTime = typeof last["activityTime"] === "number" ? (last["activityTime"] as number) : undefined;
      if (lastTime !== undefined && lastTime < cutoffSeconds) break;
    }
    olderThan = lastId;
  }

  return { activities: collected, newestSeenId };
}

type RemoteSessionDraft = {
  seriesUid: string;
  ninjaDeviceId: string | null;
  ninjaUserId: string | null;
  requestedAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  status: string;
};

function activityDate(a: RawActivity): Date | null {
  const t = a["activityTime"];
  if (typeof t !== "number") return null;
  return new Date(t * 1000);
}

// Groups raw NINJA_REMOTE events by seriesUid into one session draft
// each — see this section's header comment for the confirmed event
// lifecycle. deviceId/userId are read from whichever event in the group
// carries them (not every event type does — confirmed live: "Session
// terminated" doesn't repeat userId, only "requested"/"cancel requested" do).
function groupIntoSessions(activities: RawActivity[]): RemoteSessionDraft[] {
  const bySeries = new Map<string, RawActivity[]>();
  for (const a of activities) {
    const seriesUid = a["seriesUid"];
    if (typeof seriesUid !== "string") continue;
    const arr = bySeries.get(seriesUid) ?? [];
    arr.push(a);
    bySeries.set(seriesUid, arr);
  }

  const drafts: RemoteSessionDraft[] = [];
  for (const [seriesUid, events] of bySeries) {
    let ninjaDeviceId: string | null = null;
    let ninjaUserId: string | null = null;
    let requestedAt: Date | null = null;
    let startedAt: Date | null = null;
    let endedAt: Date | null = null;
    let durationSeconds: number | null = null;
    let failed = false;
    let canceled = false;

    for (const e of events) {
      const deviceId = firstString(e, ["deviceId"]);
      if (deviceId) ninjaDeviceId = deviceId;
      const userId = firstString(e, ["userId"]);
      if (userId) ninjaUserId = userId;

      const status = firstString(e, ["status"]) ?? "";
      const when = activityDate(e);

      if (status === "Remote control session requested") {
        requestedAt = when;
      } else if (status === "Session started") {
        startedAt = when;
      } else if (status === "Session terminated") {
        endedAt = when;
        const data = e["data"];
        const params =
          data && typeof data === "object"
            ? ((data as Record<string, unknown>)["message"] as Record<string, unknown> | undefined)?.["params"]
            : undefined;
        const rawDuration =
          params && typeof params === "object" ? (params as Record<string, unknown>)["duration"] : undefined;
        const parsed = typeof rawDuration === "string" ? Number(rawDuration) : undefined;
        if (parsed !== undefined && !Number.isNaN(parsed)) durationSeconds = parsed;
      } else if (status === "Session failed to start" || e["activityResult"] === "FAILURE") {
        failed = true;
      } else if (status === "Cancel Requested") {
        canceled = true;
      }
    }

    const status = endedAt
      ? "completed"
      : failed
        ? "failed"
        : startedAt
          ? "in_progress"
          : canceled
            ? "canceled"
            : "requested_only";

    drafts.push({ seriesUid, ninjaDeviceId, ninjaUserId, requestedAt, startedAt, endedAt, durationSeconds, status });
  }

  return drafts;
}

async function syncRemoteSessionsUnthrottled(): Promise<{ synced: number; error?: string }> {
  const credential = await prisma.ninjaRmmCredential.findUnique({ where: { id: "ninjarmm" } });
  if (!credential || !(await isNinjaRmmConnected())) {
    return { synced: 0 };
  }

  try {
    const accessToken = await getValidNinjaRmmAccessToken();
    const { activities, newestSeenId } = await fetchRemoteActivities(credential.apiBaseUrl, accessToken);
    const drafts = groupIntoSessions(activities);

    for (const d of drafts) {
      // A session's events routinely arrive across separate sync runs
      // (e.g. "requested"+"started" now, "terminated" days later, once
      // the cursor has already moved past the earlier events) — only
      // overwrite fields this batch actually has a value for, so a
      // later partial batch can't null out data an earlier one already
      // captured. `status` is always safe to overwrite unconditionally:
      // it's derived fresh from whichever terminal-most event this
      // batch contains, which is always at least as current as before.
      const update: Record<string, unknown> = { status: d.status, lastUpdatedAt: new Date() };
      if (d.ninjaDeviceId !== null) update.ninjaDeviceId = d.ninjaDeviceId;
      if (d.ninjaUserId !== null) update.ninjaUserId = d.ninjaUserId;
      if (d.requestedAt !== null) update.requestedAt = d.requestedAt;
      if (d.startedAt !== null) update.startedAt = d.startedAt;
      if (d.endedAt !== null) update.endedAt = d.endedAt;
      if (d.durationSeconds !== null) update.durationSeconds = d.durationSeconds;

      await prisma.remoteSession.upsert({
        where: { seriesUid: d.seriesUid },
        update,
        create: {
          seriesUid: d.seriesUid,
          ninjaDeviceId: d.ninjaDeviceId,
          ninjaUserId: d.ninjaUserId,
          requestedAt: d.requestedAt,
          startedAt: d.startedAt,
          endedAt: d.endedAt,
          durationSeconds: d.durationSeconds,
          status: d.status,
        },
      });
    }

    if (newestSeenId !== null) {
      await prisma.ninjaActivitySyncState.upsert({
        where: { id: SYNC_STATE_ID },
        update: { newestActivityId: newestSeenId },
        create: { id: SYNC_STATE_ID, newestActivityId: newestSeenId },
      });
    }

    return { synced: drafts.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "NinjaRMM remote session sync failed.";
    console.error("NinjaRMM remote session sync failed:", err);
    return { synced: 0, error: message };
  }
}

// The activities fetch pages through up to ACTIVITIES_MAX_PAGES requests
// — throttled so a burst of page loads doesn't repeat that on every one.
const REMOTE_SESSIONS_THROTTLE_MS = 5 * 60 * 1000;

export async function syncRemoteSessions(): Promise<{ synced: number; error?: string }> {
  return withComputeThrottle("ninjaRemoteSessionsSync", REMOTE_SESSIONS_THROTTLE_MS, syncRemoteSessionsUnthrottled);
}
