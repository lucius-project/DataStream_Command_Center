-- CreateTable
CREATE TABLE "NinjaActivitySyncState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'ninja-activities',
    "newestActivityId" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
