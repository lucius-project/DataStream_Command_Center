-- CreateTable
CREATE TABLE "SopFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sopEntryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SopFile_sopEntryId_fkey" FOREIGN KEY ("sopEntryId") REFERENCES "SopEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SopFile_sopEntryId_idx" ON "SopFile"("sopEntryId");
