-- CreateTable
CREATE TABLE "MicrosoftAppCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'microsoft',
    "clientId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
