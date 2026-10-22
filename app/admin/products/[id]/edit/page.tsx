import { notFound } from "next/navigation";
import { getProduct, listCategories, listDepartments } from "@/app/_lib/admin-products";
import { listDtfDesigns, listPlainTshirtStock, listInventoryParents } from "@/app/_lib/admin-inventory";
import { ProductForm } from "@/app/_components/admin/products/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, designs, plainStock, parents, departments] = await Promise.all([
    getProduct(id), listCategories(), listDtfDesigns(), listPlainTshirtStock(), listInventoryParents(), listDepartments(),
  ]);
  if (!product) notFound();
  return (
    <ProductForm
      mode="edit"
      categories={categories.map((c) => ({ slug: c.slug, name: c.name, departmentSlug: c.departmentSlug }))}
      departments={departments.map(department => ({ slug: department.slug, name: department.name }))}
      designs={designs.map((d) => ({ id: d.id, name: d.name }))}
      inventoryParents={parents.map(p => ({ id: p.id, name: `${p.category.name} → ${p.name}`, section: p.section }))}
      stockOptions={plainStock.map(row => { const parent = parents.find(p => p.id === row.inventoryProductId); return { ...row, parentName: parent ? `${parent.category.name} → ${parent.name}` : "Unassigned blank", section: parent?.section }; })}
      initial={{
        id: product.id, name: product.name, designSlug: product.designSlug,
        status: product.status, stockMode: product.stockMode,
        additionalCollectionSlugs: product.additionalCollections.map(link => link.designSlug),
        price: String(product.price),
        originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
        description: product.description, archived: product.archived,
        dtfDesignId: product.dtfDesignId ?? "",
        inventoryProductId: product.inventoryProductId,
        variants: product.variants.map((v) => ({
          id: v.id,
          color: v.color, colorSlug: v.colorSlug, swatchHex: v.swatchHex ?? "",
          sku: v.sku ?? "",
          price: v.price != null ? String(v.price) : "",
          originalPrice: v.originalPrice != null ? String(v.originalPrice) : "",
          cardImages: v.images.filter((im) => im.role === "CARD").map((im) => im.url),
          detailImages: v.images.filter((im) => im.role === "DETAIL").map((im) => im.url),
          sizeStocks: v.sizeStocks.map((s) => ({ id: s.id, sku: s.sku, size: s.size, plainTshirtStockId: s.plainTshirtStockId })),
        })),
      }}
    />
  );
}
