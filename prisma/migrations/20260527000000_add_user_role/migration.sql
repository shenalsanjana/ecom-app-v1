-- AlterTable
-- IF NOT EXISTS: the column was already applied to production via
-- `prisma db push` during spec #1 dev, before this migration file
-- existed. Without IF NOT EXISTS, prisma migrate deploy on prod errors
-- with P3018 / SQLSTATE 42701 ("column already exists"). On a fresh
-- database (CI, new dev clone), the column is created normally.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER';
