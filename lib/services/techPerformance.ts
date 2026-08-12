import { prisma } from "@/lib/prisma";
import { startOfWeek } from "@/lib/dateUtils";
import { KNOWN_TECHS, type Tech } from "@/lib/integrations/halopsa";
import { matchKnownTech } from "@/lib/integrations/haloShared";
import type { HaloDirectory } from "@/lib/integrations/haloDirectory";
import { getLoadPerTech } from "./operations";

const TREND_WEEKS = 8;

export type TechTrendPoint = { periodStart: string; loggedHours: number; expectedHours: number };

export type TechPerformance = {
  person: string;
  expectedHours: number;
  loggedHours: number;
  trend: TechTrendPoint[];
  openCount: number;
  p1Count: number;
  agingCount: number;
  callsAnswered: number;
  callsMissed: number;
  avgTalkMinutes: number;
  avgAnswerSeconds: number | null;
  pickupRate: number | null;
};

type CallStats = {
  inboundAnswered: number;
  inboundMissed: number;
  outboundAnswered: number;
  talkSeconds: number;
  ringSeconds: number;
  ringCount: number;
};

// Attributed via CallRecord.internalExtension -> directory.extensionToTech
// (see haloDirectory.ts) — a call whose extension isn't a known agent
// (e.g. it only reached a hunt group, never a specific person) stays
// unattributed rather than guessed. Inbound and outbound are tracked
// separately: pickupRate and avgAnswerSeconds are about how the tech
// handles calls *coming in* to them, so mixing in outbound calls (which
// they always "answer" since they placed them) would inflate both.
// avgTalkMinutes still covers both directions — outbound client calls
// are real work too.
async function getCallStatsByTech(directory: HaloDirectory | null): Promise<Map<Tech, CallStats>> {
  const stats = new Map<Tech, CallStats>();
  if (!directory) return stats;

  const weekStart = startOfWeek();
  const calls = await prisma.callRecord.findMany({
    where: { startAt: { gte: weekStart }, internalExtension: { not: null } },
    select: { internalExtension: true, direction: true, missed: true, durationSeconds: true, startAt: true, answeredAt: true },
  });

  for (const call of calls) {
    const tech = call.internalExtension ? directory.extensionToTech.get(call.internalExtension) : undefined;
    if (!tech) continue;
    const entry = stats.get(tech) ?? {
      inboundAnswered: 0,
      inboundMissed: 0,
      outboundAnswered: 0,
      talkSeconds: 0,
      ringSeconds: 0,
      ringCount: 0,
    };
    const isInbound = call.direction === "Inbound";

    if (call.missed) {
      if (isInbound) entry.inboundMissed++;
    } else {
      if (isInbound) entry.inboundAnswered++;
      else entry.outboundAnswered++;
      entry.talkSeconds += call.durationSeconds;

      if (isInbound && call.answeredAt) {
        const ring = Math.round((call.answeredAt.getTime() - call.startAt.getTime()) / 1000);
        if (ring >= 0) {
          entry.ringSeconds += ring;
          entry.ringCount++;
        }
      }
    }
    stats.set(tech, entry);
  }

  return stats;
}

// Ticket assignment (TicketSnapshot.assignedTech) stores the tech's full
// HaloPSA agent name (e.g. "Cameron Clark"), while TimeGap/KNOWN_TECHS use
// first names only — same substring match used everywhere else a HaloPSA
// agent name needs to line up with the four known techs.
//
// `directory` is passed in (fetched once, in parallel, by the page) rather
// than fetched here — keeps this function's own work to DB reads, same
// separation as callActivity.ts's attachCompanyNames. Pass null when
// HaloPSA isn't connected; every tech's call stats are then just zero,
// not fabricated.
export async function getTechPerformance(directory: HaloDirectory | null): Promise<TechPerformance[]> {
  const weekStart = startOfWeek();
  const trendStart = new Date(weekStart);
  trendStart.setDate(trendStart.getDate() - 7 * (TREND_WEEKS - 1));

  const [currentGaps, trendGaps, load, callStats] = await Promise.all([
    prisma.timeGap.findMany({ where: { role: "TECH", periodStart: weekStart } }),
    prisma.timeGap.findMany({
      where: { role: "TECH", periodStart: { gte: trendStart } },
      orderBy: { periodStart: "asc" },
    }),
    getLoadPerTech(),
    getCallStatsByTech(directory),
  ]);

  const currentByPerson = new Map(currentGaps.map((g) => [g.person, g]));

  const trendByPerson = new Map<string, TechTrendPoint[]>();
  for (const g of trendGaps) {
    const points = trendByPerson.get(g.person) ?? [];
    points.push({
      periodStart: g.periodStart.toISOString(),
      loggedHours: g.loggedHours,
      expectedHours: g.expectedHours,
    });
    trendByPerson.set(g.person, points);
  }

  const loadByPerson = new Map<string, { openCount: number; p1Count: number; agingCount: number }>();
  for (const entry of load) {
    const person = matchKnownTech(entry.tech, KNOWN_TECHS);
    if (!person) continue;
    const existing = loadByPerson.get(person) ?? { openCount: 0, p1Count: 0, agingCount: 0 };
    loadByPerson.set(person, {
      openCount: existing.openCount + entry.openCount,
      p1Count: existing.p1Count + entry.p1Count,
      agingCount: existing.agingCount + entry.agingCount,
    });
  }

  return KNOWN_TECHS.map((person) => {
    const gap = currentByPerson.get(person);
    const l = loadByPerson.get(person);
    const c = callStats.get(person);
    const callsAnswered = (c?.inboundAnswered ?? 0) + (c?.outboundAnswered ?? 0);
    const avgTalkMinutes = c && callsAnswered > 0 ? Math.round((c.talkSeconds / callsAnswered / 60) * 10) / 10 : 0;
    const avgAnswerSeconds = c && c.ringCount > 0 ? Math.round(c.ringSeconds / c.ringCount) : null;
    const inboundTotal = (c?.inboundAnswered ?? 0) + (c?.inboundMissed ?? 0);
    const pickupRate = c && inboundTotal > 0 ? c.inboundAnswered / inboundTotal : null;
    return {
      person,
      expectedHours: gap?.expectedHours ?? 40,
      loggedHours: gap?.loggedHours ?? 0,
      trend: trendByPerson.get(person) ?? [],
      openCount: l?.openCount ?? 0,
      p1Count: l?.p1Count ?? 0,
      agingCount: l?.agingCount ?? 0,
      callsAnswered,
      callsMissed: c?.inboundMissed ?? 0,
      avgTalkMinutes,
      avgAnswerSeconds,
      pickupRate,
    };
  });
}
