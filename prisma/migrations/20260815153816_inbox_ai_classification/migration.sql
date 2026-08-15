-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InboxItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "graphMessageId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "bodyPreviewUrl" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "delegateNote" TEXT,
    "delegatedToId" TEXT,
    "waitingSince" DATETIME,
    "snoozedUntil" DATETIME,
    "isNoise" BOOLEAN NOT NULL DEFAULT false,
    "clearedAt" DATETIME,
    "category" TEXT,
    "urgency" TEXT,
    "brief" TEXT,
    "actionTitle" TEXT,
    "dueDate" DATETIME,
    "dollarAmount" REAL,
    "classifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InboxItem_delegatedToId_fkey" FOREIGN KEY ("delegatedToId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InboxItem" ("bodyPreviewUrl", "clearedAt", "createdAt", "delegateNote", "graphMessageId", "id", "isNoise", "preview", "receivedAt", "sender", "senderEmail", "snoozedUntil", "status", "subject", "updatedAt") SELECT "bodyPreviewUrl", "clearedAt", "createdAt", "delegateNote", "graphMessageId", "id", "isNoise", "preview", "receivedAt", "sender", "senderEmail", "snoozedUntil", "status", "subject", "updatedAt" FROM "InboxItem";
DROP TABLE "InboxItem";
ALTER TABLE "new_InboxItem" RENAME TO "InboxItem";
CREATE UNIQUE INDEX "InboxItem_graphMessageId_key" ON "InboxItem"("graphMessageId");
CREATE INDEX "InboxItem_status_idx" ON "InboxItem"("status");
CREATE INDEX "InboxItem_receivedAt_idx" ON "InboxItem"("receivedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
