-- Existing coupon codes remain private unless an administrator publishes them.
ALTER TABLE "Discount" ADD COLUMN "publicOffer" BOOLEAN NOT NULL DEFAULT false;
