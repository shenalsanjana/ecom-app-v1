import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { getProducts, parseSortBy, type SortBy } from "@/app/_lib/products";
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
import { inkFor } from "@/app/_lib/taxonomy-tint";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import { ProductGridSkeleton } from "@/app/_components/shared/product-grid-skeleton";
import { TrackCategoryView } from "@/app/_components/analytics/track-category-view";
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
  searchParams: Promise<{ sort?: string; page?: string }>;
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

  const { resolved, departments } = await resolveSegments(segments);
  if (resolved.kind === "redirect") permanentRedirect(resolved.to);
  if (resolved.kind === "notFound") notFound();

  if (resolved.kind === "department") {
    const department = findDepartment(departments, resolved.slug);
    if (!department) notFound();
    return (
      <>
        <SiteHeader />
        <TrackCategoryView name={department.name} />
        <DepartmentBody department={department} />
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
          <nav className="mb-4 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            <span className="mx-2 text-muted-foreground">/</span>
            <Link href="/categories" className="text-muted-foreground hover:text-foreground">Categories</Link>
            <span className="mx-2 text-muted-foreground">/</span>
            <Link href={`/categories/${department.slug}`} className="text-muted-foreground hover:text-foreground">
              {department.name}
            </Link>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="text-foreground">{design.name}</span>
          </nav>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{design.name}</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            {allProducts.length} product{allProducts.length !== 1 ? "s" : ""} in the {design.name} collection.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          <aside className="lg:col-span-1">
            <div className="sticky top-24">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sort By</h2>
              <SortSelect
                value={sortBy}
                options={SORT_OPTIONS}
                className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              />

              {siblings.length > 0 && (
                <div className="mt-8">
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    More in {department.name}
                  </h2>
                  <ul className="space-y-1">
                    {siblings.map((g) => (
                      <li key={g.slug}>
                        <Link
                          href={designPath(department.slug, g.slug)}
                          className="block rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
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
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Showing {paginatedProducts.length} of {allProducts.length} products</p>
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
                <nav className="flex items-center gap-2" aria-label="Pagination">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Link key={page} href={buildPageLink(page)}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border font-medium ${page === currentPage ? "bg-primary text-primary-foreground shadow-lg" : "bg-background hover:bg-accent"}`}>
                      {page}
                    </Link>
                  ))}
                </nav>
              </div>
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

/** A department lists its designs as solid tiles — it has no products of its own. */
function DepartmentBody({ department }: { department: DepartmentView }) {
  return (
    <main className="flex-1">
      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <nav className="mb-4 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            <span className="mx-2 text-muted-foreground">/</span>
            <Link href="/categories" className="text-muted-foreground hover:text-foreground">Categories</Link>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="text-foreground">{department.name}</span>
          </nav>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{department.name}</h1>
          {department.note && (
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{department.note}</p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {department.subName && (
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {department.subName}
          </h2>
        )}

        {department.designs.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">Nothing here yet. Check back soon.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {department.designs.map((g) => (
              <li key={g.slug}>
                <Link
                  href={designPath(department.slug, g.slug)}
                  className="flex aspect-square items-end rounded-xl p-4 transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  style={{ backgroundColor: g.hex, color: inkFor(g.hex) }}
                >
                  <span className="font-heading text-lg font-semibold tracking-tight">{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
