// app/_lib/products.ts
import { prisma } from "@/app/_lib/prisma";

export type ProductView = {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  image: string;
  rating: number;
  reviewCount: number;
  category: string;
};

export type CategoryView = {
  slug: string;
  name: string;
  image: string;
};

type ProductRow = {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  image: string;
  categorySlug: string;
};

async function attachAggregates(rows: ProductRow[]): Promise<ProductView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const grouped = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: ids } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const map = new Map(
    grouped.map((g) => [g.productId, { avg: g._avg.rating ?? 0, count: g._count._all }]),
  );
  return rows.map((p) => {
    const agg = map.get(p.id) ?? { avg: 0, count: 0 };
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      originalPrice: p.originalPrice ?? null,
      image: p.image,
      rating: agg.avg,
      reviewCount: agg.count,
      category: p.categorySlug,
    };
  });
}

export async function getCategories(): Promise<CategoryView[]> {
  const rows = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return rows.map((c) => ({ slug: c.slug, name: c.name, image: c.image }));
}

export async function getFeaturedProducts(limit = 8): Promise<ProductView[]> {
  const rows = await prisma.product.findMany({
    where: { id: { startsWith: "p" } },
    orderBy: { id: "asc" },
    take: limit,
    select: {
      id: true, name: true, price: true, originalPrice: true,
      image: true, categorySlug: true,
    },
  });
  return attachAggregates(rows);
}

export async function getDealsProducts(limit = 4): Promise<ProductView[]> {
  const rows = await prisma.product.findMany({
    where: { originalPrice: { not: null } },
    orderBy: { id: "asc" },
    take: limit,
    select: {
      id: true, name: true, price: true, originalPrice: true,
      image: true, categorySlug: true,
    },
  });
  return attachAggregates(rows);
}

export async function getProductById(id: string): Promise<ProductView | null> {
  const row = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true, name: true, price: true, originalPrice: true,
      image: true, categorySlug: true,
    },
  });
  if (!row) return null;
  const [view] = await attachAggregates([row]);
  return view;
}
