BEGIN;

ALTER TABLE "PlainTshirtStock" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DtfDesign" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "paymentStartedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "paymentReviewRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "paymentReviewReason" TEXT;

-- Existing orders may already have a gateway session. Never expire them as
-- uninitiated simply because they predate this field.
UPDATE "Order" SET "paymentStartedAt" = "createdAt"
WHERE "paymentMethod" IN ('PAYHERE', 'KOKO', 'MINTPAY');

CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");
CREATE TABLE "PaymentEvent" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "providerReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentEvent_eventKey_key" ON "PaymentEvent"("eventKey");
CREATE INDEX "PaymentEvent_orderId_createdAt_idx" ON "PaymentEvent"("orderId", "createdAt");

-- Enforce all future writes without silently changing historical quantities.
ALTER TABLE "PlainTshirtStock" ADD CONSTRAINT "PlainTshirtStock_quantity_nonnegative" CHECK ("quantity" >= 0) NOT VALID;
ALTER TABLE "DtfDesign" ADD CONSTRAINT "DtfDesign_quantity_nonnegative" CHECK ("quantity" >= 0) NOT VALID;

-- A stock deletion racing the last sale must not null the sale's restoration
-- reference. Keep nullable legacy references, but protect every linked row.
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_plainTshirtStockId_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_plainTshirtStockId_fkey"
  FOREIGN KEY ("plainTshirtStockId") REFERENCES "PlainTshirtStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_dtfDesignId_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dtfDesignId_fkey"
  FOREIGN KEY ("dtfDesignId") REFERENCES "DtfDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
