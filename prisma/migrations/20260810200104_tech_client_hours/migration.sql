-- AlterTable
ALTER TABLE "AgreementItem" ADD COLUMN "contractType" TEXT;

-- CreateTable
CREATE TABLE "ClientTechHours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "tech" TEXT NOT NULL,
    "hours" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientTechHours_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ClientTechHours_clientId_idx" ON "ClientTechHours"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTechHours_clientId_tech_key" ON "ClientTechHours"("clientId", "tech");
