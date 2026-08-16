// Shared KPI status scale for Business Health — same role lib/hoursSeverity.ts
// plays for the two hours-specific views, generalized to red/yellow/green
// plus an explicit "unavailable" state for KPIs with no data source
// connected yet (never faked as a fake 0 or green).

export type KpiStatus = "green" | "yellow" | "red" | "unavailable";

export const STATUS_DOT: Record<KpiStatus, string> = {
  green: "bg-status-ok",
  yellow: "bg-status-warn",
  red: "bg-status-critical",
  unavailable: "bg-border-strong",
};

export const STATUS_TEXT: Record<KpiStatus, string> = {
  green: "text-status-ok",
  yellow: "text-status-warn",
  red: "text-status-critical",
  unavailable: "text-text-faint",
};

// Same wording HealthScoreBreakdownModal.tsx's own scoreStatusLabel
// established — a visible word alongside the STATUS_DOT color, not
// color alone, for every consumer of this shared status scale (WCAG
// 1.4.1: color can't be the only signal).
export const STATUS_LABEL: Record<KpiStatus, string> = {
  green: "Healthy",
  yellow: "Watch",
  red: "Needs Attention",
  unavailable: "No data",
};

// Higher-is-better band: green at/above `green`, yellow at/above `yellow`, red below.
export function bandHigherIsBetter(value: number, green: number, yellow: number): KpiStatus {
  if (value >= green) return "green";
  if (value >= yellow) return "yellow";
  return "red";
}

// Lower-is-better band: green at/below `green`, yellow at/below `yellow`, red above.
export function bandLowerIsBetter(value: number, green: number, yellow: number): KpiStatus {
  if (value <= green) return "green";
  if (value <= yellow) return "yellow";
  return "red";
}
