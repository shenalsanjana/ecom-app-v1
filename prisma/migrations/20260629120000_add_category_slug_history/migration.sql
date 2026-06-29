-- CreateTable
CREATE TABLE "CategorySlugHistory" (
    "oldSlug" TEXT NOT NULL,
    "currentSlug" TEXT NOT NULL,

    CONSTRAINT "CategorySlugHistory_pkey" PRIMARY KEY ("oldSlug")
);

-- CreateIndex
CREATE INDEX "CategorySlugHistory_currentSlug_idx" ON "CategorySlugHistory"("currentSlug");

-- AddForeignKey
ALTER TABLE "CategorySlugHistory" ADD CONSTRAINT "CategorySlugHistory_currentSlug_fkey" FOREIGN KEY ("currentSlug") REFERENCES "Category"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
