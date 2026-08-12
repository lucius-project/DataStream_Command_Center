-- CreateTable
CREATE TABLE "DailyHours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "person" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "hours" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "DailyHours_person_idx" ON "DailyHours"("person");

-- CreateIndex
CREATE UNIQUE INDEX "DailyHours_person_date_key" ON "DailyHours"("person", "date");
