import { listProducts, listCategories, buildProductWhere, PRODUCT_TABS, PAGE_SIZE, type ProductTab } from "@/app/_lib/admin-products";
import { prisma } from "@/app/_lib/prisma";
import { ProductsToolbar } from "@/app/_components/admin/products/products-toolbar";
import { ProductsTable } from "@/app/_components/admin/products/products-table";

export default async function AdminProductsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = (sp.tab as ProductTab) || "active";
  const page = Number(sp.page ?? "1") || 1;

  const [{ rows, total }, categories] = await Promise.all([
    listProducts({ tab, category: sp.category, q: sp.q, page }),
    listCategories(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Products</h1>
      <ProductsToolbar categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
      <ProductsTable rows={rows} />
      <p className="mt-4 text-sm text-muted-foreground">Page {page} of {pages} · {total} products</p>
    </section>
  );
}
