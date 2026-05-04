import { notFound } from "next/navigation";
import Link from "next/link";
import { getCategories, getProducts, parseSortBy } from "@/app/_lib/products";
import { ProductCard } from "@/app/_components/home/product-card";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SortSelect } from "@/app/_components/shared/sort-select";
import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) {
    return { title: "Category not found" };
  }
  return {
    title: category.name,
    description: `Shop ${category.name.toLowerCase()} at Dressing Bear.`,
    alternates: { canonical: `/categories/${slug}` },
  };
}

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
};

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const sortBy = parseSortBy(sp.sort, "newest");
  const currentPage = Math.max(parseInt(sp.page || "1", 10), 1);

  const [categories, allProducts] = await Promise.all([
    getCategories(),
    getProducts({ categorySlug: slug, sortBy }),
  ]);

  const category = categories.find((c) => c.slug === slug);
  if (!category) { notFound(); }

  const ITEMS_PER_PAGE = 12;
  const totalPages = Math.ceil(allProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = allProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const buildPageLink = (page: number) => {
    const link = `/categories/${slug}`;
    const params = new URLSearchParams();
    if (sortBy !== "newest") params.set("sort", sortBy);
    if (page > 1) params.set("page", page.toString());
    return link + (params.toString() ? `?${params.toString()}` : "");
  };

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <nav className="mb-4 text-sm">
              <Link href="/" className="text-muted-foreground hover:text-foreground">Home</Link>
              <span className="mx-2 text-muted-foreground">/</span>
              <Link href="/categories" className="text-muted-foreground hover:text-foreground">Categories</Link>
              <span className="mx-2 text-muted-foreground">/</span>
              <span className="text-foreground">{category.name}</span>
            </nav>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{category.name}</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              {allProducts.length} product{allProducts.length !== 1 ? "s" : ""} in the {category.name} collection.
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
                  options={[
                    { value: "newest", label: "Featured" },
                    { value: "name", label: "Name (A-Z)" },
                    { value: "price_asc", label: "Price: Low to High" },
                    { value: "price_desc", label: "Price: High to Low" },
                    { value: "rating", label: "Customer Rating" },
                  ]}
                  className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                />

                <div className="mt-8">
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Other Categories</h2>
                  <ul className="space-y-1">
                    {categories.filter((c) => c.slug !== slug).map((cat) => (
                      <li key={cat.slug}>
                        <Link href={`/categories/${cat.slug}`} className="block rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                          {cat.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
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
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                  {paginatedProducts.map((product) => (
                    <ProductCard key={product.id} id={product.id} name={product.name} price={product.price} originalPrice={product.originalPrice}
                      image={product.image} rating={product.rating} reviewCount={product.reviewCount} wishlisted={false} fromPath={`/categories/${slug}`} />
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
      <SiteFooter />
    </>
  );
}
