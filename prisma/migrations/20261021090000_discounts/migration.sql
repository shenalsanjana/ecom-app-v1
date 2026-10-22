BEGIN;
-- Fail promptly if an operator applies this while a table is busy.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- AlterTable
ALTER TABLE "OrderAdjustment" ADD COLUMN     "promotion" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" VARCHAR(16) NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "value" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "minimumOrder" INTEGER NOT NULL DEFAULT 0,
    "maximumDiscount" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountProduct" (
    "discountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "DiscountProduct_pkey" PRIMARY KEY ("discountId","productId")
);

-- CreateTable
CREATE TABLE "DiscountCategory" (
    "discountId" TEXT NOT NULL,
    "designSlug" TEXT NOT NULL,

    CONSTRAINT "DiscountCategory_pkey" PRIMARY KEY ("discountId","designSlug")
);

-- CreateTable
CREATE TABLE "DiscountRedemption" (
    "id" TEXT NOT NULL,
    "discountId" TEXT,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Discount_code_key" ON "Discount"("code");

-- CreateIndex
CREATE INDEX "Discount_active_code_idx" ON "Discount"("active", "code");

-- CreateIndex
CREATE INDEX "DiscountProduct_productId_idx" ON "DiscountProduct"("productId");

-- CreateIndex
CREATE INDEX "DiscountCategory_designSlug_idx" ON "DiscountCategory"("designSlug");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_orderId_key" ON "DiscountRedemption"("orderId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_discountId_createdAt_idx" ON "DiscountRedemption"("discountId", "createdAt");

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountProduct" ADD CONSTRAINT "DiscountProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCategory" ADD CONSTRAINT "DiscountCategory_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCategory" ADD CONSTRAINT "DiscountCategory_designSlug_fkey" FOREIGN KEY ("designSlug") REFERENCES "Design"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth for writes outside the admin application.
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_valid_values" CHECK (
  "type" IN ('PERCENTAGE', 'FIXED') AND "scope" IN ('STORE', 'PRODUCTS', 'CATEGORIES')
  AND "value" > 0 AND ("type" <> 'PERCENTAGE' OR "value" <= 10000)
  AND "minimumOrder" >= 0 AND ("maximumDiscount" IS NULL OR "maximumDiscount" > 0)
  AND "usedCount" >= 0 AND ("usageLimit" IS NULL OR ("usageLimit" > 0 AND "usedCount" <= "usageLimit"))
  AND ("startsAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt" > "startsAt")
  AND ("code" IS NULL OR ("code" ~ '^[A-Z0-9_-]{1,40}$'))
);
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_positive_amount" CHECK ("amount" > 0);

COMMIT;
