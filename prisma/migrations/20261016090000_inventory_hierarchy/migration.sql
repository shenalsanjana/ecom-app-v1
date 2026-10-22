BEGIN;

CREATE TABLE "InventoryCategory" (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  "parentId" TEXT,
  "systemKey" TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InventoryCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "InventoryCategory"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryCategory_systemKey_key" ON "InventoryCategory"("systemKey");
CREATE UNIQUE INDEX "InventoryCategory_parentId_name_key" ON "InventoryCategory"("parentId",name);
CREATE INDEX "InventoryCategory_parentId_idx" ON "InventoryCategory"("parentId");

CREATE TABLE "InventoryProduct" (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InventoryProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryProduct_categoryId_name_key" ON "InventoryProduct"("categoryId",name);
CREATE INDEX "InventoryProduct_categoryId_idx" ON "InventoryProduct"("categoryId");

ALTER TABLE "Product" ADD COLUMN "inventoryProductId" TEXT;
ALTER TABLE "PlainTshirtStock" ADD COLUMN "inventoryProductId" TEXT;
ALTER TABLE "VariantSizeStock" ADD COLUMN "plainTshirtStockId" TEXT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_inventoryProductId_fkey" FOREIGN KEY ("inventoryProductId") REFERENCES "InventoryProduct"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlainTshirtStock" ADD CONSTRAINT "PlainTshirtStock_inventoryProductId_fkey" FOREIGN KEY ("inventoryProductId") REFERENCES "InventoryProduct"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VariantSizeStock" ADD CONSTRAINT "VariantSizeStock_plainTshirtStockId_fkey" FOREIGN KEY ("plainTshirtStockId") REFERENCES "PlainTshirtStock"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Product_inventoryProductId_idx" ON "Product"("inventoryProductId");
CREATE INDEX "PlainTshirtStock_inventoryProductId_idx" ON "PlainTshirtStock"("inventoryProductId");
CREATE INDEX "VariantSizeStock_plainTshirtStockId_idx" ON "VariantSizeStock"("plainTshirtStockId");

INSERT INTO "InventoryCategory" (id,name,"parentId","systemKey") VALUES
 ('inventory-tshirts','T-Shirts',NULL,'tshirts'),
 ('inventory-accessories','Accessories',NULL,'accessories');
INSERT INTO "InventoryCategory" (id,name,"parentId","systemKey") VALUES
 ('inventory-regular','Regular T-Shirts','inventory-tshirts','regular'),
 ('inventory-oversized','Oversized T-Shirts','inventory-tshirts','oversized'),
 ('inventory-raglan','Oversized Raglan T-Shirts','inventory-tshirts','raglan'),
 ('inventory-bags','Bags','inventory-accessories','bags'),
 ('inventory-pouches','Pouches','inventory-accessories','pouches');
INSERT INTO "InventoryProduct" (id,name,"categoryId") VALUES
 ('blank-regular','Regular T-Shirt','inventory-regular'),
 ('blank-oversized','Oversized T-Shirt','inventory-oversized'),
 ('blank-raglan','Oversized Raglan T-Shirt','inventory-raglan');

-- Preserve existing store categories, product URLs and design/print assignments.
INSERT INTO "InventoryProduct" (id,name,"categoryId")
 SELECT 'blank-accessory-' || d.slug,d.name,
  CASE WHEN lower(d.name) LIKE '%pouch%' THEN 'inventory-pouches'
       WHEN lower(d.name) LIKE '%bag%' OR lower(d.name) LIKE '%tote%' THEN 'inventory-bags'
       ELSE 'inventory-accessories' END
 FROM "Design" d
 WHERE d."departmentSlug"='accessories' OR EXISTS (
  SELECT 1 FROM "DepartmentSlugHistory" h WHERE h."currentSlug"=d."departmentSlug" AND h."oldSlug"='accessories'
 );

UPDATE "Product" p SET "inventoryProductId"=i.id
 FROM "InventoryProduct" i
 WHERE i.id='blank-accessory-' || p."designSlug";
UPDATE "Product" p SET "inventoryProductId"=CASE
 WHEN lower(p.name) LIKE '%raglan%' THEN 'blank-raglan'
 WHEN lower(p.name) LIKE '%oversiz%' THEN 'blank-oversized'
 WHEN lower(p.name) LIKE '%regular%' THEN 'blank-regular' END
 WHERE p."inventoryProductId" IS NULL
 AND p."departmentSlug"<>'accessories'
 AND NOT EXISTS (SELECT 1 FROM "DepartmentSlugHistory" h WHERE h."currentSlug"=p."departmentSlug" AND h."oldSlug"='accessories');

-- Freeze the existing mapping before relaxing global colour/size uniqueness.
UPDATE "VariantSizeStock" s SET "plainTshirtStockId"=stock.id
 FROM "ProductVariant" v,"PlainTshirtStock" stock
 WHERE s."variantId"=v.id AND stock."colorSlug"=v."colorSlug" AND stock.size=s.size;

-- Assign ownership only when every reference agrees on the physical parent.
-- Orphans and ambiguous shared blanks remain visible in the review queue.
WITH owners AS (
 SELECT s."plainTshirtStockId" AS id,min(p."inventoryProductId") AS parent
 FROM "VariantSizeStock" s
 JOIN "ProductVariant" v ON v.id=s."variantId"
 JOIN "Product" p ON p.id=v."productId"
 WHERE s."plainTshirtStockId" IS NOT NULL
 GROUP BY s."plainTshirtStockId"
 HAVING count(DISTINCT p."inventoryProductId")=1
 AND count(*) FILTER (WHERE p."inventoryProductId" IS NULL)=0
)
UPDATE "PlainTshirtStock" stock SET "inventoryProductId"=owners.parent FROM owners WHERE stock.id=owners.id;

DROP INDEX "PlainTshirtStock_colorSlug_size_key";
CREATE UNIQUE INDEX "PlainTshirtStock_inventoryProductId_colorSlug_size_key" ON "PlainTshirtStock"("inventoryProductId","colorSlug",size);
CREATE UNIQUE INDEX "PlainTshirtStock_unassigned_colorSlug_size_key" ON "PlainTshirtStock"("colorSlug",size) WHERE "inventoryProductId" IS NULL;

COMMIT;
