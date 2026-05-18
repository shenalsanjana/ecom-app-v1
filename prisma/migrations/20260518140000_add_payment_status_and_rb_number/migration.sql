-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "rbNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_rbNumber_key" ON "Order"("rbNumber");

-- CreateSequence
CREATE SEQUENCE "rb_number_seq" START WITH 1001 INCREMENT BY 1 MINVALUE 1001 NO CYCLE;
