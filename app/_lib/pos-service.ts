import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/app/_lib/prisma";
import { toCents, fromCents } from "@/app/_lib/discounts";
import { acquireItemPools } from "@/app/_lib/inventory-pools";
import { assertProductsPublished } from "@/app/_lib/product-publication";
import { setStockMovementContext } from "@/app/_lib/stock-movements";
import { effectivePrintId, requiresPrint } from "@/app/_lib/stock-policy";
import { PosError, posChange, posTotal, type PosProduct, type PosSale } from "@/app/_lib/pos";

export async function getPosProducts(query = ""): Promise<PosProduct[]> {
  const q = query.trim().slice(0, 120);
  const rows = await prisma.variantSizeStock.findMany({
    where: {
      archived: false,
      variant: { archived: false, product: { archived: false, status: "PUBLISHED" } },
      ...(q ? { OR: [
        { sku: { contains: q, mode: "insensitive" as const } },
        { variant: { product: { name: { contains: q, mode: "insensitive" as const } } } },
        { variant: { color: { contains: q, mode: "insensitive" as const } } },
      ] } : {}),
    },
    select: {
      id: true, sku: true, size: true,
      plainTshirtStock: { select: { colorSlug: true, size: true, quantity: true } },
      variant: { select: {
        color: true, colorSlug: true, price: true,
        images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        product: { select: {
          id: true, name: true, price: true, stockMode: true,
          dtfDesign: { select: { quantity: true } },
          inventoryProduct: { select: { category: { select: { id: true, name: true } } } },
          department: { select: { slug: true, name: true } },
        } },
      } },
    },
    orderBy: { sku: "asc" },
  });
  return rows.map(cell => {
    const { variant, plainTshirtStock: blank } = cell;
    const product = variant.product;
    const matches = blank && blank.colorSlug === variant.colorSlug && blank.size === cell.size;
    const available = matches ? (requiresPrint(product.stockMode)
      ? Math.min(blank.quantity, product.dtfDesign?.quantity ?? 0) : blank.quantity) : 0;
    return {
      productId: product.id,
      categoryId: product.inventoryProduct?.category.id ?? product.department.slug,
      categoryName: product.inventoryProduct?.category.name ?? product.department.name,
      sizeStockId: cell.id, sku: cell.sku, name: product.name, color: variant.color, size: cell.size,
      price: toCents(variant.price ?? product.price), available: Math.max(0, available),
      image: variant.images[0]?.url ?? null,
    };
  });
}

/** The receipt, payment record, stock changes and audit events commit together.
 * Serializable retries also catch concurrent changes to variant sizes/prices. */
export async function savePosSale(sale: PosSale, cashierId: string) {
  if (!cashierId) throw new PosError("Sign in again before completing a sale.");
  const items = [...sale.items].sort((a, b) => a.sizeStockId.localeCompare(b.sizeStockId));
  const canonical = { ...sale, items };
  const hash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  const idempotencyKey = `pos:${sale.operationKey}`;

  const previousSale = (previous: { id: string; posNumber: string | null; cashierId: string | null; posPayloadHash: string | null } | null) => {
    if (!previous) return null;
    if (previous.cashierId !== cashierId || previous.posPayloadHash !== hash || !previous.posNumber) {
      throw new PosError("This sale reference was already used for different details. Start a new sale.");
    }
    return { orderId: previous.id, posNumber: previous.posNumber };
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const previous = previousSale(await tx.order.findUnique({ where: { idempotencyKey } }));
        if (previous) return previous;

        const cells = await tx.variantSizeStock.findMany({
          where: { id: { in: items.map(item => item.sizeStockId) }, archived: false,
            variant: { archived: false, product: { archived: false, status: "PUBLISHED" } } },
          include: { plainTshirtStock: true, variant: { include: { product: true } } },
        });
        if (cells.length !== items.length) throw new PosError("An item is no longer available. Refresh products and update the cart.");
        await assertProductsPublished(tx, cells.map(cell => cell.variant.product.id));

        const lines = items.map(item => {
          const cell = cells.find(row => row.id === item.sizeStockId)!;
          const { variant, plainTshirtStock: blank } = cell;
          const product = variant.product;
          const price = toCents(variant.price ?? product.price);
          if (!Number.isSafeInteger(price) || price <= 0 || price !== item.expectedPrice) {
            throw new PosError(`The price of "${product.name}" changed. Refresh products and re-add this item.`);
          }
          if (!blank || blank.colorSlug !== variant.colorSlug || blank.size !== cell.size ||
              (requiresPrint(product.stockMode) && !product.dtfDesignId)) {
            throw new PosError(`Stock is not configured for "${product.name}". Update inventory first.`);
          }
          return {
            productId: product.id, variantId: variant.id, name: product.name, color: variant.color,
            size: cell.size, sku: cell.sku, price: fromCents(price), quantity: item.quantity,
            plainTshirtStockId: blank.id, dtfDesignId: effectivePrintId(product), stockMode: product.stockMode,
          };
        });
        const total = posTotal(lines.map(line => ({ price: toCents(line.price), quantity: line.quantity })));
        posChange(total, sale.paymentMethod === "CASH" ? sale.tendered : total);
        if (sale.paymentMethod === "CARD" && sale.tendered !== total) {
          throw new PosError("The card amount must match the sale total.");
        }

        const orderId = randomUUID();
        await setStockMovementContext(tx, { actorType: "ADMIN", actorId: cashierId,
          reason: "Shop POS sale", orderId, operationKey: sale.operationKey });
        for (const line of [...lines].sort((a, b) =>
          a.plainTshirtStockId.localeCompare(b.plainTshirtStockId) || (a.dtfDesignId ?? "").localeCompare(b.dtfDesignId ?? ""))) {
          await acquireItemPools(tx, line);
        }
        const sequence = await tx.$queryRaw<{ next: bigint }[]>`SELECT nextval('pos_number_seq') AS next`;
        const posNumber = `POS${String(sequence[0].next).padStart(4, "0")}`;
        await tx.order.create({ data: {
          id: orderId, salesChannel: "POS", posNumber, cashierId, posPayloadHash: hash, idempotencyKey,
          guestName: sale.customerName || "Walk-in customer", customerPhone: "",
          shippingLine1: "In-store collection", shippingCity: "", shippingCountry: "Sri Lanka",
          subtotal: fromCents(total), shippingCost: 0, total: fromCents(total),
          paymentMethod: sale.paymentMethod, paymentMethodDisplay: sale.paymentMethod === "CASH" ? "Cash (in store)" : "Card terminal (in store)",
          paymentStatus: "PAID", status: "DELIVERED", posTendered: fromCents(sale.tendered),
          posPaymentReference: sale.paymentMethod === "CARD" ? sale.paymentReference : null,
          items: { create: lines },
        } });
        return { orderId, posNumber };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2034" && attempt < 2) continue;
      if (code === "P2002") {
        const previous = previousSale(await prisma.order.findUnique({ where: { idempotencyKey } }));
        if (previous) return previous;
      }
      throw error;
    }
  }
  throw new PosError("The sale could not be saved. Retry with the same sale reference.");
}
