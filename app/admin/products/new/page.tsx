import { listCategories } from "@/app/_lib/admin-products";
import { ProductForm } from "@/app/_components/admin/products/product-form";

export default async function NewProductPage() {
  const categories = await listCategories();
  return (
    <ProductForm mode="create" categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      initial={{ name: "", categorySlug: "", price: "", originalPrice: "", stock: "0", sizesCsv: "S,M,L,XL", description: "", image: "", gallery: [], archived: false }} />
  );
}
