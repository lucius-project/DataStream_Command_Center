-- CreateTable
CREATE TABLE "ServiceDeskHealthDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "healthScore" INTEGER,
    "responsivenessScore" INTEGER,
    "resolutionScore" INTEGER,
    "workloadScore" INTEGER,
    "phoneScore" INTEGER,
    "responseSlaPct" REAL,
    "resolutionSlaPct" REAL,
    "ticketsCreated" INTEGER NOT NULL,
    "ticketsClosed" INTEGER NOT NULL,
    "netChange" INTEGER NOT NULL,
    "backlogTotal" INTEGER NOT NULL,
    "agingOver24h" INTEGER NOT NULL,
    "phoneAnswerRatePct" REAL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDeskHealthDaily_date_key" ON "ServiceDeskHealthDaily"("date");
