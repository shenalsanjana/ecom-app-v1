import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/prisma";
import { listDepartments } from "@/app/_lib/admin-products";
import { CategoryForm } from "@/app/_components/admin/categories/category-form";

export default async function EditCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [category, departments] = await Promise.all([
    prisma.design.findUnique({ where: { slug } }),
    listDepartments(),
  ]);
  if (!category) notFound();
  return (
    <CategoryForm
      mode="edit"
      departments={departments.map((d) => ({ slug: d.slug, name: d.name }))}
      initial={{
        slug: category.slug,
        name: category.name,
        image: category.image,
        departmentSlug: category.departmentSlug,
      }}
    />
  );
}
