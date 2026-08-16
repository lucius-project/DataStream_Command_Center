-- CreateTable
CREATE TABLE "ClientLaborMonthly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "laborLineValue" REAL NOT NULL,
    "avgHoursLastQuarter" REAL,
    "effectiveHourlyRate" REAL,
    "hoursThisMonth" REAL NOT NULL,
    "hourlyRateUsed" REAL NOT NULL,
    "laborCost" REAL NOT NULL,
    "laborProfit" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientLaborMonthly_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ClientLaborMonthly_clientId_idx" ON "ClientLaborMonthly"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientLaborMonthly_clientId_yearMonth_key" ON "ClientLaborMonthly"("clientId", "yearMonth");
