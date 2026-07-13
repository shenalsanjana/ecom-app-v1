import { listCategories } from "@/app/_lib/admin-products";
import { listDtfDesigns, listPlainTshirtStock } from "@/app/_lib/admin-inventory";
import { ProductForm } from "@/app/_components/admin/products/product-form";
import { emptyVariant } from "@/app/_components/admin/products/variant-draft";

export default async function NewProductPage() {
  const [categories, designs, plainStock] = await Promise.all([
    listCategories(), listDtfDesigns(), listPlainTshirtStock(),
  ]);
  const plainTeeColors = [...new Set(plainStock.map((s) => s.color))];
  return (
    <ProductForm
      mode="create"
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      designs={designs.map((d) => ({ id: d.id, name: d.name }))}
      plainTeeColors={plainTeeColors}
      initial={{ name: "", categorySlug: "", price: "", originalPrice: "", description: "", archived: false, dtfDesignId: "", variants: [emptyVariant()] }}
    />
  );
}
