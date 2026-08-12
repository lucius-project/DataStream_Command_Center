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
