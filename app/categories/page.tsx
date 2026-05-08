import Link from "next/link";
import { getCategories, getProducts, parseSortBy } from "@/app/_lib/products";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop all categories",
  description: "Browse every category: oversize t-shirts, graphic tees, solid basics.",
};

type CategoriesPageProps = {
  searchParams: Promise<{
    category?: string;
    sort?: string;
    page?: string;
  }>;
};

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const sp = await searchParams;
  const selectedCategory = sp.category || "";
  const sortBy = parseSortBy(sp.sort, "newest");
  const currentPage = Math.max(parseInt(sp.page || "1", 10), 1);

  const [categories, allProducts] = await Promise.all([
    getCategories(),
    getProducts({
      categorySlug: selectedCategory || undefined,
      sortBy,
    }),
  ]);

  const ITEMS_PER_PAGE = 12;
  const totalPages = Math.ceil(allProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = allProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const buildCategoryLink = (catSlug: string) => `/categories?category=${catSlug}${sortBy !== "newest" ? `&sort=${sortBy}` : ""}`;
  const buildPageLink = (page: number) => {
    let base = selectedCategory ? `/categories?category=${selectedCategory}` : "/categories";
    if (sortBy !== "newest") base += `&sort=${sortBy}`;
    if (page > 1) base += `&page=${page}`;
    return base;
  };

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
      {/* Hero / Categories Section */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {selectedCategory
              ? categories.find((c) => c.slug === selectedCategory)?.name || "Category"
              : "Shop All Categories"}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            {selectedCategory
              ? `Browse our collection of ${allProducts.length} ${selectedCategory
                  .split("-")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ")} items`
              : "Discover premium oversize t-shirts. Find your perfect fit from our curated collection."}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Sidebar - Categories */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Categories
              </h2>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/categories"
                    className={`block rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                      !selectedCategory
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "bg-background hover:bg-accent text-foreground"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span>All Categories</span>
                      <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs font-normal">
                        {allProducts.length}
                      </span>
                    </span>
                  </Link>
                </li>
                {categories.map((cat) => {
                  const catProducts = allProducts.filter(
                    (p) => p.category === cat.slug
                  ).length;
                  return (
                    <li key={cat.slug}>
                      <Link
                        href={buildCategoryLink(cat.slug)}
                        className={`block rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                          selectedCategory === cat.slug
                            ? "bg-primary text-primary-foreground shadow-lg"
                            : "bg-background hover:bg-accent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span>{cat.name}</span>
                          <span className="rounded-full bg-primary-foreground/10 px-2 py-0.5 text-xs font-normal">
                            {catProducts}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* Sort */}
              <div className="mt-8">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Sort By
                </h2>
                <SortSelect
                  value={sortBy}
                  options={[
                    { value: "newest", label: "Featured" },
                    { value: "name", label: "Name (A-Z)" },
                    { value: "price_asc", label: "Price: Low to High" },
                    { value: "price_desc", label: "Price: High to Low" },
                    { value: "rating", label: "Customer Rating" },
                  ]}
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                />
              </div>
            </div>
          </aside>

          {/* Product Grid */}
          <div className="lg:col-span-3">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {paginatedProducts.length} of {allProducts.length} products
              </p>
            </div>

            {paginatedProducts.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-lg text-muted-foreground">
                  No products found in this category.
                </p>
                <Link
                  href="/categories"
                  className="mt-4 inline-block text-primary hover:underline"
                >
                  Browse all categories
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
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
                    fromPath="/categories"
                  />
                ))}
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
        </div>
      </div>
      </main>
      <SiteFooter />
    </>
  );
}
