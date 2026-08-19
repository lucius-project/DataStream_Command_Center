-- AlterTable
ALTER TABLE "TimeGap" ADD COLUMN "chargeableHours" REAL;
ALTER TABLE "TimeGap" ADD COLUMN "expectedChargeableHours" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TechRoleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "person" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SERVICE_DESK_TECHNICIAN',
    "expectedWeeklyHours" REAL NOT NULL DEFAULT 40,
    "expectedChargeableHours" REAL NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TechRoleConfig" ("expectedWeeklyHours", "id", "person", "role", "updatedAt") SELECT "expectedWeeklyHours", "id", "person", "role", "updatedAt" FROM "TechRoleConfig";
DROP TABLE "TechRoleConfig";
ALTER TABLE "new_TechRoleConfig" RENAME TO "TechRoleConfig";
CREATE UNIQUE INDEX "TechRoleConfig_person_key" ON "TechRoleConfig"("person");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
