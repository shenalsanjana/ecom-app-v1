import Link from "next/link";
import { listProducts, listCategories, resolveProductWhere, PRODUCT_TABS, PAGE_SIZE, type ProductTab } from "@/app/_lib/admin-products";
import { prisma } from "@/app/_lib/prisma";
import { ProductsToolbar } from "@/app/_components/admin/products/products-toolbar";
import { ProductsTable } from "@/app/_components/admin/products/products-table";

export default async function AdminProductsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = (sp.tab as ProductTab) || "active";
  const page = Number(sp.page ?? "1") || 1;

  const [{ rows, total, plainStock, designStock }, categories, counts] = await Promise.all([
    listProducts({ tab, category: sp.category, q: sp.q, page }),
    listCategories(),
    Promise.all(
      PRODUCT_TABS.map(async (t) => [t, await prisma.product.count({ where: await resolveProductWhere({ tab: t }) })] as const),
    ).then((entries) => Object.fromEntries(entries) as Record<ProductTab, number>),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v !== undefined && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/products${qs ? `?${qs}` : ""}`;
  }

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Products</h1>
      <ProductsToolbar categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} counts={counts} />
      <ProductsTable rows={rows} plainStock={plainStock} designStock={designStock} />
      <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        {page > 1
          ? <Link href={pageHref(page - 1)} className="rounded-md border px-3 py-1 hover:bg-secondary">← Prev</Link>
          : <span className="rounded-md border px-3 py-1 opacity-40">← Prev</span>}
        <span>Page {page} of {pages} · {total} products</span>
        {page < pages
          ? <Link href={pageHref(page + 1)} className="rounded-md border px-3 py-1 hover:bg-secondary">Next →</Link>
          : <span className="rounded-md border px-3 py-1 opacity-40">Next →</span>}
      </div>
    </section>
  );
}
