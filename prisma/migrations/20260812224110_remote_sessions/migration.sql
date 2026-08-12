-- CreateTable
CREATE TABLE "RemoteSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesUid" TEXT NOT NULL,
    "ninjaDeviceId" TEXT,
    "ninjaUserId" TEXT,
    "requestedAt" DATETIME,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "durationSeconds" INTEGER,
    "status" TEXT NOT NULL,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "RemoteSession_seriesUid_key" ON "RemoteSession"("seriesUid");

-- CreateIndex
CREATE INDEX "RemoteSession_startedAt_idx" ON "RemoteSession"("startedAt");

-- CreateIndex
CREATE INDEX "RemoteSession_ninjaDeviceId_idx" ON "RemoteSession"("ninjaDeviceId");
