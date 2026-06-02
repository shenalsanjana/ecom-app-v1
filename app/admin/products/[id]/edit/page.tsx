import { notFound } from "next/navigation";
import { getProduct, listCategories } from "@/app/_lib/admin-products";
import { ProductForm } from "@/app/_components/admin/products/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories] = await Promise.all([getProduct(id), listCategories()]);
  if (!product) notFound();
  return (
    <ProductForm mode="edit" categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      initial={{
        id: product.id, name: product.name, categorySlug: product.categorySlug,
        price: String(product.price), originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
        stock: String(product.stock), sizesCsv: product.sizes, description: product.description,
        image: product.image, gallery: product.images.map((im) => im.url), archived: product.archived,
      }} />
  );
}
