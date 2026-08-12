-- CreateTable
CREATE TABLE "InboxItem" (
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
    "snoozedUntil" DATETIME,
    "isNoise" BOOLEAN NOT NULL DEFAULT false,
    "clearedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InboxRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TicketSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "haloTicketId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "assignedTech" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL,
    "slaDueAt" DATETIME,
    "lastUpdatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AttentionFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "ticketId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "AttentionFlag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "TicketSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeGap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "person" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "expectedHours" REAL NOT NULL,
    "loggedHours" REAL NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DelegationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxItem_graphMessageId_key" ON "InboxItem"("graphMessageId");

-- CreateIndex
CREATE INDEX "InboxItem_status_idx" ON "InboxItem"("status");

-- CreateIndex
CREATE INDEX "InboxItem_receivedAt_idx" ON "InboxItem"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_provider_key" ON "OAuthToken"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSnapshot_haloTicketId_key" ON "TicketSnapshot"("haloTicketId");

-- CreateIndex
CREATE INDEX "TicketSnapshot_status_idx" ON "TicketSnapshot"("status");

-- CreateIndex
CREATE INDEX "TicketSnapshot_assignedTech_idx" ON "TicketSnapshot"("assignedTech");

-- CreateIndex
CREATE INDEX "AttentionFlag_status_idx" ON "AttentionFlag"("status");

-- CreateIndex
CREATE INDEX "TimeGap_person_idx" ON "TimeGap"("person");

-- CreateIndex
CREATE INDEX "DelegationLog_source_sourceId_idx" ON "DelegationLog"("source", "sourceId");
