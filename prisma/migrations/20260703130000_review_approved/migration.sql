-- AlterTable
-- IF NOT EXISTS: this repo sometimes db-pushes columns to prod during dev before
-- the migration file exists (see 20260527000000_add_user_role and the sibling
-- 20260703120000_add_review_synthetic), so the deploy must be safely re-runnable.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Review_approved_idx" ON "Review"("approved");

-- Backfill: all reviews existing today are seeded/trusted, so make them visible.
-- (No customer submission path exists in prod yet, so there are no real pending rows.)
UPDATE "Review" SET "approved" = true;
