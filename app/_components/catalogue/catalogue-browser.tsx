// app/_components/catalogue/catalogue-browser.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { ProductCard } from "@/app/_components/home/product-card";
import { FilterRail, SORT_OPTIONS } from "@/app/_components/categories/filter-rail";
import { FilterDisclosure } from "@/app/_components/categories/filter-disclosure";
import { SortSelect } from "@/app/_components/shared/sort-select";
import type { DepartmentView } from "@/app/_lib/taxonomy";
import type { ProductView } from "@/app/_lib/products";

/** The browse layout: filter rail, result count, product grid, pagination.
 *
 *  Shared by "/" and every department page so the two cannot drift — they had
 *  the same ninety lines of JSX between them otherwise. Everything it needs is
 *  a prop: it reads nothing and computes no counts, so both callers keep
 *  ownership of their own queries and their own URL shapes.
 *
 *  It deliberately renders no heading. "/" puts its <h1> in the offer banner
 *  and a department page puts its own above this; a heading here would be a
 *  second one on both. */
export function CatalogueBrowser({
  departments,
  byDesign,
  byDepartment,
  totalCount,
  selectedDesign = "",
  selectedDepartment = "",
  minPrice,
  maxPrice,
  inStockOnly,
  sortBy,
  defaultSort,
  action,
  allHref,
  clearHref,
  products,
  countLabel,
  activeCount,
  currentPage,
  totalPages,
  buildPageLink,
  fromPath,
  aboveGrid,
}: {
  departments: DepartmentView[];
  byDesign: Map<string, number>;
  byDepartment: Map<string, number>;
  totalCount: number;
  selectedDesign?: string;
  /** Marks a department active in the rail and unfolds its designs, for a
   *  department page where no single design is selected. */
  selectedDepartment?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly: boolean;
  sortBy: string;
  defaultSort: string;
  /** Where the rail's plain-GET filter form posts. Each page filters itself. */
  action: string;
  allHref: string;
  clearHref: string | null;
  /** Already sliced to the current page by the caller. */
  products: ProductView[];
  countLabel: string;
  activeCount: number;
  currentPage: number;
  totalPages: number;
  buildPageLink: (page: number) => string;
  fromPath: string;
  /** Content between the count and the grid — a department's design tiles sit
   *  here, the way a Shopify collection lists its sub-collections above its
   *  products. */
  aboveGrid?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-sm tabular-nums text-muted-foreground">{countLabel}</p>

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
                departments={departments}
                byDesign={byDesign}
                byDepartment={byDepartment}
                totalCount={totalCount}
                selectedDesign={selectedDesign}
                selectedDepartment={selectedDepartment}
                minPrice={minPrice}
                maxPrice={maxPrice}
                inStockOnly={inStockOnly}
                sortBy={sortBy}
                defaultSort={defaultSort}
                action={action}
                allHref={allHref}
                clearHref={clearHref}
              />
            </FilterDisclosure>
          </div>
        </aside>

        <div className="lg:col-span-3">
          {aboveGrid}

          {products.length === 0 ? (
            // Two different empty screens, because they have different causes
            // and different fixes. A filtered list that came back empty is the
            // filters' doing and the way out is to widen them; a department
            // with nothing in it yet is not the shopper's doing at all, and
            // offering to "clear filters" there would be nonsense.
            <div className="rounded-xl border border-dashed px-6 py-20 text-center">
              {activeCount > 0 ? (
                <>
                  <p className="text-base font-medium">Nothing matches these filters</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Widen the price range or clear the filters to see everything here.
                  </p>
                  <Link
                    href={clearHref ?? action}
                    className="mt-4 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Clear all filters
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-base font-medium">Nothing here yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    New pieces land every week. Try another department in the meantime.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} fromPath={fromPath} />
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
                      href={buildPageLink(page)}
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
  );
}
