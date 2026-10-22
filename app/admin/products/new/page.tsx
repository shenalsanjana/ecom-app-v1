import { listCategories, listDepartments } from "@/app/_lib/admin-products";
import { listDtfDesigns, listPlainTshirtStock, listInventoryParents } from "@/app/_lib/admin-inventory";
import { ProductForm } from "@/app/_components/admin/products/product-form";
import { emptyVariant } from "@/app/_components/admin/products/variant-draft";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const [categories, designs, plainStock, parents, departments] = await Promise.all([
    listCategories(), listDtfDesigns(), listPlainTshirtStock(), listInventoryParents(), listDepartments(),
  ]);
  const selectedParent = parents.find(parent => parent.id === params.inventoryProductId);
  const selectedCollection = categories.find(category => category.slug === params.category);
  return (
    <ProductForm
      mode="create"
      categories={categories.map((c) => ({ slug: c.slug, name: c.name, departmentSlug: c.departmentSlug }))}
      departments={departments.map(department => ({ slug: department.slug, name: department.name }))}
      designs={designs.map((d) => ({ id: d.id, name: d.name }))}
      inventoryParents={parents.map(p => ({ id: p.id, name: `${p.category.name} → ${p.name}`, section: p.section }))}
      stockOptions={plainStock.map(row => { const parent = parents.find(p => p.id === row.inventoryProductId); return { ...row, parentName: parent ? `${parent.category.name} → ${parent.name}` : "Unassigned blank", section: parent?.section }; })}
      initial={{ name: "", status: "DRAFT", designSlug: selectedCollection?.slug ?? "", additionalCollectionSlugs: [], price: "", originalPrice: "", description: "", archived: false, dtfDesignId: "", inventoryProductId: selectedParent?.id ?? null, variants: [emptyVariant([])] }}
    />
  );
}
