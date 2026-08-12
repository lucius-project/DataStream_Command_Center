import { prisma } from "@/lib/prisma";
import type { HaloDirectory } from "@/lib/integrations/haloDirectory";
import type { CallRecord } from "@/app/generated/prisma/client";

const RECENT_CALLS_LIMIT = 100;

export async function getRecentCalls() {
  return prisma.callRecord.findMany({
    orderBy: { startAt: "desc" },
    take: RECENT_CALLS_LIMIT,
  });
}

export type CallWithCompany = CallRecord & { companyName: string | null; answeredBy: string | null };

// Pure join — kept separate from the DB read (getRecentCalls) and the
// live HaloPSA fetch (getHaloDirectory) so a page can run both in
// parallel and combine them, rather than serializing a live API call
// behind a DB query. `directory` is null when HaloPSA isn't connected;
// every call just gets companyName/answeredBy: null, not a fabricated guess.
// answeredBy is only set for calls that were actually answered — a missed
// call has no one who took it — and is resolved via internalExtension,
// same as the tech-performance call stats.
export function attachCompanyNames(calls: CallRecord[], directory: HaloDirectory | null): CallWithCompany[] {
  return calls.map((call) => ({
    ...call,
    companyName: (call.externalNumber && directory?.phoneToCompany.get(call.externalNumber)) || null,
    answeredBy:
      (!call.missed && call.internalExtension && directory?.extensionToTech.get(call.internalExtension)) || null,
  }));
}

export type CallActivitySummary = {
  totalToday: number;
  missedToday: number;
  avgDurationSeconds: number;
};

export async function getCallActivitySummary(): Promise<CallActivitySummary> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const todaysCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: startOfToday } },
    select: { missed: true, durationSeconds: true },
  });

  const totalToday = todaysCalls.length;
  const missedToday = todaysCalls.filter((c) => c.missed).length;
  const avgDurationSeconds =
    totalToday > 0 ? Math.round(todaysCalls.reduce((sum, c) => sum + c.durationSeconds, 0) / totalToday) : 0;

  return { totalToday, missedToday, avgDurationSeconds };
}
