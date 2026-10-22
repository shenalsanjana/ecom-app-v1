import { requiresPrint, effectivePrintId, type StockMode } from "./stock-policy";
import { Prisma } from "@prisma/client";

export class PublicationError extends Error {}

/** Validate saved state in the same transaction as publication. Zero stock is
 * valid: a complete product may be published and displayed as out of stock. */
export async function assertReadyToPublish(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const product = await tx.product.findUniqueOrThrow({ where: { id }, include: {
    variants: { where: { archived: false }, include: {
      images: true, sizeStocks: { where: { archived: false }, include: { plainTshirtStock: true } },
    } },
  } });
  if (!product.name.trim() || !product.designSlug || !Number.isFinite(product.price) || product.price <= 0) throw new PublicationError("Add a name, primary collection and positive selling price before publishing.");
  if (!product.description.trim()) throw new PublicationError("Add a product description before publishing.");
  if (!product.inventoryProductId) throw new PublicationError("Choose a physical product family before publishing.");
  if (requiresPrint(product.stockMode) && !product.dtfDesignId) throw new PublicationError("Choose the DTF print used by this product before publishing.");
  if (!product.variants.length) throw new PublicationError("Add at least one colour with images and sizes before publishing.");
  for (const variant of product.variants) {
    if (!variant.color.trim() || !Number.isFinite(variant.price ?? product.price) || (variant.price ?? product.price) <= 0) throw new PublicationError("Each colour needs a name and a positive selling price before publishing.");
    for (const role of ["CARD", "DETAIL"]) if (!variant.images.some(image => image.role === role && image.url.trim())) throw new PublicationError(`Add a ${role === "CARD" ? "card" : "detail"} image for ${variant.color} before publishing.`);
    if (!variant.sizeStocks.length) throw new PublicationError(`Choose offered sizes for ${variant.color} before publishing.`);
    for (const cell of variant.sizeStocks) {
      const blank = cell.plainTshirtStock;
      if (!blank || blank.colorSlug !== variant.colorSlug || blank.size !== cell.size) throw new PublicationError(`Choose a matching shared blank for ${variant.color} / ${cell.size} before publishing.`);
    }
  }
}

/** Share locks serialize new sales against unpublish/archive/delete. They
 * allow other sales, and deterministic ordering avoids cross-product deadlocks. */
export async function assertProductsPublished(tx: Prisma.TransactionClient, ids: string[], expected?: { id: string; stockMode?: StockMode; dtfDesignId: string | null }[]): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return;
  const rows = await tx.$queryRaw<{ id: string; status: string; archived: boolean; stockMode: StockMode; dtfDesignId: string | null }[]>(Prisma.sql`
    SELECT "id", "status", "archived", "stockMode", "dtfDesignId" FROM "Product"
    WHERE "id" IN (${Prisma.join(unique)}) ORDER BY "id" FOR SHARE
  `);
  if (rows.length !== unique.length || rows.some(row => row.status !== "PUBLISHED" || row.archived)) throw new PublicationError("A selected product is no longer available. Remove it and choose a published product.");
  if (expected?.some(value => {
    const saved = rows.find(row => row.id === value.id);
    return saved && (saved.stockMode !== (value.stockMode ?? "PRINTED_TO_ORDER") || effectivePrintId(saved) !== effectivePrintId(value));
  })) throw new PublicationError("Stock setup changed. Refresh the product and try again.");

}
