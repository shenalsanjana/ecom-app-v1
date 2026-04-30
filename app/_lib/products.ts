// app/_lib/products.ts
import { prisma } from "@/app/_lib/prisma";
import type { Category, Product, ProductImage, Review } from "@prisma/client";

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

export type ProductDetail = {
  product: Product & { category: Category; images: ProductImage[] };
  ratingAvg: number;
  ratingCount: number;
  related: ProductView[];
};

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      images: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!product) return null;

  const [agg, relatedRows] = await Promise.all([
    prisma.review.aggregate({
      where: { productId: id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.product.findMany({
      where: { categorySlug: product.categorySlug, id: { not: id } },
      take: 4,
      orderBy: { id: "asc" },
      select: {
        id: true, name: true, price: true, originalPrice: true,
        image: true, categorySlug: true,
      },
    }),
  ]);

  const related = await attachAggregates(relatedRows);

  return {
    product,
    ratingAvg: agg._avg.rating ?? 0,
    ratingCount: agg._count._all,
    related,
  };
}

export async function getProductReviews(
  productId: string,
  take: number,
): Promise<Review[]> {
  const safeTake = Number.isFinite(take) && take > 0 ? Math.min(Math.trunc(take), 100) : 5;
  return prisma.review.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: safeTake,
  });
}

export type ReviewHistogram = Record<1 | 2 | 3 | 4 | 5, number>;

export async function getReviewHistogram(productId: string): Promise<ReviewHistogram> {
  const rows = await prisma.review.groupBy({
    by: ["rating"],
    where: { productId },
    _count: { _all: true },
  });
  const hist: ReviewHistogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) {
    const k = r.rating as 1 | 2 | 3 | 4 | 5;
    if (k >= 1 && k <= 5) hist[k] = r._count._all;
  }
  return hist;
}
