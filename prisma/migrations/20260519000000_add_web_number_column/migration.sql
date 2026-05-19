-- AlterTable
ALTER TABLE "Order" ADD COLUMN "webNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_webNumber_key" ON "Order"("webNumber");

-- CreateSequence
CREATE SEQUENCE "web_number_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 NO CYCLE;
