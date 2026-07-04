-- Contract step of the product-variants expand-contract: variant tables now own
-- images and inventory, so drop the legacy Product scalar columns and the
-- ProductImage table. Re-runnable per repo convention.
DROP TABLE IF EXISTS "ProductImage";

ALTER TABLE "Product" DROP COLUMN IF EXISTS "image";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "stock";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "sizes";
