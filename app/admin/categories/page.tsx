import Link from "next/link";
import { prisma } from "@/app/_lib/prisma";
import { CategoriesTable } from "@/app/_components/admin/categories/categories-table";

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  const rows = categories.map((c) => ({
    slug: c.slug, name: c.name, image: c.image, productCount: c._count.products,
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
