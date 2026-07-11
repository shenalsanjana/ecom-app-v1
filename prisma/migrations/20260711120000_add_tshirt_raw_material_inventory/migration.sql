-- Add T-shirt raw-material inventory: PlainTshirtStock + DtfDesign pools, plus
-- Product.dtfDesignId and OrderItem raw-material snapshot columns. Additive &
-- re-runnable per this repo's deploy convention. VariantSizeStock.stock is
-- retained here — a later migration (B) drops it once the new code is live.

CREATE TABLE IF NOT EXISTS "PlainTshirtStock" (
  "id"        TEXT NOT NULL,
  "color"     TEXT NOT NULL,
  "colorSlug" TEXT NOT NULL,
  "size"      TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlainTshirtStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlainTshirtStock_colorSlug_size_key" ON "PlainTshirtStock"("colorSlug", "size");

CREATE TABLE IF NOT EXISTS "DtfDesign" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DtfDesign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DtfDesign_slug_key" ON "DtfDesign"("slug");

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "dtfDesignId" TEXT;
CREATE INDEX IF NOT EXISTS "Product_dtfDesignId_idx" ON "Product"("dtfDesignId");

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "plainTshirtStockId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "dtfDesignId" TEXT;
CREATE INDEX IF NOT EXISTS "OrderItem_plainTshirtStockId_idx" ON "OrderItem"("plainTshirtStockId");
CREATE INDEX IF NOT EXISTS "OrderItem_dtfDesignId_idx" ON "OrderItem"("dtfDesignId");

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_dtfDesignId_fkey"
    FOREIGN KEY ("dtfDesignId") REFERENCES "DtfDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_plainTshirtStockId_fkey"
    FOREIGN KEY ("plainTshirtStockId") REFERENCES "PlainTshirtStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dtfDesignId_fkey"
    FOREIGN KEY ("dtfDesignId") REFERENCES "DtfDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
