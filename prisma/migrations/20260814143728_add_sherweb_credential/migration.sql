-- CreateTable
CREATE TABLE "SherwebCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'sherweb',
    "clientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT NOT NULL,
    "encryptedSubscriptionKey" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
