-- CreateTable
CREATE TABLE "UnitedCloudCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'unitedcloud',
    "apiBaseUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CallRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitedCloudCallId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromLabel" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "answeredAt" DATETIME,
    "durationSeconds" INTEGER NOT NULL,
    "missed" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CallRecord_unitedCloudCallId_key" ON "CallRecord"("unitedCloudCallId");

-- CreateIndex
CREATE INDEX "CallRecord_startAt_idx" ON "CallRecord"("startAt");
