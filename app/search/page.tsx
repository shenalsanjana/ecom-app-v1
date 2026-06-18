import Link from "next/link";
import { Search } from "lucide-react";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import { getCategories, getProducts, parseSortBy } from "@/app/_lib/products";
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
  const categorySlug = sp.category || "";
  const currentPage = Math.max(parseInt(sp.page || "1", 10), 1);
  const sortBy = parseSortBy(sp.sort, "newest");
  const minPrice = sp.minPrice ? parseFloat(sp.minPrice) : undefined;
  const maxPrice = sp.maxPrice ? parseFloat(sp.maxPrice) : undefined;
  const inStockOnly = sp.inStockOnly === "true";

  const [products, categories] = await Promise.all([
    getProducts({
      categorySlug: categorySlug || undefined,
      searchQuery: query || undefined,
      sortBy,
      minPrice,
      maxPrice,
      inStockOnly,
    }),
    getCategories(),
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
              : categorySlug
              ? `Products in category`
              : "All products"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {products.length} product{products.length !== 1 ? "s" : ""} found
          </p>
        </div>

        {/* Filters sidebar + results grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Sidebar filters */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* Price filter */}
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">
                  Price Range
                </h3>
                <div className="flex gap-2">
                  <input
                    type="number"
                    name="minPrice"
                    placeholder="Min"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue={minPrice || ""}
                  />
                  <input
                    type="number"
                    name="maxPrice"
                    placeholder="Max"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    defaultValue={maxPrice || ""}
                  />
                </div>
              </div>

              {/* Category filter */}
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">
                  Categories
                </h3>
                <ul className="space-y-1">
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
                      className={`block rounded px-3 py-2 text-sm ${
                        !categorySlug
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      All Categories
                      <span className="ml-1 text-xs opacity-60">
                        ({products.length})
                      </span>
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
                        className={`block rounded px-3 py-2 text-sm ${
                          categorySlug === cat.slug
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {cat.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Stock filter */}
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">
                  Availability
                </h3>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="inStockOnly"
                    defaultChecked={inStockOnly}
                    className="rounded border-input text-primary focus:ring-ring"
                  />
                  <span>In stock only</span>
                </label>
              </div>

              {/* Sort */}
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">
                  Sort By
                </h3>
                <SortSelect
                  value={sortBy}
                  options={[
                    { value: "newest", label: "Newest" },
                    { value: "name", label: "Name (A-Z)" },
                    { value: "price_asc", label: "Price (Low to High)" },
                    { value: "price_desc", label: "Price (High to Low)" },
                    { value: "rating", label: "Rating" },
                  ]}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </aside>

          {/* Results grid */}
          <div className="lg:col-span-3">
            {paginatedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
                <Search className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium text-muted-foreground">
                  No products found
                </p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {paginatedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    price={product.price}
                    originalPrice={product.originalPrice}
                    image={product.image}
                    rating={product.rating}
                    reviewCount={product.reviewCount}
                    sizes={product.sizes}
                    fromPath="/search"
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <nav className="flex items-center gap-2" aria-label="Pagination">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => (
                      <Link
                        key={page}
                        href={buildSearchLink({
                          query,
                          category: categorySlug,
                          sortBy,
                          minPrice,
                          maxPrice,
                          inStockOnly,
                          page,
                        })}
                        className={`flex h-10 w-10 items-center justify-center rounded-md border ${
                          page === currentPage
                            ? "bg-primary text-primary-foreground"
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
