-- Closes migration-history drift: Order.status, Order.paymentStatus, and the
-- composite (status, courierBookedAt) index were added to schema.prisma in
-- commit ee0282f3 (2026-06-02) but no migration ever created them on the
-- Order table. `prisma migrate deploy` reports "up to date" regardless,
-- since it only checks that migration files have been applied, not that
-- they match schema.prisma. Additive & re-runnable per this repo's deploy
-- convention.
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "Order_status_courierBookedAt_idx" ON "Order"("status", "courierBookedAt");
