-- CreateTable
CREATE TABLE "VendorSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "renewalDate" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "VendorSubscription_renewalDate_idx" ON "VendorSubscription"("renewalDate");
