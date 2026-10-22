-- Retain orders and gateway evidence so callbacks and payment review remain valid.
ALTER TABLE "Order" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Order_deletedAt_createdAt_idx" ON "Order"("deletedAt", "createdAt");
