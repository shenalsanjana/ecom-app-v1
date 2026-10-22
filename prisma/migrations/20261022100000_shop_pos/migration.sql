ALTER TABLE "Order"
  ADD COLUMN "salesChannel" VARCHAR(8) NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN "posNumber" TEXT,
  ADD COLUMN "cashierId" TEXT,
  ADD COLUMN "posTendered" DOUBLE PRECISION,
  ADD COLUMN "posPaymentReference" TEXT,
  ADD COLUMN "posPayloadHash" VARCHAR(64);

CREATE UNIQUE INDEX "Order_posNumber_key" ON "Order"("posNumber");
CREATE INDEX "Order_salesChannel_createdAt_idx" ON "Order"("salesChannel", "createdAt");
CREATE SEQUENCE "pos_number_seq" START 1;
