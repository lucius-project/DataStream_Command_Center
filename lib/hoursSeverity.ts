// Shared logged-vs-expected-hours severity scale — used by Team Time Gaps
// and Tech Performance so a "0.8" shortfall means the same thing everywhere.

export type HoursSeverity = "ok" | "warn" | "critical";

export function hoursSeverity(pct: number): HoursSeverity {
  if (pct >= 0.95) return "ok";
  if (pct >= 0.8) return "warn";
  return "critical";
}

// Pace version of the same signal — bands a percentage that's already
// normalized against a fair *mid-week* target (see weekFractionElapsed
// in dateUtils.ts), not the full week. hoursSeverity reading "critical"
// every Monday and Tuesday regardless of actual pace is fine for a
// simple progress bar (Team Time Gaps), but it's the wrong input for a
// glanceable status badge meant to separate who's actually behind from
// who just hasn't finished the week yet — on a Tuesday, hoursSeverity
// would mark literally every tech "critical" no matter how well-paced
// they are, since ~2/5 of a week always looks tiny against the full
// target. Same bands as Business Health's Team Utilization KPI, so the
// two pages agree. Wider than hoursSeverity's because a pace percentage
// already accounts for the day of the week — a looser miss still
// represents real drift.
export function paceSeverity(pctOfExpectedToDate: number): HoursSeverity {
  if (pctOfExpectedToDate > 110 || pctOfExpectedToDate < 50) return "critical";
  if (pctOfExpectedToDate >= 90 || pctOfExpectedToDate < 70) return "warn";
  return "ok";
}

export const SEVERITY_FILL: Record<HoursSeverity, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  critical: "bg-status-critical",
};

export const SEVERITY_TEXT: Record<HoursSeverity, string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  critical: "text-status-critical",
};
