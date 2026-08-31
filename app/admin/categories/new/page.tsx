import { CategoryForm } from "@/app/_components/admin/categories/category-form";
import { listDepartments } from "@/app/_lib/admin-products";

export default async function NewCategoryPage() {
  const departments = await listDepartments();
  return (
    <CategoryForm
      mode="create"
      departments={departments.map((d) => ({ slug: d.slug, name: d.name }))}
      initial={{ name: "", image: null, departmentSlug: "women" }}
    />
  );
}
