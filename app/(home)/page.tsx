import Link from "next/link";
import { getProducts, parseSortBy } from "@/app/_lib/products";
import { getDepartments, showsNavDropdown } from "@/app/_lib/taxonomy";
import { OfferBanner } from "@/app/_components/home/offer-banner";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { DealsSection } from "@/app/_components/home/deals-section";
import { TrustStrip } from "@/app/_components/home/trust-strip";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";
import { FilterRail, SORT_OPTIONS } from "@/app/_components/categories/filter-rail";
import { FilterDisclosure } from "@/app/_components/categories/filter-disclosure";
import { SortSelect } from "@/app/_components/shared/sort-select";
import { parsePrice } from "@/app/_lib/parse-price";
import { catalogueDiscount } from "@/app/_lib/catalogue-discount";

// The catalogue is the home page. This file is the former
// app/categories/(index)/page.tsx moved onto "/" with its links repointed;
// /categories now 308s here (see next.config.ts) so there is one shop-all URL,
// not two serving the same list. The marketing sections that used to open this
// page — the photo hero, the featured-products grid, and the department and
// design tile sections — are gone from it: the first three put the catalogue
// below the fold, and the last two navigate to exactly what the filter rail
// now navigates to, on the same screen. Deals and trust survive, below the
// grid, where they no longer stand between a visitor and a product.
//
// revalidate is the browse page's 3600, not the old home page's 300: this
// renders the catalogue, and the catalogue is what that hour was tuned for.
export const revalidate = 3600;

const ITEMS_PER_PAGE = 12;

// The catalogue opens on its strongest products, not its newest. This is a
// conversion page: the first screenful is the one most visitors judge the shop
// on, and "Newest" orders by when we happened to add a row. It is the default
// only — the sort control still offers Newest, and picking it puts ?sort=newest
// in the URL. Anything reading a sort must use this rather than a literal,
// including the "is this the default?" checks that decide whether the value is
// worth serialising into a link.
const DEFAULT_SORT = "rating";

type HomePageProps = {
  searchParams: Promise<{
    category?: string;
    sort?: string;
    page?: string;
    minPrice?: string;
    maxPrice?: string;
    inStockOnly?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const sp = await searchParams;
  const selectedCategory = sp.category || "";
  const sortBy = parseSortBy(sp.sort, DEFAULT_SORT);
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

  // Off the full catalogue, never the filtered list: the banner advertises the
  // shop, so narrowing to one design must not shrink the headline discount.
  const offer = catalogueDiscount(allProducts);

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
    if (sortBy !== DEFAULT_SORT) params.set("sort", sortBy);
    if (minPrice !== undefined) params.set("minPrice", String(minPrice));
    if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));
    if (inStockOnly) params.set("inStockOnly", "true");
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  // Shown on the collapsed Filters button, so a narrowed list is never a
  // mystery on a phone. Sort is not counted: it reorders, it never hides.
  const activeCount =
    (selectedCategory ? 1 : 0) +
    (minPrice !== undefined ? 1 : 0) +
    (maxPrice !== undefined ? 1 : 0) +
    (inStockOnly ? 1 : 0);

  const heading = selectedCategory
    ? designNames.get(selectedCategory) || "Category"
    : "The whole rack";

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <OfferBanner
          heading={heading}
          offer={offer}
          blurb={
            selectedCategory
              ? null
              : "Oversize graphic tees and heavyweight basics, cut for the drape you actually wear."
          }
        />

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Sits above the grid rather than up in the band because it
              describes the grid: it is the filter's answer, and it moves. */}
          <p className="text-sm tabular-nums text-muted-foreground">
            {isFiltered && displayProducts.length !== allProducts.length
              ? `${displayProducts.length} of ${allProducts.length} products`
              : `${displayProducts.length} product${displayProducts.length === 1 ? "" : "s"}`}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-4">
            <aside className="lg:col-span-1">
              <div className="sticky top-24">
                <FilterDisclosure
                  activeCount={activeCount}
                  sort={
                    <SortSelect
                      value={sortBy}
                      options={SORT_OPTIONS}
                      className="rounded-lg border bg-background py-2 pl-3 pr-8 text-sm focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  }
                >
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
                    defaultSort={DEFAULT_SORT}
                    allHref={buildLink({ category: "" })}
                    clearHref={isFiltered ? "/" : null}
                  />
                </FilterDisclosure>
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
                    href="/"
                    className="mt-4 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Clear all filters
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedProducts.map((product) => (
                    <ProductCard key={product.id} product={product} fromPath="/" />
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

        <DealsSection />
        <TrustStrip />
      </main>
      <SiteFooter />
    </>
  );
}
