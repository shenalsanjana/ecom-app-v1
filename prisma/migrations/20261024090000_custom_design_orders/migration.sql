-- Additive metadata only; never rewrite stock, prices or payments.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE "Product" ADD COLUMN "isCustomizedDesign" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN "isCustomizedDesign" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "designReceivedAt" TIMESTAMP(3);
UPDATE "Product" SET "isCustomizedDesign" = true
 WHERE "id" IN ('custom-design-canvas-tote', 'custom-design-canvas-pouch');
UPDATE "OrderItem" SET "isCustomizedDesign" = true
 WHERE "productId" IN ('custom-design-canvas-tote', 'custom-design-canvas-pouch');
COMMIT;
