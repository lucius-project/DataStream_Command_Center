-- CreateTable
CREATE TABLE "TechScoreDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "person" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "score" INTEGER,
    "serviceDeliveryScore" INTEGER,
    "qualityScore" INTEGER,
    "productivityScore" INTEGER,
    "workManagementScore" INTEGER,
    "phoneScore" INTEGER,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TechScoreDaily_person_idx" ON "TechScoreDaily"("person");

-- CreateIndex
CREATE UNIQUE INDEX "TechScoreDaily_person_date_key" ON "TechScoreDaily"("person", "date");
