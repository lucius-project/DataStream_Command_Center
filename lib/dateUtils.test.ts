import { describe, it, expect } from "vitest";
import { isBusinessHours, businessHoursElapsed, weekdayIndexOf, formatDuration } from "./dateUtils";

// Reference dates constructed via the local Date(year, monthIndex, day, ...)
// constructor, never an ISO string — that keeps getDay()/getHours() (and
// this test's expectations) self-consistent regardless of which timezone
// the test runner happens to execute in. Verified: 2026-08-17 is a
// Monday, 2026-08-15 a Saturday, 2026-08-16 a Sunday.
const MON = (h: number, m = 0) => new Date(2026, 7, 17, h, m);
const SAT = (h: number, m = 0) => new Date(2026, 7, 15, h, m);
const SUN = (h: number, m = 0) => new Date(2026, 7, 16, h, m);

describe("isBusinessHours", () => {
  it("is true Mon-Fri between 8:30am and 5:00pm", () => {
    expect(isBusinessHours(MON(8, 30))).toBe(true);
    expect(isBusinessHours(MON(12, 0))).toBe(true);
    expect(isBusinessHours(MON(16, 59))).toBe(true);
  });

  it("is false right at and after 5:00pm", () => {
    expect(isBusinessHours(MON(17, 0))).toBe(false);
    expect(isBusinessHours(MON(20, 0))).toBe(false);
  });

  it("is false before 8:30am", () => {
    expect(isBusinessHours(MON(8, 29))).toBe(false);
    expect(isBusinessHours(MON(0, 0))).toBe(false);
  });

  it("is false on weekends regardless of time", () => {
    expect(isBusinessHours(SAT(12, 0))).toBe(false);
    expect(isBusinessHours(SUN(12, 0))).toBe(false);
  });
});

describe("weekdayIndexOf", () => {
  it("maps Mon-Fri to 0-4", () => {
    expect(weekdayIndexOf(MON(10))).toBe(0);
    expect(weekdayIndexOf(new Date(2026, 7, 21, 10))).toBe(4); // Friday
  });

  it("clamps weekends to 4 (Friday)", () => {
    expect(weekdayIndexOf(SAT(10))).toBe(4);
    expect(weekdayIndexOf(SUN(10))).toBe(4);
  });
});

describe("businessHoursElapsed", () => {
  it("returns 0 when end is not after start", () => {
    expect(businessHoursElapsed(MON(10), MON(10))).toBe(0);
    expect(businessHoursElapsed(MON(10), MON(9))).toBe(0);
  });

  it("counts a same-day window inside business hours directly", () => {
    expect(businessHoursElapsed(MON(9), MON(11))).toBe(2);
  });

  it("skips the weekend — a Friday-4pm-to-Monday-9am span is ~1 business hour, not ~65 wall-clock hours", () => {
    const fri4pm = new Date(2026, 7, 14, 16, 0); // Friday
    const mon9am = MON(9, 0);
    // Friday: 4:00pm-5:00pm = 1h. Sat/Sun: 0h. Monday: 8:30am-9:00am = 0.5h.
    expect(businessHoursElapsed(fri4pm, mon9am)).toBeCloseTo(1.5, 5);
  });

  it("clamps a window that starts before business hours and ends after them to the business window only", () => {
    // 7am to 6pm on a Monday should count as 8:30am-5pm = 8.5 business hours.
    expect(businessHoursElapsed(MON(7, 0), MON(18, 0))).toBeCloseTo(8.5, 5);
  });
});

describe("formatDuration", () => {
  it("shows only minutes under an hour", () => {
    expect(formatDuration(45)).toBe("45m");
  });

  it("shows hours and minutes under a day", () => {
    expect(formatDuration(125)).toBe("2h 5m");
  });

  it("always includes hours once days are present, even at 0h", () => {
    expect(formatDuration(1440 + 5)).toBe("1d 0h 5m");
  });

  it("includes days, hours, and minutes for a multi-day span", () => {
    expect(formatDuration(1500)).toBe("1d 1h 0m");
  });
});
