import { describe, expect, it } from "vitest";
import { categorizeAgreementItem, buildAgreementBreakdown, computeClientLaborSnapshot } from "./clientProfitability";

describe("categorizeAgreementItem", () => {
  it("matches M365 items", () => {
    expect(categorizeAgreementItem("Microsoft 365 | Business Standard (NCE) - Monthly")).toBe("M365");
    expect(categorizeAgreementItem("Exchange Online (Plan 1)")).toBe("M365");
  });

  it("matches Backup items, even when they also mention 'managed'", () => {
    expect(categorizeAgreementItem("Managed Backup Service")).toBe("Backup");
    expect(categorizeAgreementItem("Cloud BDR")).toBe("Backup");
  });

  it("matches Security items", () => {
    expect(categorizeAgreementItem("Endpoint Protection - Antivirus")).toBe("Security");
  });

  it("falls back to Service for the core managed-services line", () => {
    expect(categorizeAgreementItem("DataStream - Managed Essential IT")).toBe("Service");
  });

  it("falls back to Other when nothing matches", () => {
    expect(categorizeAgreementItem("Widget Rental")).toBe("Other");
  });
});

describe("buildAgreementBreakdown", () => {
  it("groups items by category and sums priced items only", () => {
    const groups = buildAgreementBreakdown([
      { id: "1", name: "Microsoft 365 | Business Standard", quantity: 10, unitPrice: 20, unitCost: 17 },
      { id: "2", name: "DataStream - Managed Essential IT", quantity: 5, unitPrice: 130, unitCost: null },
      { id: "3", name: "DataStream - IT Support Retainer", quantity: 1, unitPrice: null, unitCost: null },
    ]);

    const m365 = groups.find((g) => g.category === "M365")!;
    expect(m365.monthlyValue).toBe(200);
    expect(m365.hasUnpricedItems).toBe(false);

    const service = groups.find((g) => g.category === "Service")!;
    // Two items land here: the real recurring line, and the unpriced
    // fallback contract row — same category, real quantity math should
    // only count the priced one.
    expect(service.items).toHaveLength(2);
    expect(service.monthlyValue).toBe(650);
    expect(service.hasUnpricedItems).toBe(true);
  });

  it("returns categories in a fixed display order, omitting empty ones", () => {
    const groups = buildAgreementBreakdown([{ id: "1", name: "Firewall Management", quantity: 1, unitPrice: 50, unitCost: 20 }]);
    expect(groups.map((g) => g.category)).toEqual(["Security"]);
  });

  it("computes real Product Profit (revenue - cost) per category, e.g. Fortress/Protect-style products", () => {
    const groups = buildAgreementBreakdown([
      { id: "1", name: "Fortress Security 2025 | Advanced Security", quantity: 10, unitPrice: 37, unitCost: 13.62 },
      { id: "2", name: "DataStream Protect | Virtual Machine Server", quantity: 3, unitPrice: 68.95, unitCost: 28.99 },
    ]);

    const security = groups.find((g) => g.category === "Security")!;
    expect(security.monthlyValue).toBe(370);
    expect(security.monthlyCost).toBeCloseTo(136.2);
    expect(security.monthlyProfit).toBeCloseTo(233.8);
    expect(security.hasUnknownCost).toBe(false);

    const backup = groups.find((g) => g.category === "Backup")!;
    expect(backup.monthlyValue).toBeCloseTo(206.85);
    expect(backup.monthlyCost).toBeCloseTo(86.97);
    expect(backup.hasUnknownCost).toBe(false);
  });

  it("never computes a Product Profit for Service — that category uses hours × rate instead", () => {
    const groups = buildAgreementBreakdown([
      { id: "1", name: "DataStream - Managed Essential IT", quantity: 10, unitPrice: 130, unitCost: 0 },
    ]);
    const service = groups.find((g) => g.category === "Service")!;
    expect(service.monthlyCost).toBe(0);
    expect(service.monthlyProfit).toBe(0);
    expect(service.hasUnknownCost).toBe(false);
  });

  it("flags a category as hasUnknownCost when a priced item has no matching catalog cost", () => {
    const groups = buildAgreementBreakdown([
      { id: "1", name: "Fortress Security 2025 | Monitoring", quantity: 1, unitPrice: 9, unitCost: null },
    ]);
    const security = groups.find((g) => g.category === "Security")!;
    expect(security.hasUnknownCost).toBe(true);
    expect(security.monthlyCost).toBe(0);
  });
});

describe("computeClientLaborSnapshot", () => {
  it("computes effective hourly rate from the trailing 3-month average, ignoring older months", () => {
    const result = computeClientLaborSnapshot({
      laborLineValue: 1300,
      monthlyHoursHistory: [
        { yearMonth: "2026-08", hours: 10 },
        { yearMonth: "2026-07", hours: 20 },
        { yearMonth: "2026-06", hours: 30 },
        { yearMonth: "2026-05", hours: 1000 }, // outside the trailing window — must not affect the average
      ],
      hoursThisMonth: 10,
      laborHourlyRate: 65,
    });
    // avg(10, 20, 30) = 20 -> 1300 / 20 = 65
    expect(result.avgHoursLastQuarter).toBe(20);
    expect(result.effectiveHourlyRate).toBe(65);
  });

  it("returns null (not 0 or Infinity) when there's no hours history yet", () => {
    const result = computeClientLaborSnapshot({
      laborLineValue: 1300,
      monthlyHoursHistory: [],
      hoursThisMonth: 0,
      laborHourlyRate: 65,
    });
    expect(result.avgHoursLastQuarter).toBeNull();
    expect(result.effectiveHourlyRate).toBeNull();
  });

  it("computes labor cost and profit from this month's hours and the given rate", () => {
    const result = computeClientLaborSnapshot({
      laborLineValue: 2000,
      monthlyHoursHistory: [{ yearMonth: "2026-08", hours: 15 }],
      hoursThisMonth: 15,
      laborHourlyRate: 65,
    });
    expect(result.laborCost).toBe(975);
    expect(result.laborProfit).toBe(1025);
  });

  it("labor cost is honestly 0 (not fabricated) when the rate isn't configured", () => {
    const result = computeClientLaborSnapshot({
      laborLineValue: 2000,
      monthlyHoursHistory: [{ yearMonth: "2026-08", hours: 15 }],
      hoursThisMonth: 15,
      laborHourlyRate: 0,
    });
    expect(result.laborCost).toBe(0);
    expect(result.laborProfit).toBe(2000);
  });
});
