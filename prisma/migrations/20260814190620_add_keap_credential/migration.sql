-- CreateTable
CREATE TABLE "KeapCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'keap',
    "clientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KeapOAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'keap',
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" DATETIME NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
