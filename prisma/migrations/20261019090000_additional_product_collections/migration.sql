-- Additive: existing products keep their primary collection and all stock links.
CREATE TABLE "ProductCollection" (
    "productId" TEXT NOT NULL,
    "designSlug" TEXT NOT NULL,
    CONSTRAINT "ProductCollection_pkey" PRIMARY KEY ("productId", "designSlug")
);
CREATE INDEX "ProductCollection_designSlug_idx" ON "ProductCollection"("designSlug");
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCollection" ADD CONSTRAINT "ProductCollection_designSlug_fkey"
    FOREIGN KEY ("designSlug") REFERENCES "Design"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
