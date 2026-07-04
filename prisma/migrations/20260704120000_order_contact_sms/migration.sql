-- Add order-scoped alternate delivery phone + per-channel SMS idempotency stamps.
ALTER TABLE "Order"
  ADD COLUMN "alternatePhone" TEXT,
  ADD COLUMN "confirmationSmsSentAt" TIMESTAMP(3),
  ADD COLUMN "dispatchSmsSentAt" TIMESTAMP(3),
  ADD COLUMN "cancellationSmsSentAt" TIMESTAMP(3);
