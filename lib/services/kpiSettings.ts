// Centralized KPI/Admin settings — Phase 12 of the /tech-performance
// rebuild. See KpiSettings/TechRoleConfig's schema comments for the full
// "why" — in short, this replaces ~10 module-level constants that used
// to be scattered (and in a few cases duplicated) across
// serviceDeskHealth.ts, techPerformanceScore.ts, callActivity.ts,
// remoteSessions.ts, operations.ts, and halopsa.ts.
//
// Deliberately NOT throttle-cached (unlike getContactDirectory, which
// fronts a real external API call) — these are local SQLite primary-key
// reads, cheap enough to call per-request, and an admin's save should
// take effect on the very next page load rather than sitting behind a
// stale-cache window.

import { prisma } from "@/lib/prisma";
// Type-only — halopsa.ts itself calls getTechRoleConfigs (for per-tech
// expected hours), so a value import of KNOWN_TECHS here would create a
// real circular dependency; a type-only import is erased at compile time
// and never does. Callers pass their own KNOWN_TECHS value in instead
// (halopsa.ts already has it locally, no import needed there at all).
import type { Tech } from "@/lib/integrations/halopsa";
import type { KpiSettings, TechRole } from "@/app/generated/prisma/client";

export type { KpiSettings, TechRole };

const SETTINGS_ID = "kpi-settings";

// Get-or-create: the very first call ever made creates the row with
// every Prisma @default applied, so behavior is bit-for-bit identical to
// the old hardcoded constants until an admin explicitly changes
// something via /admin.
export async function getKpiSettings(): Promise<KpiSettings> {
  return prisma.kpiSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

export type KpiSettingsUpdate = Partial<Omit<KpiSettings, "id" | "updatedAt">>;

// Weight groups that must each sum to 100 — an unvalidated save leaving
// a group at, say, 90 would silently under/over-weight every score with
// no error surfaced anywhere, so this is enforced here rather than left
// to the caller's discretion.
const HEALTH_WEIGHT_KEYS = [
  "healthWeightResponsiveness",
  "healthWeightResolution",
  "healthWeightWorkload",
  "healthWeightPhone",
] as const;
const TECH_WEIGHT_KEYS = [
  "techWeightServiceDelivery",
  "techWeightQuality",
  "techWeightProductivity",
  "techWeightWorkManagement",
  "techWeightPhone",
] as const;

function validateWeightSum(
  update: KpiSettingsUpdate,
  current: KpiSettings,
  keys: readonly (keyof KpiSettingsUpdate)[],
  label: string,
): void {
  // Only validate if this update actually touches one of the group's
  // keys — an update to an unrelated field (e.g. staleBusinessHours)
  // shouldn't be rejected over a weight group it never asked to change.
  if (!keys.some((k) => k in update)) return;
  const sum = keys.reduce((total, k) => total + (Number(update[k] ?? current[k]) || 0), 0);
  if (sum !== 100) {
    throw new Error(`${label} weights must sum to 100 (got ${sum}).`);
  }
}

// Higher-is-better pairs need green >= yellow; the one lower-is-better
// pair (aging — fewer is better) needs green <= yellow. An inverted
// pair silently corrupts bandHigherIsBetter/bandLowerIsBetter
// (lib/kpiStatus.ts) everywhere it's used, with no error anywhere —
// e.g. a ticket at 60% response SLA reading as green because the
// intended-green threshold ended up the lower-priority check.
const HIGHER_IS_BETTER_PAIRS: [green: keyof KpiSettingsUpdate, yellow: keyof KpiSettingsUpdate, label: string][] = [
  ["responseSlaGreenPct", "responseSlaYellowPct", "Response SLA"],
  ["resolutionSlaGreenPct", "resolutionSlaYellowPct", "Resolution SLA"],
  ["answerRateGreenPct", "answerRateYellowPct", "Answer Rate"],
];
const LOWER_IS_BETTER_PAIRS: [green: keyof KpiSettingsUpdate, yellow: keyof KpiSettingsUpdate, label: string][] = [
  ["agingGreenCount", "agingYellowCount", "Aging"],
];

function validateThresholdOrder(update: KpiSettingsUpdate, current: KpiSettings): void {
  for (const [greenKey, yellowKey, label] of HIGHER_IS_BETTER_PAIRS) {
    if (!(greenKey in update) && !(yellowKey in update)) continue;
    const green = Number(update[greenKey] ?? current[greenKey]);
    const yellow = Number(update[yellowKey] ?? current[yellowKey]);
    if (green < yellow) {
      throw new Error(`${label}: the green threshold (${green}) must be at or above the yellow threshold (${yellow}).`);
    }
  }
  for (const [greenKey, yellowKey, label] of LOWER_IS_BETTER_PAIRS) {
    if (!(greenKey in update) && !(yellowKey in update)) continue;
    const green = Number(update[greenKey] ?? current[greenKey]);
    const yellow = Number(update[yellowKey] ?? current[yellowKey]);
    if (green > yellow) {
      throw new Error(`${label}: the green threshold (${green}) must be at or below the yellow threshold (${yellow}).`);
    }
  }
}

// Every field on KpiSettings is a non-negative count/percentage/weight —
// the client form's HTML min={0} isn't actually enforced (ThresholdsForm
// posts unconditionally, never calls reportValidity()), so this is the
// real boundary, same as the weight-sum/threshold-order checks above.
function validateNonNegative(update: KpiSettingsUpdate): void {
  for (const [key, value] of Object.entries(update)) {
    if (typeof value === "number" && value < 0) {
      throw new Error(`${key} can't be negative (got ${value}).`);
    }
  }
}

export async function updateKpiSettings(update: KpiSettingsUpdate): Promise<KpiSettings> {
  const current = await getKpiSettings();
  validateWeightSum(update, current, HEALTH_WEIGHT_KEYS, "Service Desk Health");
  validateWeightSum(update, current, TECH_WEIGHT_KEYS, "Technician Performance");
  validateThresholdOrder(update, current);
  validateNonNegative(update);
  return prisma.kpiSettings.update({ where: { id: SETTINGS_ID }, data: update });
}

export type TechRoleConfigValue = { role: TechRole; expectedWeeklyHours: number; expectedChargeableHours: number };

// Ensures a row exists per known tech (same "small per-person table,
// upsert on demand" pattern as DailyHours/TechScoreDaily) and returns
// them keyed by Tech for easy per-tech lookup by callers. Takes
// KNOWN_TECHS as a parameter rather than importing it directly — see
// this file's header comment on why (avoids a circular import with
// halopsa.ts, which is itself a caller).
export async function getTechRoleConfigs(knownTechs: readonly Tech[]): Promise<Map<Tech, TechRoleConfigValue>> {
  const rows = await Promise.all(
    knownTechs.map((person) =>
      prisma.techRoleConfig.upsert({
        where: { person },
        update: {},
        create: { person },
      }),
    ),
  );
  return new Map(
    rows.map((r) => [
      r.person as Tech,
      { role: r.role, expectedWeeklyHours: r.expectedWeeklyHours, expectedChargeableHours: r.expectedChargeableHours },
    ]),
  );
}

export async function upsertTechRoleConfigs(
  entries: { person: string; role: TechRole; expectedWeeklyHours: number; expectedChargeableHours: number }[],
): Promise<void> {
  await Promise.all(
    entries.map((e) =>
      prisma.techRoleConfig.upsert({
        where: { person: e.person },
        update: { role: e.role, expectedWeeklyHours: e.expectedWeeklyHours, expectedChargeableHours: e.expectedChargeableHours },
        create: e,
      }),
    ),
  );
}
