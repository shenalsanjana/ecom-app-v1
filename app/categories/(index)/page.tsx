import Link from "next/link";
import { getProducts, parseSortBy } from "@/app/_lib/products";
import { getDepartments, showsNavDropdown } from "@/app/_lib/taxonomy";
import { inkFor } from "@/app/_lib/taxonomy-tint";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import { FilterTree } from "@/app/_components/categories/filter-tree";
import type { Metadata } from "next";

export const revalidate = 3600;

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

  const [departments, allProducts] = await Promise.all([
    getDepartments(),
    // Always fetch the full catalog (never design-filtered) so the sidebar
    // counts represent the original totals and never change when a department
    // is selected. Selecting a design only narrows the displayed list below.
    getProducts({ sortBy }),
  ]);

  // `?category=<design>` predates the nested routes and is still honoured so
  // any surviving link keeps filtering rather than silently showing everything.
  const designNames = new Map(
    departments.flatMap((d) => d.designs.map((g) => [g.slug, g.name] as const)),
  );
  const displayProducts = selectedCategory
    ? allProducts.filter((p) => p.category === selectedCategory)
    : allProducts;

  // Only link to departments that actually hold designs. The migration inserts
  // all four departments but seeds no designs, so on a fresh production database
  // three of them are empty — linking to them would advertise indexable
  // "Nothing here yet" pages. showsNavDropdown is the spec's derived rule.
  const linkedDepartments = departments.filter(showsNavDropdown);

  const byDesign = countsByDesign(allProducts);
  const byDepartment = countsByDepartment(linkedDepartments, byDesign);

  const ITEMS_PER_PAGE = 12;
  const totalPages = Math.ceil(displayProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = displayProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const buildPageLink = (page: number) => {
    const params = new URLSearchParams();
    if (selectedCategory) params.set("category", selectedCategory);
    if (sortBy !== "newest") params.set("sort", sortBy);
    if (page > 1) params.set("page", page.toString());
    const qs = params.toString();
    return qs ? `/categories?${qs}` : "/categories";
  };

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
      {/* Hero / Departments Section */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Breadcrumb items={taxonomyTrail({})} className="mb-4" />
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {selectedCategory
              ? designNames.get(selectedCategory) || "Category"
              : "Shop All Categories"}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            {selectedCategory
              ? `Browse our collection of ${displayProducts.length} ${
                  designNames.get(selectedCategory) || selectedCategory
                } items`
              : "Discover premium oversize t-shirts. Find your perfect fit from our curated collection."}
          </p>

          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {linkedDepartments.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/categories/${d.slug}`}
                  className="flex aspect-[4/3] items-end rounded-xl p-4 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  style={{ backgroundColor: d.hex, color: inkFor(d.hex) }}
                >
                  <span className="font-heading text-lg font-semibold tracking-tight">{d.tileName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Sidebar - Departments */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24">
              <FilterTree
                departments={linkedDepartments}
                byDesign={byDesign}
                byDepartment={byDepartment}
                totalCount={allProducts.length}
                selectedDesign={selectedCategory}
              />

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
                Showing {paginatedProducts.length} of {displayProducts.length} products
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} fromPath="/categories" />
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
