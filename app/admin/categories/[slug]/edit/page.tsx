import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/prisma";
import { CategoryForm } from "@/app/_components/admin/categories/category-form";

export default async function EditCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();
  return <CategoryForm mode="edit" initial={{ slug: category.slug, name: category.name, image: category.image }} />;
}
