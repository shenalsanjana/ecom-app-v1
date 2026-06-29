-- CreateTable
CREATE TABLE "ProductSlugHistory" (
    "oldSlug" TEXT NOT NULL,
    "currentId" TEXT NOT NULL,

    CONSTRAINT "ProductSlugHistory_pkey" PRIMARY KEY ("oldSlug")
);

-- CreateIndex
CREATE INDEX "ProductSlugHistory_currentId_idx" ON "ProductSlugHistory"("currentId");

-- AddForeignKey
ALTER TABLE "ProductSlugHistory" ADD CONSTRAINT "ProductSlugHistory_currentId_fkey" FOREIGN KEY ("currentId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
