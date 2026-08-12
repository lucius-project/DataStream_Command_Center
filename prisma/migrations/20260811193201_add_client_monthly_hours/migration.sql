-- CreateTable
CREATE TABLE "ClientMonthlyHours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "hours" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientMonthlyHours_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ClientMonthlyHours_clientId_idx" ON "ClientMonthlyHours"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientMonthlyHours_clientId_yearMonth_key" ON "ClientMonthlyHours"("clientId", "yearMonth");
