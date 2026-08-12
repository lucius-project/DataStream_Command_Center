/*
  Warnings:

  - You are about to drop the column `encryptedRefreshToken` on the `OAuthToken` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `OAuthToken` table. All the data in the column will be lost.
  - Added the required column `encryptedCache` to the `OAuthToken` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "encryptedCache" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OAuthToken" ("accountEmail", "createdAt", "id", "provider", "scope", "updatedAt") SELECT "accountEmail", "createdAt", "id", "provider", "scope", "updatedAt" FROM "OAuthToken";
DROP TABLE "OAuthToken";
ALTER TABLE "new_OAuthToken" RENAME TO "OAuthToken";
CREATE UNIQUE INDEX "OAuthToken_provider_key" ON "OAuthToken"("provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
