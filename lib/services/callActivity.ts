import { prisma } from "@/lib/prisma";
import { isBusinessHours } from "@/lib/dateUtils";
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

// A "missed" call that never actually gave anyone a chance to answer
// it — two real patterns confirmed against this system's live CDR data,
// not a guessed heuristic:
//
//   1. Queue/system-extension abandons — the call disconnected while
//      still sitting on a system extension (a call queue, time-of-day
//      route, etc. — see ContactDirectory.systemExtensions, sourced
//      from each United Cloud user's own "service-code" field) and
//      never reached an individual desk phone at all. Confirmed live:
//      3 of 4 "missed" calls in a sampled week never left extension
//      5200 (the "DataStream Queue"), with call durations of 2-55s that
//      were all queue hold time, not ring time.
//   2. Simultaneous-ring duplicate legs — United Cloud logs one CDR row
//      per phone that rings for an incoming call. When multiple
//      extensions ring at once and one answers, the losing leg(s) still
//      generate their own "missed" CDR row for the exact same call,
//      even though the call itself WAS handled. Confirmed live: a real
//      call at 2026-08-10T21:22:31Z produced two CDRs sharing that
//      identical start time — one answered by Cameron (ext 105), one
//      "missed" on Lucius's extension (101) — same call, one real
//      outcome. Detected by another CallRecord sharing the identical
//      startAt where missed is false.
//
// `directory` null (source unreachable) only disables pattern 1 —
// pattern 2 needs no external data, just the calls already in hand.
export function excludeFalseMisses<T extends { startAt: Date; missed: boolean; internalExtension: string | null }>(
  calls: T[],
  directory: ContactDirectory | null,
): T[] {
  const answeredStarts = new Set(calls.filter((c) => !c.missed).map((c) => c.startAt.getTime()));

  return calls.filter((call) => {
    if (!call.missed) return true;
    if (answeredStarts.has(call.startAt.getTime())) return false;
    if (directory && call.internalExtension && directory.systemExtensions.has(call.internalExtension)) return false;
    return true;
  });
}

export type CallActivitySummary = {
  totalToday: number; // both directions — general call volume
  inboundToday: number; // the correct denominator for an answer-rate %
  // Inbound only. An "missed" outbound call just means the other party
  // didn't pick up when we called them — that's not a team
  // responsiveness failure, same reasoning techPerformance.ts's CallStats
  // already applies (see its inboundMissed/outboundMissed split).
  // Counting outbound misses here would drag "today's answer rate" down
  // for something that was never the team's to answer.
  missedToday: number;
  avgDurationSeconds: number; // talk time, both directions — outbound work is real work too
  avgRingSeconds: number | null; // inbound only, same reasoning as missedToday
};

export async function getCallActivitySummary(directory: ContactDirectory | null): Promise<CallActivitySummary> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const rawCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: startOfToday } },
    select: { missed: true, durationSeconds: true, startAt: true, answeredAt: true, internalExtension: true, direction: true },
  });

  // After-hours inbound calls route straight to voicemail — nobody was
  // ever meant to pick those up, so counting them as "missed" would
  // unfairly drag down every performance number below. Excluded from
  // every calculation on this page (and everywhere else CallRecord feeds
  // a stat — see isBusinessHours in dateUtils.ts); the raw call log
  // itself (getRecentCalls) is untouched, so an after-hours call still
  // shows up in the list, it just doesn't count against anyone.
  // excludeFalseMisses (above) strips queue-abandons and simultaneous-
  // ring duplicate legs the same way.
  const todaysCalls = excludeFalseMisses(rawCalls.filter((c) => isBusinessHours(c.startAt)), directory);
  const inboundCalls = todaysCalls.filter((c) => c.direction === "Inbound");

  const totalToday = todaysCalls.length;
  const inboundToday = inboundCalls.length;
  const missedToday = inboundCalls.filter((c) => c.missed).length;
  const avgDurationSeconds =
    totalToday > 0 ? Math.round(todaysCalls.reduce((sum, c) => sum + c.durationSeconds, 0) / totalToday) : 0;

  // Same start/answer-timestamp math as each row's "rang Ns" — this is
  // just the average of it, across every answered inbound call today.
  // Calls never answered (no answeredAt) don't have a ring time to
  // average in.
  const ringSamples = inboundCalls
    .filter((c) => c.answeredAt)
    .map((c) => Math.round((c.answeredAt!.getTime() - c.startAt.getTime()) / 1000))
    .filter((s) => s >= 0);
  const avgRingSeconds =
    ringSamples.length > 0 ? Math.round(ringSamples.reduce((sum, s) => sum + s, 0) / ringSamples.length) : null;

  return { totalToday, inboundToday, missedToday, avgDurationSeconds, avgRingSeconds };
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
    const rawCalls = await prisma.callRecord.findMany({
      where: { startAt: { gte: startOfToday }, internalExtension: { not: null } },
      select: { internalExtension: true, direction: true, missed: true, startAt: true },
    });
    // isBusinessHours: after-hours calls go to voicemail, not a tech.
    // excludeFalseMisses: strips queue-abandons and simultaneous-ring
    // duplicate legs (see its comment above) — without this, a real
    // call answered by one tech could still count as a "missed" call
    // against a *different* tech whose phone happened to ring in
    // parallel and lost.
    const calls = excludeFalseMisses(rawCalls.filter((c) => isBusinessHours(c.startAt)), directory);

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

export type MonthlyCallStat = {
  yearMonth: string; // "2026-08", sortable as a string
  label: string; // "Aug 2026"
  totalCalls: number;
  missedCalls: number;
  // null (not 0) when totalCalls is 0 — a month with no calls synced yet
  // isn't the same claim as "0% answered", same honesty pattern as every
  // other "no data" state in this app.
  answerRatePct: number | null;
};

export type CallAnswerRateTrend = {
  rolling30: { totalCalls: number; missedCalls: number; answerRatePct: number | null };
  // Oldest first, 12 entries, current (partial) month last.
  monthly: MonthlyCallStat[];
};

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

// CallRecord rows are only ever upserted, never deleted (see
// unitedCloud.ts) — but United Cloud's own sync only *fetches* the last
// 7 rolling days each time, so history only exists as far back as this
// integration has been connected and synced regularly, not a real 12
// months from day one. Same "label the actual window, don't fake depth"
// approach as Client Profitability's rolling average: months before the
// integration existed simply show answerRatePct: null (see
// MonthlyCallStat) rather than a fabricated 0%, and this builds up into
// real 12-month depth the longer the integration stays connected.
export async function getCallAnswerRateTrend(directory: ContactDirectory | null): Promise<CallAnswerRateTrend> {
  const now = new Date();
  const rolling30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const rawCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: twelveMonthsAgo } },
    select: { startAt: true, missed: true, internalExtension: true, direction: true },
  });
  // isBusinessHours: after-hours calls route to voicemail, not a tech.
  // excludeFalseMisses: strips queue-abandons and simultaneous-ring
  // duplicate legs (see its comment above). Scoped to Inbound only —
  // "answer rate" is inherently about calls coming in; an outbound call
  // the other party didn't pick up isn't a team miss (same reasoning as
  // CallActivitySummary.missedToday above), and mixing it in would
  // pollute the denominator with calls that always "succeed" from our
  // own side, not just the numerator.
  const calls = excludeFalseMisses(rawCalls.filter((c) => isBusinessHours(c.startAt)), directory).filter(
    (c) => c.direction === "Inbound",
  );

  let rolling30Total = 0;
  let rolling30Missed = 0;
  const byMonth = new Map<string, { total: number; missed: number }>();

  for (const call of calls) {
    if (call.startAt >= rolling30Start) {
      rolling30Total++;
      if (call.missed) rolling30Missed++;
    }
    const key = monthKey(call.startAt);
    const entry = byMonth.get(key) ?? { total: 0, missed: 0 };
    entry.total++;
    if (call.missed) entry.missed++;
    byMonth.set(key, entry);
  }

  const monthly: MonthlyCallStat[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    const entry = byMonth.get(key);
    const totalCalls = entry?.total ?? 0;
    const missedCalls = entry?.missed ?? 0;
    monthly.push({
      yearMonth: key,
      label: MONTH_LABEL_FORMAT.format(d),
      totalCalls,
      missedCalls,
      answerRatePct: totalCalls > 0 ? Math.round(((totalCalls - missedCalls) / totalCalls) * 1000) / 10 : null,
    });
  }

  return {
    rolling30: {
      totalCalls: rolling30Total,
      missedCalls: rolling30Missed,
      answerRatePct:
        rolling30Total > 0 ? Math.round(((rolling30Total - rolling30Missed) / rolling30Total) * 1000) / 10 : null,
    },
    monthly,
  };
}
