-- CreateTable
CREATE TABLE "HaloPsaCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'halopsa',
    "instanceUrl" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
