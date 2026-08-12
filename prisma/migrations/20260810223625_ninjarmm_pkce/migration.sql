-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NinjaRmmCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'ninjarmm',
    "apiBaseUrl" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NinjaRmmCredential" ("apiBaseUrl", "clientId", "encryptedClientSecret", "id", "updatedAt") SELECT "apiBaseUrl", "clientId", "encryptedClientSecret", "id", "updatedAt" FROM "NinjaRmmCredential";
DROP TABLE "NinjaRmmCredential";
ALTER TABLE "new_NinjaRmmCredential" RENAME TO "NinjaRmmCredential";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
