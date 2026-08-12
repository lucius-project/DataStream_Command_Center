// Shared logged-vs-expected-hours severity scale — used by Team Time Gaps
// and Tech Performance so a "0.8" shortfall means the same thing everywhere.

export type HoursSeverity = "ok" | "warn" | "critical";

export function hoursSeverity(pct: number): HoursSeverity {
  if (pct >= 0.95) return "ok";
  if (pct >= 0.8) return "warn";
  return "critical";
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
