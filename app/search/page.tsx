import Link from "next/link";
import { Search } from "lucide-react";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import {
  ApplyFilters,
  FILTER_COUNT,
  FILTER_HEADING,
  FILTER_ROW,
  FILTER_ROW_ACTIVE,
  FILTER_ROW_IDLE,
  InStockField,
  PriceRangeFields,
} from "@/app/_components/shared/filter-fields";
import { getDesigns, getProducts, parseSortBy } from "@/app/_lib/products";
import { parsePrice } from "@/app/_lib/parse-price";
import type { Metadata } from "next";

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ q?: string }> },
): Promise<Metadata> {
  const sp = await searchParams;
  const q = sp.q?.trim();
  return {
    title: q ? `"${q}" — search` : "Search",
    description: q
      ? `Search results for "${q}" at Dressing Bear.`
      : "Search products at Dressing Bear.",
    robots: { index: false, follow: true },
  };
}

const ITEMS_PER_PAGE = 12;

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
    sort?: string;
    minPrice?: string;
    maxPrice?: string;
    inStockOnly?: string;
  }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const sp = await searchParams;
  const query = sp.q?.trim() || "";
  const designSlug = sp.category || "";
  const currentPage = Math.max(parseInt(sp.page || "1", 10), 1);
  const sortBy = parseSortBy(sp.sort, "newest");
  const minPrice = parsePrice(sp.minPrice);
  const maxPrice = parsePrice(sp.maxPrice);
  const inStockOnly = sp.inStockOnly === "true";
  // The search term itself is not a filter — clearing the filters keeps what
  // you searched for and only drops what you narrowed it by.
  const isFiltered =
    Boolean(designSlug) || minPrice !== undefined || maxPrice !== undefined || inStockOnly;

  const [products, categories] = await Promise.all([
    getProducts({
      designSlug: designSlug || undefined,
      searchQuery: query || undefined,
      sortBy,
      minPrice,
      maxPrice,
      inStockOnly,
    }),
    getDesigns(),
  ]);

  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = products.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Search results header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {query
              ? `Search results for "${query}"`
              : designSlug
              ? `Products in category`
              : "All products"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {products.length} product{products.length !== 1 ? "s" : ""} found
          </p>
        </div>

        {/* Filters sidebar + results grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Sidebar filters. Price and stock post a plain GET back to /search,
              so they filter with or without JavaScript; the category rows are
              links and navigate on their own, and sort sits outside the form
              because SortSelect pushes the URL itself. */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              <form action="/search" className="space-y-6">
                {/* Carried so applying a price never drops the search term,
                    the category or the order. Paging restarts by simply not
                    being sent. */}
                {query && <input type="hidden" name="q" value={query} />}
                {designSlug && <input type="hidden" name="category" value={designSlug} />}
                {sortBy !== "newest" && <input type="hidden" name="sort" value={sortBy} />}

                <PriceRangeFields minPrice={minPrice} maxPrice={maxPrice} />

                <div>
                  <h2 className={FILTER_HEADING}>Categories</h2>
                  <ul>
                    <li>
                      <Link
                        href={buildSearchLink({
                          query,
                          category: "",
                          sortBy,
                          minPrice,
                          maxPrice,
                          inStockOnly,
                          page: 1,
                        })}
                        className={`${FILTER_ROW} ${!designSlug ? FILTER_ROW_ACTIVE : FILTER_ROW_IDLE}`}
                      >
                        <span>All products</span>
                        <span className={FILTER_COUNT}>{products.length}</span>
                      </Link>
                    </li>
                    {categories.map((cat) => (
                      <li key={cat.slug}>
                        <Link
                          href={buildSearchLink({
                            query,
                            category: cat.slug,
                            sortBy,
                            minPrice,
                            maxPrice,
                            inStockOnly,
                            page: 1,
                          })}
                          className={`${FILTER_ROW} ${
                            designSlug === cat.slug ? FILTER_ROW_ACTIVE : FILTER_ROW_IDLE
                          }`}
                        >
                          <span>{cat.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <InStockField inStockOnly={inStockOnly} />

                <ApplyFilters
                  clearHref={
                    isFiltered
                      ? buildSearchLink({ query, category: "", sortBy, page: 1 })
                      : null
                  }
                />
              </form>

              <div>
                <h2 className={FILTER_HEADING}>Sort by</h2>
                <SortSelect
                  value={sortBy}
                  options={[
                    { value: "newest", label: "Newest" },
                    { value: "name", label: "Name (A–Z)" },
                    { value: "price_asc", label: "Price: low to high" },
                    { value: "price_desc", label: "Price: high to low" },
                    { value: "rating", label: "Customer rating" },
                  ]}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>
          </aside>

          {/* Results grid */}
          <div className="lg:col-span-3">
            {paginatedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-20 text-center">
                <Search className="mb-4 h-10 w-10 text-muted-foreground" />
                <p className="text-base font-medium">
                  {isFiltered ? "Nothing matches these filters" : "Nothing matches that search"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isFiltered
                    ? "Widen the price range or clear the filters to see more."
                    : "Try a shorter term, or browse the departments in the menu."}
                </p>
                {isFiltered && (
                  <Link
                    href={buildSearchLink({ query, category: "", sortBy, page: 1 })}
                    className="mt-4 text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Clear all filters
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} fromPath="/search" />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <nav className="flex items-center gap-1" aria-label="Pagination">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    const here = page === currentPage;
                    return (
                      <Link
                        key={page}
                        href={buildSearchLink({
                          query,
                          category: designSlug,
                          sortBy,
                          minPrice,
                          maxPrice,
                          inStockOnly,
                          page,
                        })}
                        {...(here ? { "aria-current": "page" as const } : {})}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border-b-2 text-sm tabular-nums transition-colors duration-(--duration-fast) ${
                          here
                            ? "border-brand bg-secondary font-medium text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        }`}
                      >
                        {page}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>
        </div>
      </div>
      </main>
      <SiteFooter />
    </>
  );
}

function buildSearchLink(params: {
  query?: string;
  category?: string;
  sortBy?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  page?: number;
}) {
  const sp = new URLSearchParams();
  if (params.query) sp.set("q", params.query);
  if (params.category) sp.set("category", params.category);
  if (params.sortBy) sp.set("sort", params.sortBy);
  if (params.minPrice !== undefined) sp.set("minPrice", params.minPrice.toString());
  if (params.maxPrice !== undefined) sp.set("maxPrice", params.maxPrice.toString());
  if (params.inStockOnly) sp.set("inStockOnly", "true");
  if (params.page && params.page > 1) sp.set("page", params.page.toString());

  const queryString = sp.toString();
  return `/search${queryString ? `?${queryString}` : ""}`;
}
