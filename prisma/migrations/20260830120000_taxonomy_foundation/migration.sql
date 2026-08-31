-- Departments
CREATE TABLE "Department" (
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "navLabel" TEXT NOT NULL,
  "tileName" TEXT NOT NULL,
  "note" TEXT,
  "subName" TEXT,
  "hex" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("slug")
);

INSERT INTO "Department" ("slug","name","navLabel","tileName","note","subName","hex","sortOrder") VALUES
  ('men','Men','Men','Men',NULL,'Oversized Graphic T-Shirts','#B7C7D6',0),
  ('women','Women','Women','Women',NULL,'Oversized Graphic T-Shirts','#EFC4C4',1),
  ('plain','Plain T-Shirts (Unisex)','Plain Tees','Plain T-Shirts','Unisex',NULL,'#DEDAD2',2),
  ('accessories','Accessories','Accessories','Accessories',NULL,NULL,'#C4906E',3);

CREATE TABLE "DepartmentSlugHistory" (
  "oldSlug" TEXT NOT NULL,
  "currentSlug" TEXT NOT NULL,
  CONSTRAINT "DepartmentSlugHistory_pkey" PRIMARY KEY ("oldSlug")
);
CREATE INDEX "DepartmentSlugHistory_currentSlug_idx" ON "DepartmentSlugHistory"("currentSlug");
ALTER TABLE "DepartmentSlugHistory"
  ADD CONSTRAINT "DepartmentSlugHistory_currentSlug_fkey"
  FOREIGN KEY ("currentSlug") REFERENCES "Department"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- Category -> Design (rename, preserving rows and the slug-history cascade)
ALTER TABLE "Category" RENAME TO "Design";
ALTER TABLE "CategorySlugHistory" RENAME TO "DesignSlugHistory";
ALTER TABLE "Design" RENAME CONSTRAINT "Category_pkey" TO "Design_pkey";
ALTER TABLE "DesignSlugHistory" RENAME CONSTRAINT "CategorySlugHistory_pkey" TO "DesignSlugHistory_pkey";
ALTER TABLE "DesignSlugHistory" RENAME CONSTRAINT "CategorySlugHistory_currentSlug_fkey" TO "DesignSlugHistory_currentSlug_fkey";
ALTER INDEX "CategorySlugHistory_currentSlug_idx" RENAME TO "DesignSlugHistory_currentSlug_idx";

ALTER TABLE "Design" ALTER COLUMN "image" DROP NOT NULL;
ALTER TABLE "Design" ADD COLUMN "departmentSlug" TEXT;
ALTER TABLE "Design" ADD COLUMN "hex" TEXT;
ALTER TABLE "Design" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Design" ADD COLUMN "dtfDesignId" TEXT;

-- Existing categories are women's graphic-tee designs
UPDATE "Design" SET "departmentSlug" = 'women' WHERE "departmentSlug" IS NULL;
UPDATE "Design" SET "hex" = '#EFC4C4' WHERE "slug" = 'cat';
UPDATE "Design" SET "hex" = '#AEBBA0' WHERE "slug" = 'dino';
UPDATE "Design" SET "hex" = '#EFC4C4' WHERE "hex" IS NULL;

ALTER TABLE "Design" ALTER COLUMN "departmentSlug" SET NOT NULL;
ALTER TABLE "Design" ALTER COLUMN "hex" SET NOT NULL;
CREATE INDEX "Design_departmentSlug_idx" ON "Design"("departmentSlug");
ALTER TABLE "Design"
  ADD CONSTRAINT "Design_departmentSlug_fkey"
  FOREIGN KEY ("departmentSlug") REFERENCES "Department"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Design"
  ADD CONSTRAINT "Design_dtfDesignId_fkey"
  FOREIGN KEY ("dtfDesignId") REFERENCES "DtfDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Product
ALTER TABLE "Product" RENAME COLUMN "categorySlug" TO "designSlug";
ALTER TABLE "Product" RENAME CONSTRAINT "Product_categorySlug_fkey" TO "Product_designSlug_fkey";
ALTER INDEX "Product_categorySlug_idx" RENAME TO "Product_designSlug_idx";

ALTER TABLE "Product" ADD COLUMN "departmentSlug" TEXT;
UPDATE "Product" p SET "departmentSlug" = d."departmentSlug"
  FROM "Design" d WHERE d."slug" = p."designSlug";
ALTER TABLE "Product" ALTER COLUMN "departmentSlug" SET NOT NULL;
CREATE INDEX "Product_departmentSlug_idx" ON "Product"("departmentSlug");
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_departmentSlug_fkey"
  FOREIGN KEY ("departmentSlug") REFERENCES "Department"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
