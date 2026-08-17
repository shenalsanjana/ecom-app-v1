-- Closes migration-history drift: OrderNote was added to schema.prisma in
-- commit ee0282f3 (2026-06-02) via `prisma db push` against the dev DB, but
-- no migration ever created the table on Postgres. `prisma migrate deploy`
-- reports "up to date" regardless, since it only checks that migration files
-- have been applied, not that they match schema.prisma. This left
-- Order.notesLog (admin order internal notes) crashing with
-- "table public.OrderNote does not exist" in production. Additive &
-- re-runnable per this repo's deploy convention.

CREATE TABLE IF NOT EXISTS "OrderNote" (
  "id"          TEXT NOT NULL,
  "orderId"     TEXT NOT NULL,
  "authorEmail" TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrderNote_orderId_idx" ON "OrderNote"("orderId");

DO $$ BEGIN
  ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
