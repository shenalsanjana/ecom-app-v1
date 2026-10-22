import { CategoryForm } from "@/app/_components/admin/categories/category-form";
import { listDepartments } from "@/app/_lib/admin-products";

export default async function NewCategoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const departments = await listDepartments();
  const params = await searchParams;
  const selected = departments.find(department => department.slug === params.department);
  return (
    <CategoryForm
      mode="create"
      departments={departments.map((d) => ({ slug: d.slug, name: d.name }))}
      initial={{ name: "", image: null, departmentSlug: selected?.slug ?? "" }}
    />
  );
}
