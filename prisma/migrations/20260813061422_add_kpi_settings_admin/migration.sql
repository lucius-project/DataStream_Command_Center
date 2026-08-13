-- CreateTable
CREATE TABLE "KpiSettings" (
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

-- CreateTable
CREATE TABLE "TechRoleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "person" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SERVICE_DESK_TECHNICIAN',
    "expectedWeeklyHours" REAL NOT NULL DEFAULT 40,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TechRoleConfig_person_key" ON "TechRoleConfig"("person");
