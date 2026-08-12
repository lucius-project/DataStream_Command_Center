-- AlterTable
ALTER TABLE "TicketSnapshot" ADD COLUMN "fixByAt" DATETIME;
ALTER TABLE "TicketSnapshot" ADD COLUMN "lastActionAt" DATETIME;
ALTER TABLE "TicketSnapshot" ADD COLUMN "respondByAt" DATETIME;
ALTER TABLE "TicketSnapshot" ADD COLUMN "respondedAt" DATETIME;

-- CreateTable
CREATE TABLE "TicketCloseLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "haloTicketId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "assignedTech" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL,
    "respondByAt" DATETIME,
    "fixByAt" DATETIME,
    "respondedAt" DATETIME,
    "closedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketCloseLog_haloTicketId_key" ON "TicketCloseLog"("haloTicketId");

-- CreateIndex
CREATE INDEX "TicketCloseLog_closedAt_idx" ON "TicketCloseLog"("closedAt");
