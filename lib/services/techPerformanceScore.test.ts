import { describe, it, expect } from "vitest";
import { computeTechPerformanceScore, type TechServiceMetrics } from "./techPerformanceScore";
import type { TechPerformance } from "./techPerformance";

// Quality and Phone are permanently null at the individual level (no
// live computation exists for either — see this function's own raw
// array), so they're excluded from `available` regardless of weight.
// Only these fields matter here: agingCount/onHoldCount/pacePct feed
// workManagementScore, closedThisWeek feeds productivityScore, and
// responseSla/resolutionSla/medianFirstResponseHours feed
// serviceDeliveryScore — everything else on these large types is
// irrelevant to the pure scoring math under test.
const BASE_TECH = { agingCount: 5, onHoldCount: 5, pacePct: 50 } as unknown as TechPerformance;
const BASE_METRICS: TechServiceMetrics = {
  responseSla: { status: "unavailable", pct: null, met: 0, eligible: 0 },
  resolutionSla: { status: "unavailable", pct: null, met: 0, eligible: 0 },
  medianFirstResponseHours: null,
  closedThisWeek: 12, // >= SERVICE_DESK_TECHNICIAN's green band (12) -> productivityScore = 100
  staleCount: 10,
  responseMisses: [],
  resolutionMisses: [],
  closedTicketsThisWeek: [],
};

describe("computeTechPerformanceScore", () => {
  // Service Delivery is unavailable here (no eligible tickets), so with
  // every other weight at 0, Productivity's 100% weight isolates the
  // composite to exactly its own score — regardless of how bad
  // Work Management's own inputs are (aging/on-hold/pace all
  // deliberately poor in BASE_TECH), since its weightPct works out to 0.
  it("weights a single available category to exactly its own score when it holds all the weight", () => {
    const result = computeTechPerformanceScore(BASE_TECH, BASE_METRICS, "SERVICE_DESK_TECHNICIAN", {
      serviceDelivery: 0,
      quality: 0,
      productivity: 100,
      workManagement: 0,
      phone: 0,
    });
    expect(result.score).toBe(100);
    expect(result.categories.find((c) => c.key === "quality")?.score).toBeNull();
    expect(result.categories.find((c) => c.key === "phone")?.score).toBeNull();
  });

  // The regression case for the fabricated-0-score bug: Productivity and
  // Work Management are always available (never null), but if an admin
  // parks all the weight on Quality (permanently null per-tech), every
  // available category's own weight is 0 — before the fix this computed
  // baseWeightSum = 0 and returned score: 0 for every technician.
  it("returns null, not 0, when every available category has 0 configured weight", () => {
    const result = computeTechPerformanceScore(BASE_TECH, BASE_METRICS, "SERVICE_DESK_TECHNICIAN", {
      serviceDelivery: 0,
      quality: 100,
      productivity: 0,
      workManagement: 0,
      phone: 0,
    });
    expect(result.score).toBeNull();
  });

  it("role-normalizes productivity — the same throughput reads differently for an escalation engineer", () => {
    const weights = { serviceDelivery: 0, quality: 0, productivity: 100, workManagement: 0, phone: 0 };
    const metrics = { ...BASE_METRICS, closedThisWeek: 5 };
    // 5 closed/week is below SERVICE_DESK_TECHNICIAN's green band (12) and yellow band (6) -> the lower "> 0" tier (45).
    const techResult = computeTechPerformanceScore(BASE_TECH, metrics, "SERVICE_DESK_TECHNICIAN", weights);
    // ...but at/above ESCALATION_ENGINEER's green band (5) -> full 100.
    const escalationResult = computeTechPerformanceScore(BASE_TECH, metrics, "ESCALATION_ENGINEER", weights);
    expect(techResult.score).toBe(45);
    expect(escalationResult.score).toBe(100);
  });
});
