-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "haloClientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hoursThisMonth" REAL NOT NULL DEFAULT 0,
    "ninjaOrganizationId" TEXT,
    "quickbooksCustomerId" TEXT,
    "serviceModel" TEXT NOT NULL DEFAULT 'BREAK_FIX',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Client" ("haloClientId", "hoursThisMonth", "id", "name", "ninjaOrganizationId", "quickbooksCustomerId", "updatedAt") SELECT "haloClientId", "hoursThisMonth", "id", "name", "ninjaOrganizationId", "quickbooksCustomerId", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_haloClientId_key" ON "Client"("haloClientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
