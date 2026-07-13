import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";

export { slugify, uniqueSlug, parseSizes, serializeSizes } from "@/app/_lib/product-helpers";
import { PRODUCT_TABS, type ProductTab } from "@/app/_lib/product-helpers";
export { PRODUCT_TABS, type ProductTab };

export const LOW_STOCK_THRESHOLD = 5;

export type ProductListParams = {
  tab?: ProductTab;
  category?: string;
  q?: string;
};

export function buildProductWhere(params: ProductListParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  switch (params.tab) {
    case "archived":
      where.archived = true;
      break;
    case "all":
      break;
    case "low-stock":
    case "active":
    default:
      where.archived = false;
  }

  if (params.category) where.categorySlug = params.category;

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

// Products affected by a low/out-of-stock raw-material pool: either their
// assigned design is at/below threshold, or any color+size they offer is.
// Computed in-app, not a DB where-clause — quantity no longer lives on the
// product side, and this catalog is small enough to scan in full.
export async function getLowStockProductIds(): Promise<string[]> {
  const [lowPlainRows, lowDesignRows] = await Promise.all([
    prisma.plainTshirtStock.findMany({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } }, select: { colorSlug: true, size: true } }),
    prisma.dtfDesign.findMany({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } }, select: { id: true } }),
  ]);
  const lowColorSizes = new Set(lowPlainRows.map((r) => `${r.colorSlug}::${r.size}`));
  const lowDesignIds = new Set(lowDesignRows.map((r) => r.id));
  if (lowColorSizes.size === 0 && lowDesignIds.size === 0) return [];

  const products = await prisma.product.findMany({
    where: { archived: false },
    select: {
      id: true,
      dtfDesignId: true,
      variants: { where: { archived: false }, select: { colorSlug: true, sizeStocks: { select: { size: true } } } },
    },
  });

  const ids: string[] = [];
  for (const p of products) {
    if (p.dtfDesignId && lowDesignIds.has(p.dtfDesignId)) { ids.push(p.id); continue; }
    const touchesLowPlain = p.variants.some((v) =>
      v.sizeStocks.some((s) => lowColorSizes.has(`${v.colorSlug}::${s.size}`)),
    );
    if (touchesLowPlain) ids.push(p.id);
  }
  return ids;
}

// Same as buildProductWhere, but resolves the low-stock tab's product-id
// filter (a query, not a static clause) before returning.
export async function resolveProductWhere(params: ProductListParams): Promise<Prisma.ProductWhereInput> {
  const where = buildProductWhere(params);
  if (params.tab === "low-stock") {
    where.id = { in: await getLowStockProductIds() };
  }
  return where;
}

export const PAGE_SIZE = 25;

export async function listProducts(
  params: ProductListParams & { page?: number; pageSize?: number },
) {
  const where = await resolveProductWhere(params);
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 200);
  const page = Math.max(1, params.page ?? 1);

  const [rows, total, plainStockRows, designStockRows] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        category: { select: { name: true } },
        variants: {
          // Deleting a color archives (soft-deletes) it; the admin list must show
          // only live colors, so its count/thumbnail/availability exclude archived rows.
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          select: {
            sortOrder: true,
            archived: true,
            colorSlug: true,
            sizeStocks: { select: { size: true } },
            images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
        },
        _count: { select: { variants: { where: { archived: false } } } },
      },
    }),
    prisma.product.count({ where }),
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
  ]);

  return { rows, total, plainStock: buildPlainStockMap(plainStockRows), designStock: buildDesignStockMap(designStockRows) };
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      variants: {
        where: { archived: false },
        orderBy: { sortOrder: "asc" },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          sizeStocks: { orderBy: { size: "asc" } },
        },
      },
    },
  });
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}
