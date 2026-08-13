// Shared, dependency-free statistics helpers — deliberately importing
// nothing from the rest of lib/services so any service file can use these
// without risking a circular import (this is exactly why callActivity.ts
// used to keep its own local copy: it can't import from
// serviceDeskHealth.ts, which itself imports from callActivity.ts).

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
