-- Allow a Product to be hard-deleted while its order history is preserved.
-- OrderItem keeps its own name/size/price/quantity snapshot; the product link
-- becomes nullable and is set to NULL when the referenced Product is deleted.

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- AlterColumn: productId is now nullable
ALTER TABLE "OrderItem" ALTER COLUMN "productId" DROP NOT NULL;

-- AddForeignKey: ON DELETE SET NULL (was RESTRICT)
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
