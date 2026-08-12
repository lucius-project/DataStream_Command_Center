import { prisma } from "@/lib/prisma";

// Offline-first, then name — unhealthy devices surface at the top.
export async function getDevices() {
  return prisma.ninjaDevice.findMany({
    orderBy: [{ offline: "desc" }, { displayName: "asc" }],
  });
}

export type DeviceHealthSummary = { total: number; online: number; offline: number };

export async function getDeviceHealthSummary(): Promise<DeviceHealthSummary> {
  const [total, offline] = await Promise.all([
    prisma.ninjaDevice.count(),
    prisma.ninjaDevice.count({ where: { offline: true } }),
  ]);
  return { total, online: total - offline, offline };
}
