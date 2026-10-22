import type { ProductView, SortBy } from "@/app/_lib/products";
import type { DepartmentView } from "@/app/_lib/taxonomy";
import type { DesignMedia } from "@/app/_lib/taxonomy-media";
import { designPath } from "@/app/_lib/taxonomy-path";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";
import { DesignTile } from "@/app/_components/home/design-tile";
import { designCountNote, designSlides, productNote } from "@/app/_components/home/design-grid";
import { SlideClock } from "@/app/_components/ui/slide-clock";
import { CatalogueBrowser } from "@/app/_components/catalogue/catalogue-browser";
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";

const ITEMS_PER_PAGE = 12;

/** The tiles sit in a fixed-width scrolling row, so their rendered width is
 *  known rather than a fraction of the viewport. */
const DESIGN_SLIDE_SIZES = "170px";

/** A department page: its products, the browse rail, and its designs as tiles
 *  above the grid — the shape a Shopify collection page uses, where the
 *  sub-collections sit over the product list rather than replacing it.
 *
 *  It used to list ONLY the design tiles, on the reasoning that a department
 *  "has no products of its own". It does: they are the products of its
 *  designs, and a shopper who picks Women expects to see clothes, not a menu.
 *  The tiles stay because browsing by design is still worth one click.
 *
 *  Sync, and handed everything it needs: the route does the reading so this
 *  can be tested by calling it, the way mobile-nav's TaxonomySection is. */
export function DepartmentBody({
  department,
  departments,
  media,
  allProducts,
  products,
  sortBy,
  currentPage,
  minPrice,
  maxPrice,
  inStockOnly,
}: {
  department: DepartmentView;
  /** Every department that holds designs — the rail lists them all, so a
   *  shopper can cross to another without going back to the home page. */
  departments: DepartmentView[];
  media: Map<string, DesignMedia>;
  /** The unfiltered catalogue, for the rail's counts. */
  allProducts: ProductView[];
  /** This department's products, already filtered and sorted. */
  products: ProductView[];
  sortBy: SortBy;
  currentPage: number;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly: boolean;
}) {
  const basePath = `/categories/${department.slug}`;

  const byDesign = countsByDesign(allProducts);
  const byDepartment = countsByDepartment(departments, allProducts);

  // Price and stock are the only things that can narrow this page — the
  // department is the page, not a filter on it, so it is never counted here.
  const activeCount =
    (minPrice !== undefined ? 1 : 0) + (maxPrice !== undefined ? 1 : 0) + (inStockOnly ? 1 : 0);

  const departmentTotal = byDepartment.get(department.slug) ?? 0;
  const countLabel =
    activeCount > 0 && products.length !== departmentTotal
      ? `${products.length} of ${departmentTotal} products`
      : `${products.length} product${products.length === 1 ? "" : "s"}`;

  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = products.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const buildLink = (page = 1) => {
    const params = new URLSearchParams();
    if (sortBy !== "newest") params.set("sort", sortBy);
    if (minPrice !== undefined) params.set("minPrice", String(minPrice));
    if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));
    if (inStockOnly) params.set("inStockOnly", "true");
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <main className="flex-1">
      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Breadcrumb items={taxonomyTrail({ department })} className="mb-4" />
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{department.name}</h1>
          {department.note && (
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{department.note}</p>
          )}
        </div>
      </section>

      <CatalogueBrowser
        departments={departments}
        byDesign={byDesign}
        byDepartment={byDepartment}
        totalCount={allProducts.length}
        selectedDepartment={department.slug}
        minPrice={minPrice}
        maxPrice={maxPrice}
        inStockOnly={inStockOnly}
        sortBy={sortBy}
        defaultSort="newest"
        action={basePath}
        allHref="/"
        clearHref={activeCount > 0 ? basePath : null}
        products={paginated}
        countLabel={countLabel}
        activeCount={activeCount}
        currentPage={currentPage}
        totalPages={totalPages}
        buildPageLink={buildLink}
        fromPath={basePath}
        aboveGrid={
          department.designs.length > 0 ? (
            <div className="mb-8">
              <div className="mb-4 flex items-baseline gap-2.5">
                {department.subName && (
                  <h2 className="font-heading text-[15px] font-semibold">{department.subName}</h2>
                )}
                <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                  {designCountNote(department.designs.length)}
                </span>
              </div>
              {/* The home page hoists one SlideClock over both taxonomy sections
                  so their tiles share a single interval. This page has one grid,
                  so the clock sits directly over it — without a provider the
                  tiles would hold on their first photo forever. */}
              {/* One scrolling row, not a wrapping grid. Women carries sixteen
                  designs: as a grid they stacked four rows deep and pushed the
                  first product most of a screen down, which is the exact thing
                  dropping the photo hero was meant to fix. A row bounds the
                  tiles to their own height and hides nothing — the rail's
                  Categories tree lists every one of them, unfolded, because
                  this is their department's own page. */}
              <SlideClock>
                <ul className="-mx-4 flex snap-x gap-3.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                  {department.designs.map((g) => (
                    <li key={g.slug} className="w-[42vw] max-w-[170px] shrink-0 snap-start sm:w-[170px]">
                      <DesignTile
                        href={designPath(department.slug, g.slug)}
                        name={g.name}
                        note={productNote(media.get(g.slug)?.count ?? 0)}
                        slides={designSlides(g, media.get(g.slug))}
                        sizes={DESIGN_SLIDE_SIZES}
                      />
                    </li>
                  ))}
                </ul>
              </SlideClock>
            </div>
          ) : null
        }
      />
    </main>
  );
}
