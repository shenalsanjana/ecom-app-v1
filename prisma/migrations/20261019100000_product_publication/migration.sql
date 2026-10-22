-- Preserve all existing publication and archive behaviour during backfill.
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED');
ALTER TABLE "Product" ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'PUBLISHED';
-- New records, including those created outside the editor, start private.
ALTER TABLE "Product" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
CREATE INDEX "Product_status_archived_idx" ON "Product"("status", "archived");
