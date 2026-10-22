import Link from "next/link";
import { getProducts, type SortBy, type ProductView } from "@/app/_lib/products";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import type { Metadata } from "next";
import { getStorefrontPromotions } from "@/app/_lib/storefront-promotion-service";
import { activePromotions, productPromotion } from "@/app/_lib/storefront-promotions";
import { PromotionBanner } from "@/app/_components/discounts/promotion-banner";

function defaultVariantOf(p: ProductView) {
  return p.variants.find((v) => v.colorSlug === p.defaultColorSlug) ?? p.variants[0];
}

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Deals",
  description: "Current offers and reduced prices at Dressing Bear. See eligibility and terms with each product.",
  alternates: { canonical: "/deals" },
};

type DealsSort = "price_asc" | "price_desc" | "discount" | "rating";

const DEALS_SORT_VALUES: readonly DealsSort[] = [
  "price_asc",
  "price_desc",
  "discount",
  "rating",
];

function parseDealsSort(value: string | undefined): DealsSort {
  return value && (DEALS_SORT_VALUES as readonly string[]).includes(value)
    ? (value as DealsSort)
    : "price_asc";
}

type DealsPageProps = {
  searchParams: Promise<{
    sort?: string;
    page?: string;
  }>;
};

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const sp = await searchParams;
  const sortBy = parseDealsSort(sp.sort);
  const currentPage = Math.max(parseInt(sp.page || "1", 10), 1);

  // getProducts only knows the SortBy union; "discount" is a deals-only sort
  // that we apply post-query below.
  const productsSort: SortBy =
    sortBy === "discount" ? "newest" : (sortBy as SortBy);
  const allProducts = await getProducts({ sortBy: productsSort });
  const snapshot = await getStorefrontPromotions();
  const offers = activePromotions(snapshot.offers, snapshot.asOf);
  const display = new Map(allProducts.map(p => {
    const v = defaultVariantOf(p);
    return [p.id, productPromotion(offers, { productId: p.id, price: v.price, originalPrice: v.originalPrice, quantity: 1, categorySlugs: p.collectionSlugs ?? [p.category] })];
  }));
  const discountFor = (p: ProductView) => {
    const d = display.get(p.id)!;
    return d.exact && d.offer ? d.offer.value / 100 : d.originalPrice && d.originalPrice > d.price ? Math.round((d.originalPrice - d.price) / d.originalPrice * 100) : 0;
  };
  const dealsProducts = allProducts.filter(p => {
    const d = display.get(p.id)!;
    return !!d.offer || (d.originalPrice !== null && d.originalPrice > d.price);
  });
  if (sortBy === "discount") {
    dealsProducts.sort((a, b) => discountFor(b) - discountFor(a));
  } else if (sortBy === "price_asc" || sortBy === "price_desc") {
    dealsProducts.sort((a, b) => (display.get(a.id)!.price - display.get(b.id)!.price) * (sortBy === "price_desc" ? -1 : 1));
  }
  const maximumDiscount = dealsProducts.reduce((max, p) => Math.max(max, discountFor(p)), 0);

  const ITEMS_PER_PAGE = 12;
  const totalPages = Math.ceil(dealsProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = dealsProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const buildPageLink = (page: number) => {
    let link = `/deals`;
    if (sortBy !== "price_asc") link += `?sort=${sortBy}`;
    if (page > 1) link += (link.includes("?") ? `&` : `?`) + `page=${page}`;
    return link;
  };

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
      {/* Hero Section */}
      <section className="border-b bg-muted">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-block rounded-full bg-brand px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-foreground">
              Current offers
            </span>
            <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Sale &amp; offers
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              Explore current offers and reduced prices. Eligibility and terms are shown with each product.
            </p>
          </div>
        </div>
      </section>
      <PromotionBanner />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Bar */}
        <div className="mb-8 rounded-lg border bg-card p-4 sm:p-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-foreground">
                {dealsProducts.length} style{dealsProducts.length !== 1 ? "s" : ""} with offers
              </span>
              {maximumDiscount > 0 && <span className="text-muted-foreground">Up to {maximumDiscount}% off original prices</span>}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <SortSelect
                value={sortBy}
                options={[
                  { value: "price_asc", label: "Price: Low to High" },
                  { value: "price_desc", label: "Price: High to Low" },
                  { value: "discount", label: "Biggest Discount" },
                  { value: "rating", label: "Highest Rated" },
                ]}
                className="rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              />
            </div>
          </div>
        </div>

        {/* Deals Grid */}
        {paginatedProducts.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <svg
                className="h-8 w-8 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              No product offers available right now
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse all products or check back for new offers.
            </p>
            <Link
              href="/categories"
              className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
            >
              Browse All Products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {paginatedProducts.map(product => <ProductCard key={product.id} product={product} fromPath="/deals" />)}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-12 flex justify-center">
            <nav className="flex items-center gap-2" aria-label="Pagination">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <Link
                    key={page}
                    href={buildPageLink(page)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border font-medium ${
                      page === currentPage
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "bg-background hover:bg-accent"
                    }`}
                  >
                    {page}
                  </Link>
                )
              )}
            </nav>
          </div>
        )}
      </div>
      </main>
      <SiteFooter />
    </>
  );
}
