-- AlterTable
ALTER TABLE "Review" ADD COLUMN "synthetic" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every review that exists today is seeded (no customer submission
-- path exists yet), so mark them all synthetic. This lets the content-rewrite
-- script target them while never touching future real (customer-written) reviews.
UPDATE "Review" SET "synthetic" = true;
