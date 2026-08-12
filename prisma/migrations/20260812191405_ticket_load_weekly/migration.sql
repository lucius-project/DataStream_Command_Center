-- CreateTable
CREATE TABLE "TicketLoadWeekly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "person" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "openCount" INTEGER NOT NULL,
    "p1Count" INTEGER NOT NULL,
    "agingCount" INTEGER NOT NULL,
    "onHoldCount" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TicketLoadWeekly_person_idx" ON "TicketLoadWeekly"("person");

-- CreateIndex
CREATE UNIQUE INDEX "TicketLoadWeekly_person_periodStart_key" ON "TicketLoadWeekly"("person", "periodStart");
