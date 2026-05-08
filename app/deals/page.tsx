import Link from "next/link";
import { getProducts, type SortBy } from "@/app/_lib/products";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deals",
  description: "Limited-time deals on premium oversize t-shirts.",
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

  const dealsProducts = allProducts.filter((p) => p.originalPrice !== null);
  if (sortBy === "discount") {
    dealsProducts.sort((a, b) => {
      const da = a.originalPrice ? (a.originalPrice - a.price) / a.originalPrice : 0;
      const db = b.originalPrice ? (b.originalPrice - b.price) / b.originalPrice : 0;
      return db - da;
    });
  }

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
              Limited Time
            </span>
            <h1 className="mt-4 font-heading text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
              Deals of the Day
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              Don&apos;t miss out on these limited-time savings. Premium oversize t-shirts at unbeatable prices.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Bar */}
        <div className="mb-8 rounded-lg border bg-card p-4 sm:p-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-foreground">
                {dealsProducts.length} Deal{dealsProducts.length !== 1 ? "s" : ""} Found
              </span>
              <span className="hidden sm:block text-muted-foreground">|</span>
              <span className="text-muted-foreground">
                Up to{" "}
                {(() => {
                  const maxDiscount = dealsProducts.reduce((max, p) => {
                    if (p.originalPrice) {
                      const discount = Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100);
                      return Math.max(max, discount);
                    }
                    return max;
                  }, 0);
                  return `${maxDiscount}% off`;
                })()}
              </span>
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
              No deals available right now
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check back soon for new limited-time offers
            </p>
            <Link
              href="/categories"
              className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
            >
              Browse All Products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedProducts.map((product) => {
              const discount =
                product.originalPrice && product.originalPrice > product.price
                  ? Math.round(
                      ((product.originalPrice - product.price) / product.originalPrice) *
                        100
                    )
                  : 0;

              return (
                <div key={product.id} className="group relative">
                  {/* Discount Badge */}
                  {discount > 0 && (
                    <div className="absolute left-2 top-2 z-10 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-foreground shadow-lg">
                      -{discount}%
                    </div>
                  )}
                  <ProductCard
                    id={product.id}
                    name={product.name}
                    price={product.price}
                    originalPrice={product.originalPrice}
                    image={product.image}
                    rating={product.rating}
                    reviewCount={product.reviewCount}
                    sizes={product.sizes}
                    wishlisted={false}
                    fromPath="/deals"
                  />
                </div>
              );
            })}
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
