import type { StockMode } from "./stock-policy";
// app/_lib/products.ts
import { unstable_cache } from "next/cache";

import { prisma } from "@/app/_lib/prisma";
import type { Department, Design, Prisma, Product, Review } from "@prisma/client";
import { effectivePrice, effectiveOriginalPrice, availableSizes, sortSizeStocks, buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";
import { unitsForVariant, lowStockSignal, pickBestsellers, BESTSELLER_COUNT } from "@/app/_lib/product-signals";
import { inCollections } from "@/app/_lib/product-collections";

export type ProductCardVariant = {
  id: string;
  colorSlug: string;
  color: string;
  swatchHex: string | null;
  price: number;               // effective
  originalPrice: number | null;
  cardImages: string[];        // sorted CARD urls, or this color's DETAIL fallback
  sizes: string[];             // in-stock sizes for this color
  // Display-only conversion signal, populated only by the home-page readers
  // (getFeaturedProducts / getDealsProducts) via attachAggregates'
  // `withSignals` option. Never used in pricing, cart or checkout logic.
  lowStock?: number;
};

export type ProductView = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  category: string;
  /** All storefront placements; category remains the primary breadcrumb. */
  collectionSlugs?: string[];
  /** Department name for the card eyebrow. Null only if a design somehow has no
   *  department row; the card falls back to the design name alone. */
  departmentName: string | null;
  departmentSlug: string;
  defaultColorSlug: string;
  variants: ProductCardVariant[];
  // Display-only conversion signal, populated only by the home-page readers
  // (getFeaturedProducts / getDealsProducts) via attachAggregates'
  // `withSignals` option. Never used in pricing, cart or checkout logic. This
  // is a product-level fact (unlike lowStock, which is per-colour and lives
  // on ProductCardVariant).
  badge?: "Bestseller";
};

export type DesignView = {
  slug: string;
  name: string;
  image: string | null;
};

// Shared select for every product-card list read. `satisfies` keeps the literal
// types so `ProductGetPayload` below infers the exact row shape.
const cardSelect = {
  id: true, name: true, price: true, originalPrice: true, designSlug: true, departmentSlug: true, dtfDesignId: true, stockMode: true,
  // The card eyebrow reads "Department › Design". The department name comes
  // off the relation this select already has a path to — never a second read,
  // and never getDepartments() threaded down into a card.
  design: { select: { name: true, department: { select: { name: true } } } },
  additionalCollections: { select: { designSlug: true } },
  variants: {
    where: { archived: false },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, colorSlug: true, color: true, swatchHex: true, price: true, originalPrice: true, sortOrder: true,
      images: { where: { role: { in: ["CARD", "DETAIL"] } }, orderBy: { sortOrder: "asc" }, select: { url: true, role: true } },
      sizeStocks: { where: { archived: false }, select: { size: true, plainTshirtStockId: true } },
    },
  },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

// An incomplete gallery may use its own color's other image role. Never fall
// back to another variant: that would show the wrong color to the customer.
function variantImageUrls(images: { role: string; url: string }[], role: "CARD" | "DETAIL"): string[] {
  const urlsFor = (imageRole: string) => [...new Set(
    images.filter((image) => image.role === imageRole).map((image) => image.url.trim()).filter(Boolean),
  )];
  const preferred = urlsFor(role);
  return preferred.length ? preferred : urlsFor(role === "CARD" ? "DETAIL" : "CARD");
}

// Typing fallback: `satisfies Prisma.ProductSelect` usually preserves the
// nested `orderBy: "asc"` literal via contextual typing. If tsc instead widens
// it to `string` and errors on `SortOrder`/select at Step 6, swap the const to
// `const cardSelect = Prisma.validator<Prisma.ProductSelect>()({ ...same... });`
// and keep the `ProductGetPayload<{ select: typeof cardSelect }>` line as-is.

async function attachAggregates(
  rows: ProductRow[],
  { withSignals = false }: { withSignals?: boolean } = {},
): Promise<ProductView[]> {
  // A design with no active variants can't be carded; drop it.
  const usable = rows.filter((r) => r.variants.length > 0);
  if (usable.length === 0) return [];
  const ids = usable.map((r) => r.id);
  const [grouped, plainStockRows, designStockRows, soldRows] = await Promise.all([
    prisma.review.groupBy({
      by: ["productId"],
      where: { productId: { in: ids }, approved: true },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true, inventoryProductId: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
    withSignals
      ? prisma.orderItem.groupBy({
          by: ["productId"],
          where: {
            productId: { in: ids },
            order: { paymentStatus: { in: ["PAID", "COD_COLLECTED"] } },
          },
          _sum: { quantity: true },
        })
      : Promise.resolve([] as { productId: string | null; _sum: { quantity: number | null } }[]),
  ]);
  const plainStock = buildPlainStockMap(plainStockRows);
  const designStock = buildDesignStockMap(designStockRows);
  const bestsellers = withSignals
    ? pickBestsellers(
        soldRows
          .filter((r): r is typeof r & { productId: string } => r.productId != null)
          .map((r) => ({
            productId: r.productId,
            units: r._sum.quantity ?? 0,
          })),
        BESTSELLER_COUNT,
      )
    : new Set<string>();
  const map = new Map(
    grouped.map((g) => [g.productId, { avg: g._avg.rating ?? 0, count: g._count._all }]),
  );
  return usable.map((p) => {
    const agg = map.get(p.id) ?? { avg: 0, count: 0 };
    const variants: ProductCardVariant[] = p.variants.map((v) => {
      const lowStock = withSignals
        ? lowStockSignal(
            unitsForVariant(v.sizeStocks, v.colorSlug, p.dtfDesignId, plainStock, designStock, p.stockMode),
          )
        : undefined;
      return {
        id: v.id,
        colorSlug: v.colorSlug,
        color: v.color,
        swatchHex: v.swatchHex,
        price: effectivePrice(v, p),
        originalPrice: effectiveOriginalPrice(v, p),
        cardImages: variantImageUrls(v.images, "CARD"),
        sizes: availableSizes(sortSizeStocks(v.sizeStocks), v.colorSlug, p.dtfDesignId, plainStock, designStock, p.stockMode),
        ...(lowStock != null ? { lowStock } : {}),
      };
    });
    const badge = bestsellers.has(p.id) ? ("Bestseller" as const) : undefined;
    return {
      id: p.id,
      name: p.name,
      rating: agg.avg,
      reviewCount: agg.count,
      category: p.designSlug,
      collectionSlugs: [...new Set([p.designSlug, ...(p.additionalCollections ?? []).map(link => link.designSlug)])],
      departmentName: p.design?.department?.name ?? null,
      departmentSlug: p.departmentSlug,
      defaultColorSlug: variants[0].colorSlug,
      variants,
      ...(badge ? { badge } : {}),
    };
  });
}

// Cached readers — wrapped via unstable_cache with explicit tags so future
// admin write paths can drop in revalidateTag(...) without touching this file.
// IMPORTANT: callbacks below must remain pure (no auth(), cookies(), headers());
// unstable_cache throws at runtime if those slip in.

export const getDesigns = unstable_cache(
  async (): Promise<DesignView[]> => {
    const rows = await prisma.design.findMany({ orderBy: { name: "asc" } });
    return rows.map((c) => ({ slug: c.slug, name: c.name, image: c.image }));
  },
  ["categories-list"],
  { tags: ["catalog", "categories"], revalidate: 3600 }
);

export const getFeaturedProducts = unstable_cache(
  async (limit = 8): Promise<ProductView[]> => {
    const rows = await prisma.product.findMany({
      where: { archived: false, status: "PUBLISHED" },
      orderBy: { id: "asc" },
      take: limit,
      select: cardSelect,
    });
    return attachAggregates(rows, { withSignals: true });
  },
  ["featured-products"],
  { tags: ["catalog", "featured"], revalidate: 300 }
);

export const getDealsProducts = unstable_cache(
  async (limit = 4): Promise<ProductView[]> => {
    const rows = await prisma.product.findMany({
      where: { archived: false, status: "PUBLISHED", originalPrice: { not: null } },
      orderBy: { id: "asc" },
      take: limit,
      select: cardSelect,
    });
    return attachAggregates(rows, { withSignals: true });
  },
  ["deals-products"],
  { tags: ["catalog", "deals"], revalidate: 120 }
);

export const getProductById = unstable_cache(
  async (id: string): Promise<ProductView | null> => {
    const row = await prisma.product.findUnique({
      where: { id, archived: false, status: "PUBLISHED" },
      select: cardSelect,
    });
    if (!row) return null;
    const [view] = await attachAggregates([row]);
    return view;
  },
  ["product-by-id"],
  { tags: ["catalog", "product"], revalidate: 300 }
);

export type VariantDetail = {
  id: string;
  color: string;
  colorSlug: string;
  swatchHex: string | null;
  sku: string | null;
  price: number;                       // effective
  originalPrice: number | null;        // effective
  detailImages: string[];              // sorted DETAIL urls, or this color's CARD fallback
  stockMode?: StockMode;
  dtfDesignId: string | null;
  sizeStocks: { size: string; plainTshirtStockId?: string | null }[];
};

export type ProductDetail = {
  collectionSlugs?: string[];
  // The department rides along on the design join the query already performs —
  // the breadcrumb needs its slug, name and subName, and a second read for
  // three columns would be waste. The relation is required in the schema.
  product: Product & { design: Design & { department: Department } };
  variants: VariantDetail[];
  // Raw pool rows, not Maps — Maps aren't serializable across the Server→Client
  // Component boundary. Client consumers (buy-box-client, product-jsonld isn't
  // one but shares the type) rebuild the maps via buildPlainStockMap/buildDesignStockMap.
  plainStockRows: { id: string; colorSlug: string; size: string; quantity: number; inventoryProductId?: string | null }[];
  designStockRows: { id: string; quantity: number }[];
  ratingAvg: number;
  ratingCount: number;
  related: ProductView[];
};

export const getProductDetail = unstable_cache(
  async (id: string): Promise<ProductDetail | null> => {
    const product = await prisma.product.findUnique({
      where: { id, archived: false, status: "PUBLISHED" },
      include: {
        design: { include: { department: true } },
        additionalCollections: { select: { designSlug: true } },
        variants: {
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          include: {
            images: { where: { role: { in: ["CARD", "DETAIL"] } }, orderBy: { sortOrder: "asc" } },
            sizeStocks: { where: { archived: false }, orderBy: { size: "asc" } },
          },
        },
      },
    });
    if (!product || product.variants.length === 0) return null;

    const [plainStockRows, designStockRows] = await Promise.all([
      prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true, inventoryProductId: true } }),
      prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
    ]);

    const variants: VariantDetail[] = product.variants.map((v) => ({
      id: v.id,
      color: v.color,
      colorSlug: v.colorSlug,
      swatchHex: v.swatchHex,
      sku: v.sku,
      price: effectivePrice(v, product),
      originalPrice: effectiveOriginalPrice(v, product),
      detailImages: variantImageUrls(v.images, "DETAIL"),
      dtfDesignId: product.dtfDesignId,
      stockMode: product.stockMode,
      sizeStocks: sortSizeStocks(v.sizeStocks).map((s) => ({ size: s.size, plainTshirtStockId: s.plainTshirtStockId })),
    }));

    const [agg, relatedRows] = await Promise.all([
      prisma.review.aggregate({
        where: { productId: id, approved: true },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.product.findMany({
        where: { archived: false, status: "PUBLISHED", AND: [inCollections([product.designSlug])], id: { not: id } },
        take: 4,
        orderBy: { id: "asc" },
        select: cardSelect,
      }),
    ]);

    // `product` still carries a variants relation; strip it from the returned
    // shape so the type stays Product & { design & department }.
    const { variants: _drop, ...productScalars } = product;
    void _drop;

    return {
      product: productScalars,
      collectionSlugs: [product.designSlug, ...(product.additionalCollections ?? []).map(c => c.designSlug)],
      variants,
      plainStockRows,
      designStockRows,
      ratingAvg: agg._avg.rating ?? 0,
      ratingCount: agg._count._all,
      related: await attachAggregates(relatedRows),
    };
  },
  ["product-detail"],
  { tags: ["catalog", "product"], revalidate: 300 }
);

export const getProductReviews = unstable_cache(
  async (productId: string, take: number): Promise<Review[]> => {
    const safeTake = Number.isFinite(take) && take > 0 ? Math.min(Math.trunc(take), 100) : 5;
    return prisma.review.findMany({
      where: { productId, approved: true, product: { archived: false, status: "PUBLISHED" } },
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
      where: { productId, approved: true, product: { archived: false, status: "PUBLISHED" } },
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
  designSlug?: string;
  searchQuery?: string;
  designSlugs?: string[];
  sortBy?: SortBy;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
};

export async function getProducts(opts: GetProductsOptions = {}): Promise<ProductView[]> {
  const {
    designSlug,
    searchQuery,
    designSlugs,
    sortBy = "newest",
    minPrice,
    maxPrice,
    inStockOnly = false,
  } = opts;

  const where: Prisma.ProductWhereInput = { archived: false, status: "PUBLISHED" };

  // Preserve the legacy multi-filter precedence, using EXISTS for extra links.
  const collections = designSlugs?.length ? designSlugs : designSlug ? [designSlug] : [];
  if (collections.length) where.AND = [inCollections(collections)];

  // Search query filter (name or description)
  if (searchQuery && searchQuery.trim()) {
    const searchTerm = searchQuery.trim();
    where.OR = [
      { name: { contains: searchTerm } },
      { description: { contains: searchTerm } },
    ];
  }

  // Price range filter. Filters on Product.price (the base price), not any
  // per-variant price override — acceptable for now; a future improvement
  // could filter on the min effective variant price instead.
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: Prisma.FloatFilter = {};
    if (minPrice !== undefined) priceFilter.gte = minPrice;
    if (maxPrice !== undefined) priceFilter.lte = maxPrice;
    where.price = priceFilter;
  }

  // In stock only filter moves below, after attachAggregates — quantity no
  // longer lives on the product/variant row, so it can't be a where-clause.

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
    select: cardSelect,
  });

  let views = await attachAggregates(rows);

  // attachAggregates already computed each variant's real available sizes
  // (both pools checked); "in stock" is simply "at least one variant has at
  // least one available size".
  if (inStockOnly) {
    views = views.filter((v) => v.variants.some((variant) => variant.sizes.length > 0));
  }

  // If sorting by rating, do it client-side
  if (sortBy === "rating") {
    views.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  }

  return views;
}

export async function getProductSlugRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.productSlugHistory.findUnique({ where: { oldSlug, product: { archived: false, status: "PUBLISHED" } } });
  return row?.currentId ?? null;
}

export async function searchProducts(query: string, limit = 20): Promise<ProductView[]> {
  if (!query || !query.trim()) return [];
  const searchTerm = query.trim();
  const rows = await prisma.product.findMany({
    where: {
      archived: false,
      status: "PUBLISHED",
      OR: [
        { name: { contains: searchTerm } },
        { description: { contains: searchTerm } },
      ],
    },
    take: limit,
    orderBy: { id: "asc" },
    select: cardSelect,
  });
  return attachAggregates(rows);
}

// Wishlist renders ProductCards for a set of product ids; reuse the same
// card projection + rating aggregation as every other list.
export async function getWishlistProductCards(productIds: string[]): Promise<ProductView[]> {
  if (productIds.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: productIds }, archived: false, status: "PUBLISHED" },
    select: cardSelect,
  });
  return attachAggregates(rows);
}
