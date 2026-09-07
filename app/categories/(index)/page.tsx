import { getProducts, parseSortBy } from "@/app/_lib/products";
import { getDepartments, showsNavDropdown } from "@/app/_lib/taxonomy";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";
import { CatalogueBrowser } from "@/app/_components/catalogue/catalogue-browser";
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";
import { parsePrice } from "@/app/_lib/parse-price";

// The shop-all catalogue: a breadcrumb, a heading, and the browse layout.
// Nothing else. The offer banner, the deals band and the trust strip that used
// to wrap it are gone from this page — they are marketing, and this is where
// someone who already wants to browse arrives. "/" still carries all three, so
// none of them were lost, they were only taken off the list.
//
// The heading is this page's own <h1> now that the banner is not here to hold
// one, and it is a plain heading in the band every department page uses, so
// the shop-all list and a department read as the same kind of page.
//
// revalidate is this page's own 3600, an hour tuned for a catalogue that
// changes when stock does, not the home page's 300.
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

type CataloguePageProps = {
  searchParams: Promise<{
    category?: string;
    sort?: string;
    page?: string;
    minPrice?: string;
    maxPrice?: string;
    inStockOnly?: string;
  }>;
};

export default async function CataloguePage({ searchParams }: CataloguePageProps) {
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
    return qs ? `/categories?${qs}` : "/categories";
  };

  // Shown on the collapsed Filters button, so a narrowed list is never a
  // mystery on a phone. Sort is not counted: it reorders, it never hides.
  const activeCount =
    (selectedCategory ? 1 : 0) +
    (minPrice !== undefined ? 1 : 0) +
    (maxPrice !== undefined ? 1 : 0) +
    (inStockOnly ? 1 : 0);

  const countLabel =
    isFiltered && displayProducts.length !== allProducts.length
      ? `${displayProducts.length} of ${allProducts.length} products`
      : `${displayProducts.length} product${displayProducts.length === 1 ? "" : "s"}`;

  // Named for the link that gets you here, so the nav item, the last crumb and
  // the heading are one word for one place. A filter renames it to the design
  // being shown: the page is no longer all of anything.
  const heading = selectedCategory
    ? designNames.get(selectedCategory) || "Category"
    : "Shop All";

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* The same band a department page opens with — same ground, same
            type scale, breadcrumb over heading — because they are the same
            kind of page and should not look like two. */}
        <section className="border-b bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <Breadcrumb items={taxonomyTrail({})} className="mb-4" />
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {heading}
            </h1>
          </div>
        </section>

        <CatalogueBrowser
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
          action="/categories"
          allHref={buildLink({ category: "" })}
          clearHref={isFiltered ? "/categories" : null}
          products={paginatedProducts}
          countLabel={countLabel}
          activeCount={activeCount}
          currentPage={currentPage}
          totalPages={totalPages}
          buildPageLink={(page) => buildLink({ page })}
          fromPath="/categories"
        />
      </main>
      <SiteFooter />
    </>
  );
}
