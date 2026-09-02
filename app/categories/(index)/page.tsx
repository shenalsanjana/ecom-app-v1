import Link from "next/link";
import { getProducts, parseSortBy } from "@/app/_lib/products";
import { getDepartments, showsNavDropdown } from "@/app/_lib/taxonomy";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import { FilterRail } from "@/app/_components/categories/filter-rail";
import { parsePrice } from "@/app/_lib/parse-price";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Shop all categories",
  description: "Browse every category: oversize t-shirts, graphic tees, solid basics.",
};

const ITEMS_PER_PAGE = 12;

type CategoriesPageProps = {
  searchParams: Promise<{
    category?: string;
    sort?: string;
    page?: string;
    minPrice?: string;
    maxPrice?: string;
    inStockOnly?: string;
  }>;
};

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const sp = await searchParams;
  const selectedCategory = sp.category || "";
  const sortBy = parseSortBy(sp.sort, "newest");
  const currentPage = Math.max(parseInt(sp.page || "1", 10), 1);
  const minPrice = parsePrice(sp.minPrice);
  const maxPrice = parsePrice(sp.maxPrice);
  const inStockOnly = sp.inStockOnly === "true";

  const [departments, allProducts] = await Promise.all([
    getDepartments(),
    // Always fetch the full catalog (never narrowed) so the sidebar counts
    // represent the original totals and never change as filters are applied.
    getProducts({ sortBy }),
  ]);

  // `?category=<design>` predates the nested routes and is still honoured so
  // any surviving link keeps filtering rather than silently showing everything.
  const designNames = new Map(
    departments.flatMap((d) => d.designs.map((g) => [g.slug, g.name] as const)),
  );

  // Price lives on the product row and stock is derived after the read, so
  // both belong to getProducts rather than an in-memory pass here. The second
  // read is skipped entirely when nothing is being filtered.
  const isFiltered =
    Boolean(selectedCategory) || minPrice !== undefined || maxPrice !== undefined || inStockOnly;
  const displayProducts = isFiltered
    ? await getProducts({
        sortBy,
        designSlug: selectedCategory || undefined,
        minPrice,
        maxPrice,
        inStockOnly,
      })
    : allProducts;

  // Only link to departments that actually hold designs. The migration inserts
  // all four departments but seeds no designs, so on a fresh production database
  // three of them are empty — linking to them would advertise indexable
  // "Nothing here yet" pages. showsNavDropdown is the spec's derived rule.
  const linkedDepartments = departments.filter(showsNavDropdown);

  const byDesign = countsByDesign(allProducts);
  const byDepartment = countsByDepartment(linkedDepartments, byDesign);

  const totalPages = Math.ceil(displayProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = displayProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const buildLink = (over: { category?: string; page?: number } = {}) => {
    const params = new URLSearchParams();
    const category = over.category !== undefined ? over.category : selectedCategory;
    const page = over.page ?? 1;
    if (category) params.set("category", category);
    if (sortBy !== "newest") params.set("sort", sortBy);
    if (minPrice !== undefined) params.set("minPrice", String(minPrice));
    if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));
    if (inStockOnly) params.set("inStockOnly", "true");
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/categories?${qs}` : "/categories";
  };

  const heading = selectedCategory
    ? designNames.get(selectedCategory) || "Category"
    : "All products";

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Breadcrumb items={taxonomyTrail({})} className="mb-4" />
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {heading}
          </h1>
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
            {isFiltered && displayProducts.length !== allProducts.length
              ? `${displayProducts.length} of ${allProducts.length} products`
              : `${displayProducts.length} product${displayProducts.length === 1 ? "" : "s"}`}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-4">
            <aside className="lg:col-span-1">
              <div className="sticky top-24">
                <FilterRail
                  departments={linkedDepartments}
                  byDesign={byDesign}
                  byDepartment={byDepartment}
                  totalCount={allProducts.length}
                  selectedDesign={selectedCategory}
                  minPrice={minPrice}
                  maxPrice={maxPrice}
                  inStockOnly={inStockOnly}
                  sortBy={sortBy}
                  allHref={buildLink({ category: "" })}
                  clearHref={isFiltered ? "/categories" : null}
                />
              </div>
            </aside>

            <div className="lg:col-span-3">
              {paginatedProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed px-6 py-20 text-center">
                  <p className="text-base font-medium">Nothing matches these filters</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Widen the price range or clear the filters to see the full catalogue.
                  </p>
                  <Link
                    href="/categories"
                    className="mt-4 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Clear all filters
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedProducts.map((product) => (
                    <ProductCard key={product.id} product={product} fromPath="/categories" />
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="mt-12 flex justify-center">
                  <nav className="flex items-center gap-1" aria-label="Pagination">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      const here = page === currentPage;
                      return (
                        <Link
                          key={page}
                          href={buildLink({ page })}
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
