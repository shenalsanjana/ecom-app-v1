BEGIN;

CREATE TYPE "StockGroup" AS ENUM ('PLAIN_TSHIRT', 'ACCESSORY');
ALTER TABLE "PlainTshirtStock" ADD COLUMN "stockGroup" "StockGroup" NOT NULL DEFAULT 'PLAIN_TSHIRT';

-- Preserve the existing inventory grouping without changing any balance.
WITH stock_usage AS (
  SELECT v."colorSlug", s.size,
    bool_or(p."departmentSlug" = 'accessories' OR h."oldSlug" IS NOT NULL) AS accessory,
    bool_or(p."departmentSlug" <> 'accessories' AND h."oldSlug" IS NULL) AS tshirt
  FROM "ProductVariant" v
  JOIN "Product" p ON p.id = v."productId"
  JOIN "VariantSizeStock" s ON s."variantId" = v.id
  LEFT JOIN "DepartmentSlugHistory" h ON h."currentSlug" = p."departmentSlug" AND h."oldSlug" = 'accessories'
  GROUP BY v."colorSlug", s.size
)
UPDATE "PlainTshirtStock" stock SET "stockGroup" = 'ACCESSORY'
FROM stock_usage usage
WHERE stock."colorSlug" = usage."colorSlug" AND stock.size = usage.size
  AND usage.accessory AND NOT usage.tshirt;

COMMIT;
