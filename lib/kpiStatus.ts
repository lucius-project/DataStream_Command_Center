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
