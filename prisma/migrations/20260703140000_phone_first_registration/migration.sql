-- prisma/migrations/20260703140000_phone_first_registration/migration.sql
-- Phone-first registration: email optional, phone identity, OTP challenges.
-- Re-runnable (IF EXISTS / IF NOT EXISTS) per this repo's deploy convention.

-- Email becomes optional (idempotent: DROP NOT NULL is a no-op if already nullable)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- passwordHash becomes optional too (phone-only signups have no password until
-- OTP verification completes). Schema.prisma declares `passwordHash String?`,
-- but the original init migration created this column NOT NULL — without this
-- line the DB constraint would still reject phone-only inserts even though
-- Prisma's generated types say it's allowed. Idempotent: no-op if already nullable.
-- (Deviation from the task brief's verbatim SQL — see task-2-report.md.)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Phone identity columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");

-- OTP challenge table
CREATE TABLE IF NOT EXISTS "PhoneChallenge" (
  "id"         TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "codeHash"   TEXT NOT NULL,
  "purpose"    VARCHAR(16) NOT NULL,
  "payload"    TEXT,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PhoneChallenge_phone_purpose_idx" ON "PhoneChallenge"("phone", "purpose");
CREATE INDEX IF NOT EXISTS "PhoneChallenge_expiresAt_idx" ON "PhoneChallenge"("expiresAt");
