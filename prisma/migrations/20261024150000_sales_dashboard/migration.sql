BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE "Product" ADD COLUMN "costPriceCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN "salesPaidAt" TIMESTAMP(3), ADD COLUMN "salesDateEstimated" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "hasSalesRefunds" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN "unitCostCents" INTEGER, ADD COLUMN "salesListPriceCents" INTEGER, ADD COLUMN "salesProductKey" TEXT, ADD COLUMN "salesCategoryKey" TEXT, ADD COLUMN "salesCategoryName" TEXT;
ALTER TABLE "OrderAdjustment" ADD COLUMN "salesItemSku" TEXT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_cost_check" CHECK ("costPriceCents" IS NULL OR "costPriceCents">=0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_cost_check" CHECK ("unitCostCents" IS NULL OR "unitCostCents">=0);
CREATE TABLE "SalesRefund" (
 "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "operationKey" VARCHAR(36) NOT NULL UNIQUE, "payloadHash" VARCHAR(64) NOT NULL, "reference" VARCHAR(120) NOT NULL,
 "merchandiseCents" INTEGER NOT NULL, "shippingCents" INTEGER NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL,
 "reason" VARCHAR(500) NOT NULL, "createdByEmail" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMP(3), "voidReason" VARCHAR(500), "voidedByEmail" TEXT,
 CONSTRAINT "SalesRefund_amount_check" CHECK ("merchandiseCents">=0 AND "shippingCents">=0 AND "merchandiseCents"::bigint+"shippingCents">0)
);
CREATE UNIQUE INDEX "SalesRefund_active_reference_key" ON "SalesRefund"("orderId","reference") WHERE "voidedAt" IS NULL;
CREATE INDEX "SalesRefund_orderId_reference_idx" ON "SalesRefund"("orderId","reference");
CREATE INDEX "SalesRefund_occurredAt_idx" ON "SalesRefund"("occurredAt");
CREATE INDEX "SalesRefund_orderId_voidedAt_idx" ON "SalesRefund"("orderId","voidedAt");
CREATE TABLE "SalesRefundItem" (
 "id" TEXT PRIMARY KEY, "refundId" TEXT NOT NULL REFERENCES "SalesRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "orderItemId" TEXT NOT NULL, "amountCents" INTEGER NOT NULL, "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
 "unitCostCents" INTEGER, "productKey" TEXT NOT NULL, "productName" TEXT NOT NULL,
 "categoryKey" TEXT NOT NULL, "categoryName" TEXT NOT NULL, "size" TEXT NOT NULL,
 CONSTRAINT "SalesRefundItem_amount_check" CHECK ("amountCents">=0 AND "returnedQuantity">=0 AND ("unitCostCents" IS NULL OR "unitCostCents">=0))
);
CREATE INDEX "SalesRefundItem_refundId_idx" ON "SalesRefundItem"("refundId");
CREATE INDEX "SalesRefundItem_orderItemId_idx" ON "SalesRefundItem"("orderItemId");
CREATE UNIQUE INDEX "SalesRefundItem_refundId_orderItemId_key" ON "SalesRefundItem"("refundId","orderItemId");
CREATE INDEX "Order_salesPaidAt_idx" ON "Order"("salesPaidAt");
CREATE INDEX "Order_salesChannel_salesPaidAt_idx" ON "Order"("salesChannel","salesPaidAt");
-- No historical cost is inferred from a selling price.
UPDATE "OrderItem" i SET "salesProductKey"=COALESCE(i."productId",'legacy-item:'||i.id),
 "salesCategoryKey"=COALESCE(p."designSlug",'uncategorized'), "salesCategoryName"=COALESCE(d.name,'Uncategorized')
 FROM (SELECT id FROM "OrderItem") x LEFT JOIN "OrderItem" old ON old.id=x.id LEFT JOIN "Product" p ON p.id=old."productId" LEFT JOIN "Design" d ON d.slug=p."designSlug" WHERE i.id=x.id;
WITH evidence AS (SELECT "orderId", MIN("createdAt") AS at FROM "PaymentEvent" WHERE outcome='PAID' AND result='success' GROUP BY "orderId")
UPDATE "Order" o SET "salesPaidAt"=COALESCE(e.at,o."createdAt"),
 "salesDateEstimated"=(e.at IS NULL AND NOT (o."salesChannel"='POS' AND o."paymentMethod"<>'COD'))
 FROM (SELECT id FROM "Order") x LEFT JOIN evidence e ON e."orderId"=x.id
 WHERE o.id=x.id AND o."paymentStatus" IN ('PAID','COD_COLLECTED');
-- Link existing POS item adjustments only when the saved SKU identifies one line.
UPDATE "OrderAdjustment" a SET "salesItemSku"=i.sku FROM "OrderItem" i JOIN "Order" o ON o.id=i."orderId"
 WHERE a."orderId"=i."orderId" AND o."salesChannel"='POS' AND i.sku IS NOT NULL
 AND starts_with(a.label,'POS · Item '||i.name||' ['||i.sku||'] ·')
 AND (SELECT COUNT(*) FROM "OrderItem" sibling WHERE sibling."orderId"=i."orderId" AND sibling.sku=i.sku)=1;
COMMIT;
