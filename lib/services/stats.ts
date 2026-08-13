// Shared, dependency-free statistics helpers — deliberately importing
// nothing from the rest of lib/services (only a type-only import, erased
// at compile time and so never a real runtime cycle) so any service file
// can use these without risking a circular import (this is exactly why
// callActivity.ts used to keep its own local median/percentile90 copy:
// it can't import from serviceDeskHealth.ts, which itself imports from
// callActivity.ts).

import type { KpiTrend } from "./businessHealth";

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Nearest-rank method — a judgment call among several valid P90
// definitions, same honesty pattern as every other threshold in this
// app; not claimed as a statistically "correct" P90, just a consistent
// one applied everywhere a P90 is shown.
export function percentile90(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1);
  return sorted[idx];
}

// delta is `current - previous` in the metric's own unit (points,
// seconds, etc.) — a magnitude under `flatBelow` reads as "flat" rather
// than forcing an arrow onto noise. `previous === null` (no honest prior
// figure) omits the trend entirely rather than a fabricated "flat".
// Moved here from techPerformance.ts (still re-exported there for
// backward compat) so callActivity.ts can use it too without the
// circular-import problem described above — techPerformance.ts already
// imports from callActivity.ts (excludeFalseMisses).
export function buildTrend(
  current: number,
  previous: number | null,
  goodDirection: "up" | "down",
  formatDelta: (delta: number) => string,
  flatBelow = 0.5,
): KpiTrend | undefined {
  if (previous === null) return undefined;
  const delta = current - previous;
  const direction: KpiTrend["direction"] = Math.abs(delta) < flatBelow ? "flat" : delta > 0 ? "up" : "down";
  return { direction, changeLabel: formatDelta(delta), goodDirection };
}
