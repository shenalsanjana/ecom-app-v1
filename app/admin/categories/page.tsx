import Link from "next/link";
import { prisma } from "@/app/_lib/prisma";
import { CategoriesTable } from "@/app/_components/admin/categories/categories-table";
import { absoluteUrl } from "@/app/_lib/absolute-url";
// Leaf path module, not taxonomy.ts — nothing here needs the Prisma readers.
import { designPath } from "@/app/_lib/taxonomy-path";

export default async function AdminCategoriesPage() {
  const categories = await prisma.design.findMany({
    orderBy: { name: "asc" },
    // departmentSlug is a Design scalar and `include` keeps every scalar, so
    // the ad URL below can be built without a second query.
    include: { _count: { select: { products: true } } },
  });
  const rows = categories.map((c) => ({
    slug: c.slug, name: c.name, image: c.image, productCount: c._count.products,
    // Merchants paste this into Meta campaigns, where it is baked in
    // permanently. It must be the canonical nested path, never the flat slug
    // that 308s — a redirect here costs a hop on every paid click, forever.
    adUrl: absoluteUrl(designPath(c.departmentSlug, c.slug)),
  }));
  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <Link href="/admin/categories/new" className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
          New category
        </Link>
      </div>
      <CategoriesTable rows={rows} />
    </section>
  );
}
