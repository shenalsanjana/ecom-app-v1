-- Empty means all payment methods, preserving every existing offer's behaviour.
ALTER TABLE "Discount" ADD COLUMN "paymentMethods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_paymentMethods_valid"
  CHECK (array_position("paymentMethods", NULL) IS NULL AND "paymentMethods" <@ ARRAY['COD', 'PAYHERE', 'KOKO', 'MINTPAY']::TEXT[]);
