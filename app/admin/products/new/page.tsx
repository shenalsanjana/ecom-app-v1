import { listCategories } from "@/app/_lib/admin-products";
import { ProductForm } from "@/app/_components/admin/products/product-form";
import { emptyVariant } from "@/app/_components/admin/products/variant-editor";

export default async function NewProductPage() {
  const categories = await listCategories();
  return (
    <ProductForm mode="create" categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      initial={{ name: "", categorySlug: "", price: "", originalPrice: "", description: "", archived: false, variants: [emptyVariant()] }} />
  );
}
