-- Drop VariantSizeStock.stock now that raw-material pools (PlainTshirtStock +
-- DtfDesign, added in 20260711120000) are the source of truth for quantity.
-- Ship only after that migration's app code is confirmed live — older code
-- reads/writes this column right up until the new code is actually serving
-- traffic.
ALTER TABLE "VariantSizeStock" DROP COLUMN IF EXISTS "stock";
