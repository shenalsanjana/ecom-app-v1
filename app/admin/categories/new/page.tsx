import { CategoryForm } from "@/app/_components/admin/categories/category-form";

export default function NewCategoryPage() {
  return <CategoryForm mode="create" initial={{ name: "", image: "" }} />;
}
