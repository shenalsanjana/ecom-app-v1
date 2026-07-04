-- Add product color variants: ProductVariant + VariantImage + VariantSizeStock,
-- plus OrderItem snapshot columns (variantId/color/sku). Additive & re-runnable
-- per this repo's deploy convention. Legacy Product.image/stock/sizes and the
-- ProductImage table are intentionally retained here; a later migration drops them.

CREATE TABLE IF NOT EXISTS "ProductVariant" (
  "id"            TEXT NOT NULL,
  "productId"     TEXT NOT NULL,
  "color"         TEXT NOT NULL,
  "colorSlug"     TEXT NOT NULL,
  "swatchHex"     TEXT,
  "sku"           TEXT,
  "price"         DOUBLE PRECISION,
  "originalPrice" DOUBLE PRECISION,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "archived"      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
-- Postgres treats NULLs as distinct, so multiple variants may have NULL sku.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_productId_colorSlug_key" ON "ProductVariant"("productId", "colorSlug");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");

CREATE TABLE IF NOT EXISTS "VariantImage" (
  "id"        TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "role"      VARCHAR(8) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VariantImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VariantImage_variantId_role_sortOrder_idx" ON "VariantImage"("variantId", "role", "sortOrder");

CREATE TABLE IF NOT EXISTS "VariantSizeStock" (
  "id"        TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "size"      TEXT NOT NULL,
  "stock"     INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VariantSizeStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VariantSizeStock_variantId_size_key" ON "VariantSizeStock"("variantId", "size");
CREATE INDEX IF NOT EXISTS "VariantSizeStock_variantId_idx" ON "VariantSizeStock"("variantId");

-- OrderItem snapshot columns
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "color"     TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sku"       TEXT;
CREATE INDEX IF NOT EXISTS "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- Foreign keys (idempotent via DO block; ADD CONSTRAINT has no IF NOT EXISTS)
DO $$ BEGIN
  ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VariantImage" ADD CONSTRAINT "VariantImage_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VariantSizeStock" ADD CONSTRAINT "VariantSizeStock_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
