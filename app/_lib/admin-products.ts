import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";

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
    case "low-stock":
      where.archived = false;
      where.variants = { some: { sizeStocks: { some: { stock: { lte: LOW_STOCK_THRESHOLD } } } } };
      break;
    case "archived":
      where.archived = true;
      break;
    case "all":
      break;
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

export const PAGE_SIZE = 25;

export async function listProducts(
  params: ProductListParams & { page?: number; pageSize?: number },
) {
  const where = buildProductWhere(params);
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 200);
  const page = Math.max(1, params.page ?? 1);

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        category: { select: { name: true } },
        variants: {
          orderBy: { sortOrder: "asc" },
          select: {
            sortOrder: true,
            archived: true,
            sizeStocks: { select: { stock: true } },
            images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
        },
        _count: { select: { variants: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { rows, total };
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
