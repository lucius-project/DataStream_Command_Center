-- CreateTable
CREATE TABLE "NinjaRmmOAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'ninjarmm',
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" DATETIME NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
