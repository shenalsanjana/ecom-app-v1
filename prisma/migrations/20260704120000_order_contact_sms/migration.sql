-- Add order-scoped alternate delivery phone + per-channel SMS idempotency stamps.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmationSmsSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dispatchSmsSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellationSmsSentAt" TIMESTAMP(3);
