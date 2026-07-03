-- AlterTable
-- IF NOT EXISTS: this repo's workflow sometimes db-pushes columns to prod during
-- dev before the migration file exists (see 20260527000000_add_user_role), so the
-- deploy must be safely re-runnable. The backfill below is already idempotent.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "synthetic" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every review that exists today is seeded (no customer submission
-- path exists yet), so mark them all synthetic. This lets the content-rewrite
-- script target them while never touching future real (customer-written) reviews.
UPDATE "Review" SET "synthetic" = true;
