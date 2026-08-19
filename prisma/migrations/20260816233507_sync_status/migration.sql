-- CreateTable
CREATE TABLE "SyncStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastSyncedAt" DATETIME,
    "lastAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT
);
