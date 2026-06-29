// app/_lib/products.ts
import { unstable_cache } from "next/cache";

import { prisma } from "@/app/_lib/prisma";
import type { Category, Prisma, Product, ProductImage, Review } from "@prisma/client";

export type ProductView = {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  image: string;
  rating: number;
  reviewCount: number;
  category: string;
  sizes: string;
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
  sizes: string;
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
      sizes: p.sizes,
    };
  });
}

// Cached readers — wrapped via unstable_cache with explicit tags so future
// admin write paths can drop in revalidateTag(...) without touching this file.
// IMPORTANT: callbacks below must remain pure (no auth(), cookies(), headers());
// unstable_cache throws at runtime if those slip in.

export const getCategories = unstable_cache(
  async (): Promise<CategoryView[]> => {
    const rows = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return rows.map((c) => ({ slug: c.slug, name: c.name, image: c.image }));
  },
  ["categories-list"],
  { tags: ["catalog", "categories"], revalidate: 3600 }
);

export const getFeaturedProducts = unstable_cache(
  async (limit = 8): Promise<ProductView[]> => {
    const rows = await prisma.product.findMany({
      where: { archived: false },
      orderBy: { id: "asc" },
      take: limit,
      select: {
        id: true, name: true, price: true, originalPrice: true,
        image: true, categorySlug: true, sizes: true,
      },
    });
    return attachAggregates(rows);
  },
  ["featured-products"],
  { tags: ["catalog", "featured"], revalidate: 300 }
);

export const getDealsProducts = unstable_cache(
  async (limit = 4): Promise<ProductView[]> => {
    const rows = await prisma.product.findMany({
      where: { archived: false, originalPrice: { not: null } },
      orderBy: { id: "asc" },
      take: limit,
      select: {
        id: true, name: true, price: true, originalPrice: true,
        image: true, categorySlug: true, sizes: true,
      },
    });
    return attachAggregates(rows);
  },
  ["deals-products"],
  { tags: ["catalog", "deals"], revalidate: 120 }
);

export const getProductById = unstable_cache(
  async (id: string): Promise<ProductView | null> => {
    const row = await prisma.product.findUnique({
      where: { id, archived: false },
      select: {
        id: true, name: true, price: true, originalPrice: true,
        image: true, categorySlug: true, sizes: true,
      },
    });
    if (!row) return null;
    const [view] = await attachAggregates([row]);
    return view;
  },
  ["product-by-id"],
  { tags: ["catalog", "product"], revalidate: 300 }
);

export type ProductDetail = {
  product: Product & { category: Category; images: ProductImage[] };
  ratingAvg: number;
  ratingCount: number;
  related: ProductView[];
};

export const getProductDetail = unstable_cache(
  async (id: string): Promise<ProductDetail | null> => {
    const product = await prisma.product.findUnique({
      where: { id, archived: false },
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
        where: { archived: false, categorySlug: product.categorySlug, id: { not: id } },
        take: 4,
        orderBy: { id: "asc" },
        select: {
          id: true, name: true, price: true, originalPrice: true,
          image: true, categorySlug: true, sizes: true,
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
  },
  ["product-detail"],
  { tags: ["catalog", "product"], revalidate: 300 }
);

export const getProductReviews = unstable_cache(
  async (productId: string, take: number): Promise<Review[]> => {
    const safeTake = Number.isFinite(take) && take > 0 ? Math.min(Math.trunc(take), 100) : 5;
    return prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      take: safeTake,
    });
  },
  ["product-reviews"],
  { tags: ["catalog", "product"], revalidate: 300 }
);

export type ReviewHistogram = Record<1 | 2 | 3 | 4 | 5, number>;

export const getReviewHistogram = unstable_cache(
  async (productId: string): Promise<ReviewHistogram> => {
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
  },
  ["review-histogram"],
  { tags: ["catalog", "product"], revalidate: 300 }
);

export type SortBy = "name" | "price_asc" | "price_desc" | "rating" | "newest";

const SORT_VALUES: readonly SortBy[] = [
  "name",
  "price_asc",
  "price_desc",
  "rating",
  "newest",
];

export function parseSortBy(value: string | undefined, fallback: SortBy = "newest"): SortBy {
  return value && (SORT_VALUES as readonly string[]).includes(value)
    ? (value as SortBy)
    : fallback;
}

export type GetProductsOptions = {
  categorySlug?: string;
  searchQuery?: string;
  categorySlugs?: string[];
  sortBy?: SortBy;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
};

export async function getProducts(opts: GetProductsOptions = {}): Promise<ProductView[]> {
  const {
    categorySlug,
    searchQuery,
    categorySlugs,
    sortBy = "newest",
    minPrice,
    maxPrice,
    inStockOnly = false,
  } = opts;

  const where: Prisma.ProductWhereInput = { archived: false };

  // Category filter
  if (categorySlug) {
    where.categorySlug = categorySlug;
  }
  if (categorySlugs && categorySlugs.length > 0) {
    where.categorySlug = { in: categorySlugs };
  }

  // Search query filter (name or description)
  if (searchQuery && searchQuery.trim()) {
    const searchTerm = searchQuery.trim();
    where.OR = [
      { name: { contains: searchTerm } },
      { description: { contains: searchTerm } },
    ];
  }

  // Price range filter
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: Prisma.FloatFilter = {};
    if (minPrice !== undefined) priceFilter.gte = minPrice;
    if (maxPrice !== undefined) priceFilter.lte = maxPrice;
    where.price = priceFilter;
  }

  // In stock only filter
  if (inStockOnly) {
    where.stock = { gt: 0 };
  }

  // Sort order
  let orderBy: Prisma.ProductOrderByWithRelationInput;
  switch (sortBy) {
    case "name":
      orderBy = { name: "asc" };
      break;
    case "price_asc":
      orderBy = { price: "asc" };
      break;
    case "price_desc":
      orderBy = { price: "desc" };
      break;
    case "rating":
      // Can't sort by rating directly, will sort post-query
      orderBy = { id: "asc" };
      break;
    case "newest":
    default:
      orderBy = { id: "asc" };
      break;
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy,
    select: {
      id: true, name: true, price: true, originalPrice: true,
      image: true, categorySlug: true, sizes: true,
    },
  });

  const views = await attachAggregates(rows);

  // If sorting by rating, do it client-side
  if (sortBy === "rating") {
    views.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  }

  return views;
}

export async function getCategorySlugRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.categorySlugHistory.findUnique({ where: { oldSlug } });
  return row?.currentSlug ?? null;
}

export async function getProductSlugRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.productSlugHistory.findUnique({ where: { oldSlug } });
  return row?.currentId ?? null;
}

export async function searchProducts(query: string, limit = 20): Promise<ProductView[]> {
  if (!query || !query.trim()) return [];
  const searchTerm = query.trim();
  const rows = await prisma.product.findMany({
    where: {
      archived: false,
      OR: [
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
      ],
    },
    take: limit,
    orderBy: { id: "asc" },
    select: {
      id: true, name: true, price: true, originalPrice: true,
      image: true, categorySlug: true, sizes: true,
    },
  });
  return attachAggregates(rows);
}
