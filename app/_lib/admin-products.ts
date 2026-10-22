import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";
import { inCollections } from "@/app/_lib/product-collections";

export { slugify, uniqueSlug, parseSizes, serializeSizes } from "@/app/_lib/product-helpers";
import { PRODUCT_TABS, type ProductTab } from "@/app/_lib/product-helpers";
export { PRODUCT_TABS, type ProductTab };

export const LOW_STOCK_THRESHOLD = 2;

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
    case "draft":
      where.archived = false;
      where.status = "DRAFT";
      break;
    case "low-stock":
    case "active":
    default:
      where.archived = false;
      where.status = "PUBLISHED";
  }

  if (params.category) where.AND = [inCollections([params.category])];

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
      { variants: { some: { archived: false, sizeStocks: { some: { archived: false, sku: { contains: q, mode: "insensitive" } } } } } },
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
    prisma.plainTshirtStock.findMany({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } }, select: { id: true, colorSlug: true, size: true, inventoryProductId: true } }),
    prisma.dtfDesign.findMany({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } }, select: { id: true } }),
  ]);
  const lowStockIds = new Set(lowPlainRows.map(r => r.id));
  const lowColorSizes = new Set(lowPlainRows.filter(r => !r.inventoryProductId).map((r) => `${r.colorSlug}::${r.size}`));
  const lowDesignIds = new Set(lowDesignRows.map((r) => r.id));
  if (lowStockIds.size === 0 && lowColorSizes.size === 0 && lowDesignIds.size === 0) return [];

  const products = await prisma.product.findMany({
    where: { archived: false, status: "PUBLISHED" },
    select: {
      id: true,
      dtfDesignId: true, stockMode: true,
      variants: { where: { archived: false }, select: { colorSlug: true, sizeStocks: { where: { archived: false }, select: { size: true, plainTshirtStockId: true } } } },
    },
  });

  const ids: string[] = [];
  for (const p of products) {
    if (p.stockMode !== "PLAIN" && p.dtfDesignId && lowDesignIds.has(p.dtfDesignId)) { ids.push(p.id); continue; }
    const touchesLowPlain = p.variants.some((v) =>
      v.sizeStocks.some((s) => s.plainTshirtStockId ? lowStockIds.has(s.plainTshirtStockId) :
        s.plainTshirtStockId === undefined && lowColorSizes.has(`${v.colorSlug}::${s.size}`)),
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
        design: { select: { name: true } },
        additionalCollections: { select: { designSlug: true, design: { select: { name: true, department: { select: { name: true } } } } }, orderBy: { designSlug: "asc" } },
        variants: {
          // Deleting a color archives (soft-deletes) it; the admin list must show
          // only live colors, so its count/thumbnail/availability exclude archived rows.
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          select: {
            sortOrder: true,
            archived: true,
            colorSlug: true,
            sizeStocks: { where: { archived: false }, select: { size: true, plainTshirtStockId: true } },
            images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
        },
        _count: { select: { variants: { where: { archived: false } } } },
      },
    }),
    prisma.product.count({ where }),
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true, inventoryProductId: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
  ]);

  return { rows, total, plainStock: buildPlainStockMap(plainStockRows), designStock: buildDesignStockMap(designStockRows) };
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      design: true,
      additionalCollections: { select: { designSlug: true }, orderBy: { designSlug: "asc" } },
      variants: {
        where: { archived: false },
        orderBy: { sortOrder: "asc" },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          sizeStocks: { where: { archived: false }, orderBy: { size: "asc" } },
        },
      },
    },
  });
}

export async function listCategories() {
  return prisma.design.findMany({ orderBy: { name: "asc" } });
}

// Departments for the admin category form's picker. Ordered by sortOrder so the
// select reads in the storefront's department order rather than alphabetically.
export async function listDepartments() {
  return prisma.department.findMany({ orderBy: { sortOrder: "asc" } });
}
