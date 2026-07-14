-- Add OrderAdjustment: admin-entered custom charges/discounts on an order.
-- amount is signed (positive = charge, negative = discount); Order.total is
-- computed as subtotal + shippingCost + sum(adjustments.amount), clamped >= 0.

CREATE TABLE IF NOT EXISTS "OrderAdjustment" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "amount"    DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrderAdjustment_orderId_idx" ON "OrderAdjustment"("orderId");

DO $$ BEGIN
  ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
