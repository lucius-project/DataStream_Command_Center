-- CreateTable
CREATE TABLE "CrmAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'SUSPECT',
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "keapCompanyId" INTEGER,
    "stageChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmAccount_keapCompanyId_key" ON "CrmAccount"("keapCompanyId");

-- CreateIndex
CREATE INDEX "CrmAccount_stage_idx" ON "CrmAccount"("stage");
