-- Closes migration-history drift: Product.archived was added to schema.prisma
-- in commit 34c76728c6 (2026-06-02) but no migration ever created the column
-- on the Product table itself (only ProductVariant.archived was ever
-- migrated, in 20260704120000_add_product_variants). `prisma migrate deploy`
-- reports "up to date" regardless, since it only checks that migration
-- files have been applied, not that they match schema.prisma. Additive &
-- re-runnable per this repo's deploy convention.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Product_archived_idx" ON "Product"("archived");
