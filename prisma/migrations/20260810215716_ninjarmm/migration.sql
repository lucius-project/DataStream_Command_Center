-- CreateTable
CREATE TABLE "NinjaRmmCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'ninjarmm',
    "apiBaseUrl" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NinjaDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ninjaDeviceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "systemName" TEXT,
    "organizationId" TEXT,
    "offline" BOOLEAN NOT NULL,
    "lastContact" DATETIME,
    "osName" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "NinjaDevice_ninjaDeviceId_key" ON "NinjaDevice"("ninjaDeviceId");

-- CreateIndex
CREATE INDEX "NinjaDevice_offline_idx" ON "NinjaDevice"("offline");
