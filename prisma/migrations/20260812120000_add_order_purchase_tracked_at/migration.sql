-- Meta Pixel Purchase events were deduped only via client-side localStorage
-- (trackPurchaseOnce), which isn't durable: private browsing, in-app browser
-- webviews, or simply reopening the confirmation link in a different browser
-- context each start with empty storage and refire Purchase for the same
-- order. This column moves the one-shot claim server-side, mirroring the
-- confirmationSmsSentAt / dispatchSmsSentAt idempotency-stamp pattern already
-- used elsewhere on this table. Additive & re-runnable per this repo's
-- deploy convention.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "purchaseTrackedAt" TIMESTAMP(3);
