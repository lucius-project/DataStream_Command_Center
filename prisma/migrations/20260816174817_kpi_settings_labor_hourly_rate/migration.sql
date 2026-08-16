-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KpiSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'kpi-settings',
    "healthWeightResponsiveness" INTEGER NOT NULL DEFAULT 25,
    "healthWeightResolution" INTEGER NOT NULL DEFAULT 20,
    "healthWeightWorkload" INTEGER NOT NULL DEFAULT 20,
    "healthWeightPhone" INTEGER NOT NULL DEFAULT 15,
    "techWeightServiceDelivery" INTEGER NOT NULL DEFAULT 30,
    "techWeightQuality" INTEGER NOT NULL DEFAULT 25,
    "techWeightProductivity" INTEGER NOT NULL DEFAULT 20,
    "techWeightWorkManagement" INTEGER NOT NULL DEFAULT 15,
    "techWeightPhone" INTEGER NOT NULL DEFAULT 10,
    "minSlaSample" INTEGER NOT NULL DEFAULT 5,
    "resolutionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "minPercentileSample" INTEGER NOT NULL DEFAULT 5,
    "callbackTargetMinutes" INTEGER NOT NULL DEFAULT 15,
    "staleBusinessHours" INTEGER NOT NULL DEFAULT 24,
    "laborHourlyRate" REAL NOT NULL DEFAULT 0,
    "responseSlaGreenPct" INTEGER NOT NULL DEFAULT 90,
    "responseSlaYellowPct" INTEGER NOT NULL DEFAULT 75,
    "resolutionSlaGreenPct" INTEGER NOT NULL DEFAULT 90,
    "resolutionSlaYellowPct" INTEGER NOT NULL DEFAULT 75,
    "agingGreenCount" INTEGER NOT NULL DEFAULT 0,
    "agingYellowCount" INTEGER NOT NULL DEFAULT 4,
    "answerRateGreenPct" INTEGER NOT NULL DEFAULT 90,
    "answerRateYellowPct" INTEGER NOT NULL DEFAULT 80,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_KpiSettings" ("agingGreenCount", "agingYellowCount", "answerRateGreenPct", "answerRateYellowPct", "callbackTargetMinutes", "healthWeightPhone", "healthWeightResolution", "healthWeightResponsiveness", "healthWeightWorkload", "id", "minPercentileSample", "minSlaSample", "resolutionSlaGreenPct", "resolutionSlaYellowPct", "resolutionWindowDays", "responseSlaGreenPct", "responseSlaYellowPct", "staleBusinessHours", "techWeightPhone", "techWeightProductivity", "techWeightQuality", "techWeightServiceDelivery", "techWeightWorkManagement", "updatedAt") SELECT "agingGreenCount", "agingYellowCount", "answerRateGreenPct", "answerRateYellowPct", "callbackTargetMinutes", "healthWeightPhone", "healthWeightResolution", "healthWeightResponsiveness", "healthWeightWorkload", "id", "minPercentileSample", "minSlaSample", "resolutionSlaGreenPct", "resolutionSlaYellowPct", "resolutionWindowDays", "responseSlaGreenPct", "responseSlaYellowPct", "staleBusinessHours", "techWeightPhone", "techWeightProductivity", "techWeightQuality", "techWeightServiceDelivery", "techWeightWorkManagement", "updatedAt" FROM "KpiSettings";
DROP TABLE "KpiSettings";
ALTER TABLE "new_KpiSettings" RENAME TO "KpiSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
