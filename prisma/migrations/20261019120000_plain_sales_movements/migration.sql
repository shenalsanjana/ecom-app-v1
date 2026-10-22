CREATE TYPE "StockMode" AS ENUM ('PRINTED_TO_ORDER', 'PLAIN');
ALTER TABLE "Product" ADD COLUMN "stockMode" "StockMode" NOT NULL DEFAULT 'PRINTED_TO_ORDER';
ALTER TABLE "OrderItem" ADD COLUMN "stockMode" "StockMode" NOT NULL DEFAULT 'PRINTED_TO_ORDER';

CREATE TABLE "StockMovement" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "plainTshirtStockId" TEXT REFERENCES "PlainTshirtStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "dtfDesignId" TEXT REFERENCES "DtfDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "stockLabel" TEXT NOT NULL,
  "stockVersion" INTEGER NOT NULL,
  "before" INTEGER NOT NULL,
  "after" INTEGER NOT NULL,
  "delta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "orderId" TEXT,
  "operationKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_one_pool" CHECK (("plainTshirtStockId" IS NOT NULL)::int + ("dtfDesignId" IS NOT NULL)::int = 1),
  CONSTRAINT "StockMovement_balances" CHECK ("before" >= 0 AND "after" >= 0 AND "delta" = "after" - "before"),
  CONSTRAINT "StockMovement_actor" CHECK ("actorType" IN ('ADMIN', 'CUSTOMER', 'SYSTEM'))
);
CREATE UNIQUE INDEX "StockMovement_plainTshirtStockId_stockVersion_key" ON "StockMovement"("plainTshirtStockId", "stockVersion");
CREATE UNIQUE INDEX "StockMovement_dtfDesignId_stockVersion_key" ON "StockMovement"("dtfDesignId", "stockVersion");
CREATE INDEX "StockMovement_createdAt_id_idx" ON "StockMovement"("createdAt", "id");
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");
CREATE INDEX "StockMovement_operationKey_idx" ON "StockMovement"("operationKey");
CREATE TABLE "StockOperation" (
  "key" TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- This records the current available balances, not historical receipts/on-hand.
INSERT INTO "StockMovement" ("plainTshirtStockId", "stockLabel", "stockVersion", "before", "after", "delta", "reason", "actorType", "operationKey")
SELECT s.id, concat_ws(' · ', p.name, s.color, s.size), s.version, 0, s.quantity, s.quantity,
 'Opening recorded available balance', 'SYSTEM', 'migration:stock-stage3a1'
FROM "PlainTshirtStock" s LEFT JOIN "InventoryProduct" p ON p.id=s."inventoryProductId";
INSERT INTO "StockMovement" ("dtfDesignId", "stockLabel", "stockVersion", "before", "after", "delta", "reason", "actorType", "operationKey")
SELECT id, name, version, 0, quantity, quantity,
 'Opening recorded available balance', 'SYSTEM', 'migration:stock-stage3a1' FROM "DtfDesign";

CREATE FUNCTION stock_quantity_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantity IS DISTINCT FROM OLD.quantity AND NEW.version <= OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER stock_quantity_version BEFORE UPDATE ON "PlainTshirtStock" FOR EACH ROW EXECUTE FUNCTION stock_quantity_version();
CREATE TRIGGER stock_quantity_version BEFORE UPDATE ON "DtfDesign" FOR EACH ROW EXECUTE FUNCTION stock_quantity_version();

CREATE FUNCTION record_available_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  context jsonb := COALESCE(NULLIF(current_setting('app.stock_context', true), '')::jsonb, '{}'::jsonb);
  previous integer := 0;
  label text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    previous := OLD.quantity;
    IF NEW.quantity = OLD.quantity THEN RETURN NEW; END IF;
  ELSIF NEW.quantity = 0 THEN
    -- An unused zero-opening pool can still be removed without audit history.
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'PlainTshirtStock' THEN
    SELECT concat_ws(' · ', p.name, NEW.color, NEW.size) INTO label
      FROM (SELECT 1) x LEFT JOIN "InventoryProduct" p ON p.id=NEW."inventoryProductId";
  ELSE label := NEW.name;
  END IF;
  INSERT INTO "StockMovement" ("plainTshirtStockId", "dtfDesignId", "stockLabel", "stockVersion", "before", "after", "delta", "reason", "actorType", "actorId", "orderId", "operationKey")
  VALUES (CASE WHEN TG_TABLE_NAME='PlainTshirtStock' THEN NEW.id END,
    CASE WHEN TG_TABLE_NAME='DtfDesign' THEN NEW.id END, label, NEW.version,
    previous, NEW.quantity, NEW.quantity-previous,
    COALESCE(context->>'reason', 'Direct database quantity change'),
    COALESCE(context->>'actorType', 'SYSTEM'), context->>'actorId', context->>'orderId',
    COALESCE(context->>'operationKey', 'database:' || txid_current()::text));
  RETURN NEW;
END; $$;
CREATE TRIGGER record_available_stock_movement AFTER INSERT OR UPDATE ON "PlainTshirtStock" FOR EACH ROW EXECUTE FUNCTION record_available_stock_movement();
CREATE TRIGGER record_available_stock_movement AFTER INSERT OR UPDATE ON "DtfDesign" FOR EACH ROW EXECUTE FUNCTION record_available_stock_movement();

CREATE FUNCTION prevent_stock_audit_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Stock audit records are immutable'; END; $$;
CREATE TRIGGER prevent_stock_movement_edit BEFORE UPDATE OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION prevent_stock_audit_edit();
CREATE TRIGGER prevent_stock_operation_edit BEFORE UPDATE OR DELETE ON "StockOperation" FOR EACH ROW EXECUTE FUNCTION prevent_stock_audit_edit();
