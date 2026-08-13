// Remote Session Analytics — Phase 8 of the /tech-performance rebuild.
// Reads RemoteSession rows built by ninjaRmm.ts's syncRemoteSessions
// (grouped from confirmed-live NINJA_REMOTE activity events) — this file
// only aggregates already-trusted records, it never talks to NinjaOne
// itself except for the two small, live, unpersisted lookups
// (fetchNinjaUsers, fetchNinjaOrganizations) needed to turn raw NinjaOne
// IDs into names, same "small directory, always fresh" pattern already
// used for United Cloud's ContactDirectory.
//
// History depth is genuinely shallow at first and builds up over real
// time (see NinjaActivitySyncState's schema comment) — this file never
// pretends a fixed window's worth of data exists; every summary reports
// its actual coverage start alongside the numbers.

import { prisma } from "@/lib/prisma";
import { isBusinessHours, startOfToday } from "@/lib/dateUtils";
import { matchKnownTech } from "@/lib/integrations/haloShared";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import { fetchNinjaUsers, fetchNinjaOrganizations } from "@/lib/integrations/ninjaRmm";
import { median, percentile90 } from "./stats";
import { getKpiSettings } from "./kpiSettings";

// minPercentileSample is admin-editable (Phase 12,
// KpiSettings.minPercentileSample) — was a module constant, duplicated
// identically in callActivity.ts.

// Exported for reuse by activityCorrelation.ts's Customer Interaction
// Time (Phase 9) — this function is already source-agnostic (just
// {start,end}[] -> number), so combining phone-call and remote-session
// intervals needs no fork, just the same merge applied to a bigger array.
export function mergeIntervalSeconds(intervals: { start: Date; end: Date }[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  let totalMs = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    const iv = sorted[i];
    if (iv.start <= curEnd) {
      if (iv.end > curEnd) curEnd = iv.end;
    } else {
      totalMs += curEnd.getTime() - curStart.getTime();
      curStart = iv.start;
      curEnd = iv.end;
    }
  }
  totalMs += curEnd.getTime() - curStart.getTime();
  return Math.round(totalMs / 1000);
}

export type RemoteSessionSummary = {
  sessions: number; // completed + in_progress — real connections
  failedSessions: number;
  canceledSessions: number;
  grossSeconds: number;
  uniqueSeconds: number;
  durationStatus: "available" | "insufficient_sample" | "unavailable";
  medianDurationSeconds: number | null;
  p90DurationSeconds: number | null;
  businessHoursSessions: number;
  afterHoursSessions: number;
  uniqueDeviceIds: Set<string>;
};

export type TechRemoteSummary = { tech: Tech; techLabel: string } & RemoteSessionSummary;

export type RemoteSessionAnalytics = {
  coverageStart: Date | null; // oldest session this app has actually captured — never a fabricated window
  org: RemoteSessionSummary;
  byTech: TechRemoteSummary[];
  topDevices: { deviceName: string; organizationName: string | null; sessions: number; grossSeconds: number }[];
  topClients: { organizationName: string; sessions: number; grossSeconds: number }[];
};

function finalizeSummary(
  raw: {
    completedDurations: number[];
    grossSeconds: number;
    intervals: { start: Date; end: Date }[];
    connected: number;
    failed: number;
    canceled: number;
    businessHours: number;
    afterHours: number;
    deviceIds: Set<string>;
  },
  minPercentileSample: number,
): RemoteSessionSummary {
  const uniqueSeconds = mergeIntervalSeconds(raw.intervals);
  const durationStatus: RemoteSessionSummary["durationStatus"] =
    raw.completedDurations.length === 0 ? "unavailable" : raw.completedDurations.length < minPercentileSample ? "insufficient_sample" : "available";
  return {
    sessions: raw.connected,
    failedSessions: raw.failed,
    canceledSessions: raw.canceled,
    grossSeconds: raw.grossSeconds,
    uniqueSeconds,
    durationStatus,
    medianDurationSeconds: median(raw.completedDurations),
    p90DurationSeconds: percentile90(raw.completedDurations),
    businessHoursSessions: raw.businessHours,
    afterHoursSessions: raw.afterHours,
    uniqueDeviceIds: raw.deviceIds,
  };
}

export async function getRemoteSessionAnalytics(): Promise<RemoteSessionAnalytics> {
  const [sessions, devices, users, organizations, settings] = await Promise.all([
    prisma.remoteSession.findMany({ orderBy: { startedAt: "asc" } }),
    prisma.ninjaDevice.findMany({ select: { ninjaDeviceId: true, displayName: true, organizationId: true } }),
    fetchNinjaUsers().catch(() => new Map<string, string>()),
    fetchNinjaOrganizations().catch(() => [] as { id: string; name: string }[]),
    getKpiSettings(),
  ]);

  const deviceById = new Map(devices.map((d) => [d.ninjaDeviceId, d]));
  const orgNameById = new Map(organizations.map((o) => [o.id, o.name]));

  const coverageStart = sessions.find((s) => s.startedAt)?.startedAt ?? null;

  type Raw = {
    completedDurations: number[];
    grossSeconds: number;
    intervals: { start: Date; end: Date }[];
    connected: number;
    failed: number;
    canceled: number;
    businessHours: number;
    afterHours: number;
    deviceIds: Set<string>;
  };
  const newRaw = (): Raw => ({
    completedDurations: [],
    grossSeconds: 0,
    intervals: [],
    connected: 0,
    failed: 0,
    canceled: 0,
    businessHours: 0,
    afterHours: 0,
    deviceIds: new Set(),
  });

  const orgRaw = newRaw();
  const rawByTech = new Map<Tech, Raw>();
  const deviceStats = new Map<string, { sessions: number; grossSeconds: number }>();

  for (const s of sessions) {
    const isConnected = s.status === "completed" || s.status === "in_progress";
    const tech = s.ninjaUserId ? matchKnownTech(users.get(s.ninjaUserId) ?? "", KNOWN_TECHS) : undefined;
    const techRaw = tech ? (rawByTech.get(tech) ?? newRaw()) : null;
    if (tech && techRaw) rawByTech.set(tech, techRaw);

    if (s.status === "failed") {
      orgRaw.failed++;
      if (techRaw) techRaw.failed++;
      continue;
    }
    if (s.status === "canceled") {
      orgRaw.canceled++;
      if (techRaw) techRaw.canceled++;
      continue;
    }
    if (!isConnected || !s.startedAt) continue; // requested_only or no start time — nothing usable

    orgRaw.connected++;
    if (techRaw) techRaw.connected++;

    if (isBusinessHours(s.startedAt)) {
      orgRaw.businessHours++;
      if (techRaw) techRaw.businessHours++;
    } else {
      orgRaw.afterHours++;
      if (techRaw) techRaw.afterHours++;
    }

    if (s.ninjaDeviceId) {
      orgRaw.deviceIds.add(s.ninjaDeviceId);
      if (techRaw) techRaw.deviceIds.add(s.ninjaDeviceId);
    }

    if (s.status === "completed" && s.endedAt) {
      const duration = s.durationSeconds ?? Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000);
      orgRaw.completedDurations.push(duration);
      orgRaw.grossSeconds += duration;
      orgRaw.intervals.push({ start: s.startedAt, end: s.endedAt });
      if (techRaw) {
        techRaw.completedDurations.push(duration);
        techRaw.grossSeconds += duration;
        techRaw.intervals.push({ start: s.startedAt, end: s.endedAt });
      }

      if (s.ninjaDeviceId) {
        const ds = deviceStats.get(s.ninjaDeviceId) ?? { sessions: 0, grossSeconds: 0 };
        ds.sessions++;
        ds.grossSeconds += duration;
        deviceStats.set(s.ninjaDeviceId, ds);
      }
    }
  }

  const byTech: TechRemoteSummary[] = KNOWN_TECHS.map((tech) => ({
    tech,
    techLabel: tech,
    ...finalizeSummary(rawByTech.get(tech) ?? newRaw(), settings.minPercentileSample),
  }));

  const topDevices = [...deviceStats.entries()]
    .map(([deviceId, stat]) => {
      const device = deviceById.get(deviceId);
      const organizationName = device?.organizationId ? (orgNameById.get(device.organizationId) ?? null) : null;
      return { deviceName: device?.displayName ?? `Device ${deviceId}`, organizationName, ...stat };
    })
    .sort((a, b) => b.grossSeconds - a.grossSeconds)
    .slice(0, 8);

  const clientStats = new Map<string, { sessions: number; grossSeconds: number }>();
  for (const [deviceId, stat] of deviceStats) {
    const device = deviceById.get(deviceId);
    const orgName = device?.organizationId ? orgNameById.get(device.organizationId) : undefined;
    if (!orgName) continue;
    const entry = clientStats.get(orgName) ?? { sessions: 0, grossSeconds: 0 };
    entry.sessions += stat.sessions;
    entry.grossSeconds += stat.grossSeconds;
    clientStats.set(orgName, entry);
  }
  const topClients = [...clientStats.entries()]
    .map(([organizationName, stat]) => ({ organizationName, ...stat }))
    .sort((a, b) => b.grossSeconds - a.grossSeconds)
    .slice(0, 8);

  return {
    coverageStart,
    org: finalizeSummary(orgRaw, settings.minPercentileSample),
    byTech,
    topDevices,
    topClients,
  };
}

// Yesterday's remote connection count, per tech — a lightweight, single-
// day-scoped sibling to getRemoteSessionAnalytics above rather than
// filtering that function's much heavier all-time/device/client
// aggregation down to one day. "Real connections" means the same thing
// here as RemoteSessionSummary.sessions there: completed or in_progress,
// not failed/canceled/requested-only.
export async function getRemoteSessionCountsYesterday(): Promise<Map<Tech, number>> {
  const start = startOfToday();
  start.setDate(start.getDate() - 1);
  const end = startOfToday();

  const [sessions, users] = await Promise.all([
    prisma.remoteSession.findMany({
      where: { startedAt: { gte: start, lt: end } },
      select: { ninjaUserId: true, status: true },
    }),
    fetchNinjaUsers().catch(() => new Map<string, string>()),
  ]);

  const counts = new Map<Tech, number>();
  for (const s of sessions) {
    if (s.status !== "completed" && s.status !== "in_progress") continue;
    const tech = s.ninjaUserId ? matchKnownTech(users.get(s.ninjaUserId) ?? "", KNOWN_TECHS) : undefined;
    if (!tech) continue;
    counts.set(tech, (counts.get(tech) ?? 0) + 1);
  }
  return counts;
}
