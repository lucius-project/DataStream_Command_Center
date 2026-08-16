import { describe, it, expect } from "vitest";
import { computeHealthScore, type SlaMetric, type NetTicketChange } from "./serviceDeskHealth";
import type { TechActionableAging } from "./operations";

const UNAVAILABLE_SLA: SlaMetric = { status: "unavailable", pct: null, met: 0, eligible: 0, medianHours: null };
const FLAT_NET: NetTicketChange = { createdToday: 0, closedToday: 0, net: 0, label: "KEEPING_PACE" };
const ZERO_AGING: TechActionableAging = {
  total: 0,
  byBucket: { "0-4h": 0, "4-8h": 0, "8-24h": 0, "1-3d": 0, "3-7d": 0, "7d+": 0 },
  agingOver24h: 0,
};

describe("computeHealthScore", () => {
  // Workload is the one category that's never null (workloadScore is
  // always computed from net/aging directly) — putting 100% of the
  // weight on it, with everything else unavailable/zero-weighted,
  // isolates the composite to exactly workload's own score. A clean way
  // to prove the weight-rebalancing math is correct without hand-computing
  // fractional rounding across several categories.
  it("weights a single available category to exactly its own score when it holds all the weight", () => {
    const result = computeHealthScore(
      UNAVAILABLE_SLA,
      UNAVAILABLE_SLA,
      FLAT_NET, // net.net = 0 and aging.agingOver24h = 0 -> workloadScore = 100
      ZERO_AGING,
      { status: "unavailable", pct: null },
      { responsiveness: 0, resolution: 0, workload: 100, phone: 0 },
      5,
      30,
    );
    expect(result.score).toBe(100);
    expect(result.categories.find((c) => c.key === "workload")?.weightPct).toBe(100);
  });

  // The regression case for the fabricated-0-score bug: workload is
  // available (it always is), but every available category's own
  // configured weight is 0 — all 100% of the weight is parked on Phone,
  // which is unavailable today (no calls yet). Before the fix this
  // computed baseWeightSum = 0 and returned score: 0, reading as "the
  // desk is failing" instead of "no real signal contributed."
  it("returns null, not 0, when every available category has 0 configured weight", () => {
    const result = computeHealthScore(
      UNAVAILABLE_SLA,
      UNAVAILABLE_SLA,
      FLAT_NET,
      ZERO_AGING,
      { status: "unavailable", pct: null }, // Phone unavailable — no calls yet today
      { responsiveness: 0, resolution: 0, workload: 0, phone: 100 },
      5,
      30,
    );
    expect(result.score).toBeNull();
  });
});
