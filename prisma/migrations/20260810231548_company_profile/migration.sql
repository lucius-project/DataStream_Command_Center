-- AlterTable
ALTER TABLE "Client" ADD COLUMN "ninjaOrganizationId" TEXT;
ALTER TABLE "Client" ADD COLUMN "quickbooksCustomerId" TEXT;

-- CreateTable
CREATE TABLE "QuickBooksCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'quickbooks',
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "clientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QuickBooksOAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'quickbooks',
    "realmId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" DATETIME NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ClientFinancials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "revenueThisMonth" REAL NOT NULL DEFAULT 0,
    "laborCost" REAL NOT NULL DEFAULT 0,
    "itemCost" REAL NOT NULL DEFAULT 0,
    "itemRevenue" REAL NOT NULL DEFAULT 0,
    "netProfit" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientFinancials_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeatReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "installedCount" INTEGER NOT NULL,
    "billedQuantity" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SeatReconciliation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientFinancials_clientId_key" ON "ClientFinancials"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReconciliation_clientId_tool_key" ON "SeatReconciliation"("clientId", "tool");
