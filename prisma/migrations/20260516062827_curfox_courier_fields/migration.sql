-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adminAlertSentAt" TIMESTAMP(3),
ADD COLUMN     "courierBookedAt" TIMESTAMP(3),
ADD COLUMN     "courierLastError" TEXT,
ADD COLUMN     "courierLastErrorAt" TIMESTAMP(3),
ADD COLUMN     "courierWaybillNumber" TEXT,
ADD COLUMN     "dispatchEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "dispatchPdfFetchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CurfoxCity" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "defaultWarehouseId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurfoxCity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurfoxCity_name_idx" ON "CurfoxCity"("name");
