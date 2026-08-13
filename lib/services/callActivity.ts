import { prisma } from "@/lib/prisma";
import { isBusinessHours } from "@/lib/dateUtils";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import type { ContactDirectory } from "@/lib/integrations/contactDirectory";
import type { CallRecord } from "@/app/generated/prisma/client";
import type { KpiTrend } from "./businessHealth";
// stats.ts is dependency-free (unlike serviceDeskHealth.ts, which
// imports getCallActivitySummary from this file — importing its median
// back here would be circular), so both this file and serviceDeskHealth.ts
// can safely share one implementation via stats.ts instead of each
// keeping their own copy.
import { median, percentile90, buildTrend } from "./stats";

const RECENT_CALLS_LIMIT = 100;

// Below this many samples, a median/P90 is misleadingly precise — same
// principle as MIN_SLA_SAMPLE elsewhere in this app.
const MIN_PERCENTILE_SAMPLE = 5;

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
  // Rolling-30 vs. the preceding 30-day window (days 31-60 back) — used
  // by coaching.ts (Phase 11) for an org-level Call Answer Rate insight.
  // undefined (not a fabricated flat trend) when either window has zero
  // calls, same "omit rather than fabricate" rule buildTrend already
  // enforces everywhere else.
  trend: KpiTrend | undefined;
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
  const prior30Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
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
  let prior30Total = 0;
  let prior30Missed = 0;
  const byMonth = new Map<string, { total: number; missed: number }>();

  for (const call of calls) {
    if (call.startAt >= rolling30Start) {
      rolling30Total++;
      if (call.missed) rolling30Missed++;
    } else if (call.startAt >= prior30Start) {
      prior30Total++;
      if (call.missed) prior30Missed++;
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

  const rolling30AnswerRatePct =
    rolling30Total > 0 ? Math.round(((rolling30Total - rolling30Missed) / rolling30Total) * 1000) / 10 : null;
  const prior30AnswerRatePct =
    prior30Total > 0 ? Math.round(((prior30Total - prior30Missed) / prior30Total) * 1000) / 10 : null;

  return {
    rolling30: {
      totalCalls: rolling30Total,
      missedCalls: rolling30Missed,
      answerRatePct: rolling30AnswerRatePct,
    },
    monthly,
    // flatBelow: 3 (not buildTrend's 0.5 default) — a sub-3-point answer
    // rate wobble isn't worth flagging as a trend at all here, same
    // insight-worthiness floor coaching.ts (Phase 11) applies to its own
    // SLA statements, kept consistent by setting it at the source rather
    // than re-filtering downstream.
    trend:
      rolling30AnswerRatePct !== null
        ? buildTrend(rolling30AnswerRatePct, prior30AnswerRatePct, "up", (delta) => `${delta >= 0 ? "+" : ""}${Math.round(delta * 10) / 10}pts vs prior 30 days`, 3)
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Missed-call callback tracking
// ---------------------------------------------------------------------------

// A missed call counts as "returned" once any later outbound call to the
// same number exists — not any outbound call ever, only one that happened
// *after* the miss, since an earlier unrelated call to that number
// obviously isn't a callback. Judgment call, not a cited industry figure,
// same honesty pattern as every other threshold in this app.
const CALLBACK_TARGET_MINUTES = 15;
const CALLBACK_LOOKBACK_HOURS = 8;

type MissedCallLike = {
  id: string;
  startAt: Date;
  missed: boolean;
  direction: string;
  externalNumber: string | null;
};

type CallbackMatch<T> = { call: T; returnedAt: Date | null };

// Shared by getUnreturnedMissedCalls (the live "still outstanding" queue)
// and getMissedCallRecoveryStats (the historical callback-rate/latency
// aggregate) — one definition of "was this missed call returned," not
// two independently-tuned ones. `calls` should already be
// business-hours-filtered and excludeFalseMisses-applied by the caller.
function matchMissedCallsToCallbacks<T extends MissedCallLike>(calls: T[]): CallbackMatch<T>[] {
  const missedInbound = calls.filter((c) => c.missed && c.direction === "Inbound" && c.externalNumber);
  if (missedInbound.length === 0) return [];

  // Every outbound call's number, for a fast "was this number called
  // back at all" pre-check before the per-call timestamp comparison.
  const outboundByNumber = new Map<string, Date[]>();
  for (const c of calls) {
    if (c.direction === "Outbound" && c.externalNumber) {
      const arr = outboundByNumber.get(c.externalNumber) ?? [];
      arr.push(c.startAt);
      outboundByNumber.set(c.externalNumber, arr);
    }
  }

  return missedInbound.map((call) => {
    const laterOutbound = (outboundByNumber.get(call.externalNumber!) ?? [])
      .filter((t) => t > call.startAt)
      .sort((a, b) => a.getTime() - b.getTime());
    return { call, returnedAt: laterOutbound[0] ?? null };
  });
}

export type UnreturnedCall = {
  id: string;
  externalNumber: string;
  companyName: string | null;
  missedAt: Date;
  minutesSinceMissed: number;
};

// Scoped to today's business-hours, genuinely-missed (excludeFalseMisses
// already applied) inbound calls — a call that never rang a desk phone
// or was actually answered by someone else was never "missed" in the
// first place, so it can't be "unreturned" either. Only flags a miss
// once CALLBACK_TARGET_MINUTES has actually elapsed — a call missed 2
// minutes ago isn't overdue yet, it just hasn't been called back.
export async function getUnreturnedMissedCalls(directory: ContactDirectory | null): Promise<UnreturnedCall[]> {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - CALLBACK_LOOKBACK_HOURS * 60 * 60 * 1000);

  const rawCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: lookbackStart } },
    select: { id: true, startAt: true, missed: true, direction: true, externalNumber: true, internalExtension: true },
    orderBy: { startAt: "asc" },
  });
  const calls = excludeFalseMisses(
    rawCalls.filter((c) => isBusinessHours(c.startAt)),
    directory,
  );

  const matches = matchMissedCallsToCallbacks(calls);

  const unreturned: UnreturnedCall[] = [];
  for (const { call, returnedAt } of matches) {
    if (returnedAt) continue;

    const minutesSinceMissed = Math.round((now.getTime() - call.startAt.getTime()) / 60000);
    if (minutesSinceMissed < CALLBACK_TARGET_MINUTES) continue;

    unreturned.push({
      id: call.id,
      externalNumber: call.externalNumber!,
      companyName: directory?.phoneToCompany.get(call.externalNumber!) ?? null,
      missedAt: call.startAt,
      minutesSinceMissed,
    });
  }

  return unreturned.sort((a, b) => b.minutesSinceMissed - a.minutesSinceMissed);
}

// Matches United Cloud's own sync depth (see getCallAnswerRateTrend's
// comment) — history only exists as far back as this integration has
// been connected and synced regularly, so a longer window would just
// silently under-count rather than reach further back in time.
const ANALYTICS_WINDOW_DAYS = 7;

export type MissedCallRecoveryStats = {
  status: "available" | "insufficient_sample" | "unavailable";
  windowDays: number;
  missedCalls: number;
  returnedCalls: number;
  unreturnedCalls: number;
  callbackPct: number | null;
  medianCallbackMinutes: number | null;
  p90CallbackMinutes: number | null;
};

// Historical callback rate/latency over ANALYTICS_WINDOW_DAYS — distinct
// from getUnreturnedMissedCalls above (a live "still outstanding right
// now" queue). A call counted "returned" here might have taken hours to
// come back to, unlike the live queue's fixed lookback window; this is
// the honest historical record, that's the operational alert.
export async function getMissedCallRecoveryStats(directory: ContactDirectory | null): Promise<MissedCallRecoveryStats> {
  const windowStart = new Date(Date.now() - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rawCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: windowStart } },
    select: { id: true, startAt: true, missed: true, direction: true, externalNumber: true, internalExtension: true },
    orderBy: { startAt: "asc" },
  });
  const calls = excludeFalseMisses(rawCalls.filter((c) => isBusinessHours(c.startAt)), directory);
  const matches = matchMissedCallsToCallbacks(calls);

  const missedCalls = matches.length;
  const returned = matches.filter((m) => m.returnedAt !== null);
  const returnedCalls = returned.length;
  const callbackMinutes = returned.map((m) => Math.round((m.returnedAt!.getTime() - m.call.startAt.getTime()) / 60000));

  const base = {
    windowDays: ANALYTICS_WINDOW_DAYS,
    missedCalls,
    returnedCalls,
    unreturnedCalls: missedCalls - returnedCalls,
    medianCallbackMinutes: median(callbackMinutes),
    p90CallbackMinutes: percentile90(callbackMinutes),
  };

  if (missedCalls === 0) return { ...base, status: "unavailable", callbackPct: null };
  if (missedCalls < MIN_PERCENTILE_SAMPLE) return { ...base, status: "insufficient_sample", callbackPct: null };
  return { ...base, status: "available", callbackPct: Math.round((returnedCalls / missedCalls) * 1000) / 10 };
}

export type PhoneAnalyticsDetail = {
  windowDays: number;
  inboundCalls: number;
  outboundCalls: number;
  answeredInbound: number;
  missedInbound: number;
  answerRatePct: number | null;
  ringTimeStatus: "available" | "insufficient_sample" | "unavailable";
  medianRingSeconds: number | null;
  p90RingSeconds: number | null;
  talkTimeStatus: "available" | "insufficient_sample" | "unavailable";
  medianTalkSeconds: number | null;
  p90TalkSeconds: number | null;
  afterHours: { inboundCalls: number; answered: number; missed: number };
};

// Rolling-window detail behind the simple "today" tiles on the Call
// Activity page — median/P90 (not just average) answer and talk time,
// plus after-hours volume tracked as its own honest bucket rather than
// silently dropped. After-hours calls are excluded from every other
// number here (ring/talk time, answer rate) for the same reason
// isBusinessHours exists everywhere else in this app: nobody was ever
// meant to answer them, so folding them in would misrepresent both the
// after-hours bucket and the business-hours one.
export async function getPhoneAnalyticsDetail(directory: ContactDirectory | null): Promise<PhoneAnalyticsDetail> {
  const windowStart = new Date(Date.now() - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rawCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: windowStart } },
    select: { startAt: true, missed: true, direction: true, durationSeconds: true, answeredAt: true, internalExtension: true },
  });
  // excludeFalseMisses applied before the business/after-hours split, not
  // after — a queue-abandon or simultaneous-ring duplicate is just as
  // false a "miss" at 9pm as it is at 9am.
  const calls = excludeFalseMisses(rawCalls, directory);
  const businessCalls = calls.filter((c) => isBusinessHours(c.startAt));
  const afterHoursCalls = calls.filter((c) => !isBusinessHours(c.startAt));

  const inbound = businessCalls.filter((c) => c.direction === "Inbound");
  const outbound = businessCalls.filter((c) => c.direction === "Outbound");
  const answeredInbound = inbound.filter((c) => !c.missed);
  const missedInbound = inbound.filter((c) => c.missed);

  const ringSamples = answeredInbound
    .filter((c) => c.answeredAt)
    .map((c) => Math.round((c.answeredAt!.getTime() - c.startAt.getTime()) / 1000))
    .filter((s) => s >= 0);
  const talkSamples = businessCalls.filter((c) => !c.missed).map((c) => c.durationSeconds);

  const afterHoursInbound = afterHoursCalls.filter((c) => c.direction === "Inbound");

  return {
    windowDays: ANALYTICS_WINDOW_DAYS,
    inboundCalls: inbound.length,
    outboundCalls: outbound.length,
    answeredInbound: answeredInbound.length,
    missedInbound: missedInbound.length,
    answerRatePct: inbound.length > 0 ? Math.round((answeredInbound.length / inbound.length) * 1000) / 10 : null,
    ringTimeStatus: ringSamples.length === 0 ? "unavailable" : ringSamples.length < MIN_PERCENTILE_SAMPLE ? "insufficient_sample" : "available",
    medianRingSeconds: median(ringSamples),
    p90RingSeconds: percentile90(ringSamples),
    talkTimeStatus: talkSamples.length === 0 ? "unavailable" : talkSamples.length < MIN_PERCENTILE_SAMPLE ? "insufficient_sample" : "available",
    medianTalkSeconds: median(talkSamples),
    p90TalkSeconds: percentile90(talkSamples),
    afterHours: {
      inboundCalls: afterHoursInbound.length,
      answered: afterHoursInbound.filter((c) => !c.missed).length,
      missed: afterHoursInbound.filter((c) => c.missed).length,
    },
  };
}

export type ClientCallVolume = { companyName: string; calls: number; missed: number };
export type CallsPerClient = { topClients: ClientCallVolume[]; unresolvedCalls: number; windowDays: number };

// Numbers that don't resolve to a known company (directory.phoneToCompany
// — see contactDirectory.ts) are counted, not silently dropped or
// guessed at — see unresolvedCalls.
export async function getCallsPerClient(directory: ContactDirectory | null, limit = 8): Promise<CallsPerClient> {
  const windowStart = new Date(Date.now() - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rawCalls = await prisma.callRecord.findMany({
    where: { startAt: { gte: windowStart } },
    select: { startAt: true, missed: true, direction: true, externalNumber: true, internalExtension: true },
  });
  const calls = excludeFalseMisses(rawCalls.filter((c) => isBusinessHours(c.startAt)), directory);

  const byCompany = new Map<string, ClientCallVolume>();
  let unresolvedCalls = 0;
  for (const c of calls) {
    const company = c.externalNumber ? directory?.phoneToCompany.get(c.externalNumber) : undefined;
    if (!company) {
      unresolvedCalls++;
      continue;
    }
    const entry = byCompany.get(company) ?? { companyName: company, calls: 0, missed: 0 };
    entry.calls++;
    if (c.missed && c.direction === "Inbound") entry.missed++;
    byCompany.set(company, entry);
  }

  const topClients = [...byCompany.values()].sort((a, b) => b.calls - a.calls).slice(0, limit);
  return { topClients, unresolvedCalls, windowDays: ANALYTICS_WINDOW_DAYS };
}
