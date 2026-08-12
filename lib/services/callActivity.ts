import { prisma } from "@/lib/prisma";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import type { ContactDirectory } from "@/lib/integrations/contactDirectory";
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
// live directory fetch (getContactDirectory) so a page can run both in
// parallel and combine them, rather than serializing a live API call
// behind a DB query. `directory` is null only if the fetch itself errored
// (see contactDirectory.ts — each source's absence just leaves its own
// map empty, not the whole directory null); every call then just gets
// companyName/answeredBy: null, not a fabricated guess. answeredBy is
// only set for calls that were actually answered — a missed call has no
// one who took it — and is resolved via internalExtension, same as the
// tech-performance call stats.
export function attachCompanyNames(calls: CallRecord[], directory: ContactDirectory | null): CallWithCompany[] {
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
  avgRingSeconds: number | null;
};

export async function getCallActivitySummary(): Promise<CallActivitySummary> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const todaysCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: startOfToday } },
    select: { missed: true, durationSeconds: true, startAt: true, answeredAt: true },
  });

  const totalToday = todaysCalls.length;
  const missedToday = todaysCalls.filter((c) => c.missed).length;
  const avgDurationSeconds =
    totalToday > 0 ? Math.round(todaysCalls.reduce((sum, c) => sum + c.durationSeconds, 0) / totalToday) : 0;

  // Same start/answer-timestamp math as each row's "rang Ns" — this is
  // just the average of it, across every answered call today. Calls
  // never answered (no answeredAt) don't have a ring time to average in.
  const ringSamples = todaysCalls
    .filter((c) => c.answeredAt)
    .map((c) => Math.round((c.answeredAt!.getTime() - c.startAt.getTime()) / 1000))
    .filter((s) => s >= 0);
  const avgRingSeconds =
    ringSamples.length > 0 ? Math.round(ringSamples.reduce((sum, s) => sum + s, 0) / ringSamples.length) : null;

  return { totalToday, missedToday, avgDurationSeconds, avgRingSeconds };
}

export type TechCallStat = { person: Tech; inbound: number; outbound: number; missed: number };

// "Who called out and in today" — a quick per-tech readout sitting right
// on the call log itself, distinct from Tech Performance's *weekly*
// in/out breakdown (same underlying attribution — internalExtension via
// ContactDirectory.extensionToTech — just a different, tighter window
// matching this page's "today" summary tiles above it, not the 7-day
// window the call list itself covers). Every known tech gets a row, zero
// included, same "no data isn't hidden" pattern as DailyHours/TimeGap —
// a tech missing entirely here (e.g. their extension isn't recorded in
// United Cloud's directory) would read as "took zero calls," which isn't
// the same claim as "genuinely took zero calls today."
export async function getCallStatsByTechToday(directory: ContactDirectory | null): Promise<TechCallStat[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const statsByTech = new Map<Tech, TechCallStat>();
  if (directory) {
    const calls = await prisma.callRecord.findMany({
      where: { startAt: { gte: startOfToday }, internalExtension: { not: null } },
      select: { internalExtension: true, direction: true, missed: true },
    });

    for (const call of calls) {
      const tech = call.internalExtension ? directory.extensionToTech.get(call.internalExtension) : undefined;
      if (!tech) continue;
      const entry = statsByTech.get(tech) ?? { person: tech, inbound: 0, outbound: 0, missed: 0 };
      const isInbound = call.direction === "Inbound";

      if (call.missed) {
        if (isInbound) entry.missed++;
      } else if (isInbound) {
        entry.inbound++;
      } else {
        entry.outbound++;
      }
      statsByTech.set(tech, entry);
    }
  }

  return KNOWN_TECHS.map((person) => statsByTech.get(person) ?? { person, inbound: 0, outbound: 0, missed: 0 });
}
