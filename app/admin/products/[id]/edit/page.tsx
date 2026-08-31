import { notFound } from "next/navigation";
import { getProduct, listCategories } from "@/app/_lib/admin-products";
import { listDtfDesigns, listPlainTshirtStock } from "@/app/_lib/admin-inventory";
import { ProductForm } from "@/app/_components/admin/products/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, designs, plainStock] = await Promise.all([
    getProduct(id), listCategories(), listDtfDesigns(), listPlainTshirtStock(),
  ]);
  if (!product) notFound();
  const plainTeeColors = [...new Map(plainStock.map((s) => [s.colorSlug, { color: s.color, colorSlug: s.colorSlug }])).values()];
  return (
    <ProductForm
      mode="edit"
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      designs={designs.map((d) => ({ id: d.id, name: d.name }))}
      plainTeeColors={plainTeeColors}
      initial={{
        id: product.id, name: product.name, designSlug: product.designSlug,
        price: String(product.price),
        originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
        description: product.description, archived: product.archived,
        dtfDesignId: product.dtfDesignId ?? "",
        variants: product.variants.map((v) => ({
          id: v.id,
          color: v.color, colorSlug: v.colorSlug, swatchHex: v.swatchHex ?? "",
          sku: v.sku ?? "",
          price: v.price != null ? String(v.price) : "",
          originalPrice: v.originalPrice != null ? String(v.originalPrice) : "",
          cardImages: v.images.filter((im) => im.role === "CARD").map((im) => im.url),
          detailImages: v.images.filter((im) => im.role === "DETAIL").map((im) => im.url),
          sizeStocks: v.sizeStocks.map((s) => ({ size: s.size })),
        })),
      }}
    />
  );
}
