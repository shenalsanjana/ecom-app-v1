import { getProducts, parseSortBy } from "@/app/_lib/products";
import { getDepartments, showsNavDropdown } from "@/app/_lib/taxonomy";
import { OfferBanner } from "@/app/_components/home/offer-banner";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { DealsSection } from "@/app/_components/home/deals-section";
import { TrustStrip } from "@/app/_components/home/trust-strip";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";
import { CatalogueBrowser } from "@/app/_components/catalogue/catalogue-browser";
import { parsePrice } from "@/app/_lib/parse-price";
import { catalogueDiscount } from "@/app/_lib/catalogue-discount";

// The shop-all catalogue. It briefly lived at "/" (app/(home)/page.tsx) with
// /categories 308ing to it; it is back here, and "/" is the marketing home
// page again — the photo hero, the featured grid and the taxonomy tile
// sections that open a visit. The catalogue keeps everything it gained while
// it was the home page: the offer banner, the best-seller default order, and
// the filter rail. Deals and trust still close the page, below the grid.
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

        <DealsSection />
        <TrustStrip />
      </main>
      <SiteFooter />
    </>
  );
}
