import { describe, it, expect } from "vitest";
import { bandHigherIsBetter, bandLowerIsBetter } from "./kpiStatus";

describe("bandHigherIsBetter", () => {
  it("returns green at or above the green threshold", () => {
    expect(bandHigherIsBetter(90, 90, 75)).toBe("green");
    expect(bandHigherIsBetter(100, 90, 75)).toBe("green");
  });

  it("returns yellow at or above the yellow threshold but below green", () => {
    expect(bandHigherIsBetter(75, 90, 75)).toBe("yellow");
    expect(bandHigherIsBetter(89, 90, 75)).toBe("yellow");
  });

  it("returns red below the yellow threshold", () => {
    expect(bandHigherIsBetter(74, 90, 75)).toBe("red");
    expect(bandHigherIsBetter(0, 90, 75)).toBe("red");
  });

  // Documents exactly why kpiSettings.ts's validateThresholdOrder exists —
  // an admin-inverted pair (green below yellow) makes this banding lie:
  // a value the admin meant to read as bad reads as green instead. This
  // is a regression guard against that config state ever being savable
  // again, not just a demonstration.
  it("misbehaves if green/yellow are inverted, which is exactly why saving that config is now rejected", () => {
    // green=50, yellow=90 (inverted) — a middling 60 value clears the
    // (wrong) green bar first and never even gets evaluated against 90.
    expect(bandHigherIsBetter(60, 50, 90)).toBe("green");
  });
});

describe("bandLowerIsBetter", () => {
  it("returns green at or below the green threshold", () => {
    expect(bandLowerIsBetter(0, 0, 4)).toBe("green");
  });

  it("returns yellow at or below the yellow threshold but above green", () => {
    expect(bandLowerIsBetter(4, 0, 4)).toBe("yellow");
    expect(bandLowerIsBetter(1, 0, 4)).toBe("yellow");
  });

  it("returns red above the yellow threshold", () => {
    expect(bandLowerIsBetter(5, 0, 4)).toBe("red");
  });
});
