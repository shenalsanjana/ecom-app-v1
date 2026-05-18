-- AlterTable
ALTER TABLE "Address" DROP COLUMN "postalCode",
DROP COLUMN "region";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "shippingPostalCode",
DROP COLUMN "shippingRegion";
