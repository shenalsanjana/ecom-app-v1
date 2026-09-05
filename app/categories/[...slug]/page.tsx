import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { getProducts, parseSortBy, type ProductView, type SortBy } from "@/app/_lib/products";
import {
  getDepartments,
  getDepartmentSlugRedirect,
  getDesignPathRedirect,
  type DepartmentView,
  type DesignSummary,
} from "@/app/_lib/taxonomy";
import { designPath } from "@/app/_lib/taxonomy-path";
import { resolveCategorySegments } from "@/app/_lib/taxonomy-lookup";
import type { Resolution } from "@/app/_lib/taxonomy-route";
import { getDesignMedia, type DesignMedia } from "@/app/_lib/taxonomy-media";
import { ProductCard } from "@/app/_components/home/product-card";
import { DesignTile } from "@/app/_components/home/design-tile";
import { designCountNote, designSlides, productNote } from "@/app/_components/home/design-grid";
import { SlideClock } from "@/app/_components/ui/slide-clock";
import { FILTER_HEADING } from "@/app/_components/shared/filter-fields";
import { CatalogueBrowser } from "@/app/_components/catalogue/catalogue-browser";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";
import { showsNavDropdown } from "@/app/_lib/taxonomy";
import { parsePrice } from "@/app/_lib/parse-price";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";
import { TrackCategoryView } from "@/app/_components/analytics/track-category-view";
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";
import type { Metadata } from "next";

export const revalidate = 300;

const SORT_OPTIONS = [
  { value: "newest", label: "Featured" },
  { value: "name", label: "Name (A-Z)" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Customer Rating" },
];

const ITEMS_PER_PAGE = 12;

/**
 * Resolves the catch-all segments and returns the departments alongside, so
 * neither caller has to read them twice to look a name up.
 *
 * The pre-resolution logic itself lives in `app/_lib/taxonomy-lookup.ts`, kept
 * out of this page module so it is unit-testable without a database. The two
 * history readers are injected here — that is the only Prisma-aware part.
 */
async function resolveSegments(
  segments: string[],
): Promise<{ resolved: Resolution; departments: DepartmentView[] }> {
  const departments = await getDepartments();
  const resolved = await resolveCategorySegments(segments, departments, {
    departmentRedirect: getDepartmentSlugRedirect,
    designRedirect: getDesignPathRedirect,
  });
  return { resolved, departments };
}

function findDepartment(departments: DepartmentView[], slug: string): DepartmentView | undefined {
  return departments.find((d) => d.slug === slug);
}

function findDesign(department: DepartmentView | undefined, slug: string): DesignSummary | undefined {
  return department?.designs.find((g) => g.slug === slug);
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string[] }> },
): Promise<Metadata> {
  const { slug: segments } = await params;
  const { resolved, departments } = await resolveSegments(segments);

  if (resolved.kind === "redirect") permanentRedirect(resolved.to);
  if (resolved.kind === "notFound") return { title: "Category not found" };

  if (resolved.kind === "department") {
    const name = findDepartment(departments, resolved.slug)?.name ?? resolved.slug;
    return {
      title: name,
      description: `Shop ${name.toLowerCase()} at Dressing Bear.`,
      alternates: { canonical: `/categories/${resolved.slug}` },
    };
  }

  const department = findDepartment(departments, resolved.departmentSlug);
  const name = findDesign(department, resolved.designSlug)?.name ?? resolved.designSlug;
  return {
    title: name,
    description: `Shop ${name.toLowerCase()} at Dressing Bear.`,
    alternates: { canonical: designPath(resolved.departmentSlug, resolved.designSlug) },
  };
}

type CategoryPageProps = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{
    sort?: string;
    page?: string;
    minPrice?: string;
    maxPrice?: string;
    inStockOnly?: string;
  }>;
};

/**
 * IMPORTANT: this segment must not carry a `loading.tsx`, and no ancestor
 * segment may either (which is why the index page lives in the `(index)` route
 * group with its own loading.tsx). A Suspense boundary above this component
 * flushes the HTML shell before the component runs, and Next can then only
 * express the redirect as a `<meta http-equiv="refresh">` on a 200 — the exact
 * thing the legacy `/categories/cat` URL must not degrade to. Resolving before
 * returning any JSX keeps `permanentRedirect` a real 308; the product grid
 * still streams behind the in-page <Suspense> below.
 */
export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug: segments }, sp] = await Promise.all([params, searchParams]);
  const sortBy = parseSortBy(sp.sort, "newest");
  const currentPage = Math.max(parseInt(sp.page || "1", 10), 1);
  const minPrice = parsePrice(sp.minPrice);
  const maxPrice = parsePrice(sp.maxPrice);
  const inStockOnly = sp.inStockOnly === "true";

  const { resolved, departments } = await resolveSegments(segments);
  if (resolved.kind === "redirect") permanentRedirect(resolved.to);
  if (resolved.kind === "notFound") notFound();

  if (resolved.kind === "department") {
    const department = findDepartment(departments, resolved.slug);
    if (!department) notFound();

    // Read here rather than inside DepartmentBody so the body stays a plain
    // sync function — testable by calling it — and so a design route never
    // pays for a read only the department view uses.
    const designSlugs = department.designs.map((g) => g.slug);
    const [media, allProducts, departmentProducts] = await Promise.all([
      getDesignMedia(),
      // The whole catalogue, never narrowed: the rail's counts are the totals
      // and must not move as this department's filters are applied.
      getProducts({ sortBy }),
      // A department with no designs owns no products. Guarded because
      // getProducts ignores an empty designSlugs and would hand back the
      // entire catalogue as if it were this department's.
      designSlugs.length === 0
        ? Promise.resolve([])
        : getProducts({ designSlugs, sortBy, minPrice, maxPrice, inStockOnly }),
    ]);

    return (
      <>
        <SiteHeader />
        <TrackCategoryView name={department.name} />
        <DepartmentBody
          department={department}
          departments={departments.filter(showsNavDropdown)}
          media={media}
          allProducts={allProducts}
          products={departmentProducts}
          sortBy={sortBy}
          currentPage={currentPage}
          minPrice={minPrice}
          maxPrice={maxPrice}
          inStockOnly={inStockOnly}
        />
        <SiteFooter />
      </>
    );
  }

  const department = findDepartment(departments, resolved.departmentSlug);
  const design = findDesign(department, resolved.designSlug);
  // resolveCategoryRoute only returns "design" for a slug in the live design
  // map, so both are present; the guard keeps the types honest.
  if (!department || !design) notFound();

  return (
    <>
      <SiteHeader />
      <TrackCategoryView name={design.name} />
      <Suspense fallback={<DesignBodySkeleton />}>
        <DesignBody
          department={department}
          design={design}
          sortBy={sortBy}
          currentPage={currentPage}
        />
      </Suspense>
      <SiteFooter />
    </>
  );
}

/** A design lists its products. */
async function DesignBody({
  department,
  design,
  sortBy,
  currentPage,
}: {
  department: DepartmentView;
  design: DesignSummary;
  sortBy: SortBy;
  currentPage: number;
}) {
  const allProducts = await getProducts({ designSlug: design.slug, sortBy });

  // Every in-page link has to carry the nested path — a bare `/categories/{slug}`
  // would 308 away and drop the sort/page query string with it.
  const basePath = designPath(department.slug, design.slug);

  const totalPages = Math.ceil(allProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = allProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const buildPageLink = (page: number) => {
    const params = new URLSearchParams();
    if (sortBy !== "newest") params.set("sort", sortBy);
    if (page > 1) params.set("page", page.toString());
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const siblings = department.designs.filter((g) => g.slug !== design.slug);

  return (
    <main className="flex-1">
      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Breadcrumb items={taxonomyTrail({ department, design })} className="mb-4" />
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{design.name}</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            {allProducts.length} product{allProducts.length !== 1 ? "s" : ""} in the {design.name} collection.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* The rail is desktop-only. Stacked above the grid on a phone, a
              department's designs (Women has sixteen) filled the screen before
              a single product appeared. Below lg the sort control moves into
              the toolbar over the grid and the siblings become chips under it,
              so a phone lands on products. */}
          <aside className="hidden lg:col-span-1 lg:block">
            <div className="sticky top-24">
              <h2 className={FILTER_HEADING}>Sort by</h2>
              <SortSelect
                value={sortBy}
                options={SORT_OPTIONS}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />

              {siblings.length > 0 && (
                <div className="mt-8">
                  <h2 className={FILTER_HEADING}>More in {department.name}</h2>
                  <ul className="space-y-1">
                    {siblings.map((g) => (
                      <li key={g.slug}>
                        <Link
                          href={designPath(department.slug, g.slug)}
                          className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-secondary/60 hover:text-foreground"
                        >
                          {g.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>

          <div className="lg:col-span-3">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Showing {paginatedProducts.length} of {allProducts.length} products</p>
              <div className="flex items-center gap-2 lg:hidden">
                {/* Labelled by the span for sighted readers; the select carries
                    its own accessible name, so the span is not a <label>. */}
                <span aria-hidden="true" className="text-sm text-muted-foreground">Sort</span>
                <SortSelect
                  value={sortBy}
                  options={SORT_OPTIONS}
                  className="rounded-lg border bg-background py-2 pl-3 pr-8 text-sm focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>

            {allProducts.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-lg text-muted-foreground">No products available in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} fromPath={basePath} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-12 flex justify-center">
                <nav className="flex items-center gap-1" aria-label="Pagination">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    const here = page === currentPage;
                    return (
                      <Link key={page} href={buildPageLink(page)}
                        {...(here ? { "aria-current": "page" as const } : {})}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border-b-2 text-sm tabular-nums transition-colors duration-(--duration-fast) ${
                          here
                            ? "border-brand bg-secondary font-medium text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        }`}>
                        {page}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            )}

            {/* The rail's sibling list, rebuilt as chips for a phone: it sits
                after the products rather than before them, and wraps instead
                of running down the page. */}
            {siblings.length > 0 && (
              <section className="mt-12 lg:hidden">
                <h2 className={FILTER_HEADING}>More in {department.name}</h2>
                <ul className="flex flex-wrap gap-2">
                  {siblings.map((g) => (
                    <li key={g.slug}>
                      <Link
                        href={designPath(department.slug, g.slug)}
                        className="block rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:border-brand hover:text-foreground"
                      >
                        {g.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Replaces the segment's old loading.tsx — see the note on CategoryPage. */
function DesignBodySkeleton() {
  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="h-9 w-72 motion-safe:animate-pulse rounded bg-muted" />
        <div className="mt-3 h-5 w-96 motion-safe:animate-pulse rounded bg-muted" />
      </div>
      <ProductGridSkeleton count={12} />
    </main>
  );
}

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
  const byDepartment = countsByDepartment(departments, byDesign);

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
