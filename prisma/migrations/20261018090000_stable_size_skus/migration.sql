BEGIN;

-- Reserve a separate namespace without changing existing colour/feed identities.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ProductVariant" WHERE upper(btrim(sku)) LIKE 'DBV-%') THEN
    RAISE EXCEPTION 'Resolve legacy colour SKUs using the reserved DBV- prefix before migrating';
  END IF;
END $$;

CREATE SEQUENCE public.sale_sku_seq;
CREATE FUNCTION public.next_sale_sku() RETURNS text
LANGUAGE plpgsql VOLATILE AS $$
DECLARE code text;
BEGIN
  code := nextval('public.sale_sku_seq'::regclass)::text;
  RETURN 'DBV-' || lpad(code, greatest(6, length(code)), '0');
END $$;

ALTER TABLE "VariantSizeStock"
  ADD COLUMN sku text NOT NULL DEFAULT public.next_sale_sku(),
  ADD COLUMN archived boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "VariantSizeStock_sku_key" ON "VariantSizeStock"(sku);
CREATE INDEX "VariantSizeStock_variantId_archived_idx" ON "VariantSizeStock"("variantId", archived);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_reserved_sale_sku_prefix"
  CHECK (sku IS NULL OR upper(btrim(sku)) NOT LIKE 'DBV-%');

-- Reject accidental old-style row rebuilds. Cascades from deleting a product
-- or colour remain compatible with the existing catalogue deletion workflow.
CREATE FUNCTION public.protect_sale_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'Archive offered sizes instead of deleting their sale identities';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.sku IS DISTINCT FROM OLD.sku
     OR NEW."variantId" IS DISTINCT FROM OLD."variantId" OR NEW.size IS DISTINCT FROM OLD.size THEN
    RAISE EXCEPTION 'Sale identity is permanent; archive a size and add a new one instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "VariantSizeStock_protect_identity"
  BEFORE UPDATE OR DELETE ON "VariantSizeStock"
  FOR EACH ROW EXECUTE FUNCTION public.protect_sale_identity();

COMMIT;
