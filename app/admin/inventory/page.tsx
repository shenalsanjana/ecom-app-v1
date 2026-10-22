import { StockMovementHistory } from "@/app/_components/admin/inventory/stock-movement-history";
import Link from "next/link";
import { listInventoryHierarchy, listDtfDesigns } from "@/app/_lib/admin-inventory";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { LOW_STOCK_THRESHOLD } from "@/app/_lib/admin-products";
import { categoryDescendants, inventoryRoot, physicalStockTotals } from "@/app/_lib/inventory-structure";
import { DtfDesignsTable } from "@/app/_components/admin/inventory/dtf-designs-table";
import { InventoryHierarchyTree } from "@/app/_components/admin/inventory/inventory-hierarchy-tree";
import { InventoryStructureManager } from "@/app/_components/admin/inventory/structure-manager";
import { UnassignedStock } from "@/app/_components/admin/inventory/unassigned-stock";

export default async function AdminInventoryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const data = await listInventoryHierarchy();
  const unassigned = data.stock.filter(row => !row.inventoryProductId);
  const missingLinks = data.products.flatMap(parent => parent.designs.filter(design => !design.archived && design.variants.some(variant => variant.sizeStocks.some(cell => !cell.plainTshirtStockId))));
  const reviewCount = unassigned.length + data.unassignedProducts.length + missingLinks.length;
  const groupCount = (key: string) => {
    const category = data.categories.find(row => row.systemKey === key);
    if (!category) return 0;
    const ids = categoryDescendants(data.categories, category.id);
    const owners = new Set(data.products.filter(parent => ids.has(parent.categoryId)).map(parent => parent.id));
    return data.stock.filter(row => row.inventoryProductId && owners.has(row.inventoryProductId)).length;
  };
  const tabs = [
    { id: "regular", label: "Regular T-Shirts", count: groupCount("regular") },
    { id: "oversized", label: "Oversized T-Shirts", count: groupCount("oversized") },
    { id: "raglan", label: "Oversized Raglan T-Shirts", count: groupCount("raglan") },
    { id: "accessories", label: "Accessories", count: groupCount("accessories") },
    { id: "designs", label: "DTF Prints", count: null },
    { id: "movements", label: "Movements", count: null },
    { id: "review", label: "Needs assignment", count: reviewCount },
  ];
  const requested = params.tab === "plain" ? "oversized" : params.tab === "shared" ? "review" : params.tab;
  const active = tabs.find(tab => tab.id === requested)?.id ?? "oversized";
  const category = data.categories.find(row => row.systemKey === active);
  const totals = physicalStockTotals(data.stock);
  const query = typeof params.q === "string" ? params.q : "";
  const prints = active === "designs" ? await listDtfDesigns() : [];
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Inventory</h1><p className="mt-1 text-sm text-muted-foreground">Physical categories → families → design products → colours and sizes. Every physical blank has one shared balance.</p></div>
      <p className="text-sm text-muted-foreground"><strong className="text-foreground">{totals.units}</strong> available blank units · {totals.entries} stock entries</p>
    </div>
    <InventoryStructureManager categories={data.categories} products={data.products.map(parent => ({ id: parent.id, name: parent.name, categoryId: parent.categoryId, version: parent.version }))} />
    <nav aria-label="Inventory groups" className="flex flex-wrap gap-2 border-b pb-4">
      {tabs.map(tab => <Link key={tab.id} href={`/admin/inventory?tab=${tab.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`} aria-current={active === tab.id ? "page" : undefined}
        className={`rounded-full px-4 py-2 text-sm font-medium ${active === tab.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
        {tab.label}{tab.count !== null && <span className="ml-1 opacity-70">{tab.count}</span>}
      </Link>)}
    </nav>
    {reviewCount > 0 && active !== "review" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{reviewCount} stock or product entries need a physical parent or blank link. <Link href="/admin/inventory?tab=review" className="font-medium underline">Review assignments</Link>.</p>}
    {category && <>
      <form className="flex gap-2" method="get"><input type="hidden" name="tab" value={active} /><input name="q" defaultValue={query} aria-label="Search inventory" placeholder="Search products, designs, colours, sizes or SKUs" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" /><button className="rounded-md border px-4 py-2 text-sm">Search</button>{query && <Link href={`/admin/inventory?tab=${active}`} className="px-2 py-2 text-sm underline">Clear</Link>}</form>
      <InventoryHierarchyTree data={data} categoryId={category.id} lowStockThreshold={LOW_STOCK_THRESHOLD} query={query} />
    </>}
    {active === "movements" && <StockMovementHistory query={query.slice(0, 160)} page={Math.max(1, Math.min(10000, Math.floor(Number(params.p) || 1)))} />}
    {active === "designs" && <div className="space-y-3"><h2 className="text-sm font-semibold">Shared DTF print inventory</h2><p className="text-sm text-muted-foreground">Each print has one balance across its linked products and sizes. Print units are separate from physical blank totals.</p><DtfDesignsTable designs={prints} lowStockThreshold={LOW_STOCK_THRESHOLD} /></div>}
    {active === "review" && <div className="space-y-5">
      <div><h2 className="font-semibold">Stock awaiting a physical parent</h2><p className="mt-1 text-sm text-muted-foreground">Check the item type before assigning it. Assignment preserves the existing quantity, stock ID and order references.</p></div>
      <UnassignedStock rows={unassigned} parents={data.products.map(parent => ({ id: parent.id, name: parent.name, stockGroup: inventoryRoot(data.categories, parent.categoryId)?.systemKey === "accessories" ? "ACCESSORY" : "PLAIN_TSHIRT" }))} />
      {unassigned.length === 0 && <p className="text-sm text-muted-foreground">All blank stock has a physical parent.</p>}
      <div className="space-y-2"><h3 className="text-sm font-semibold">Products awaiting a parent or blank link</h3>
        {[...new Map([...data.unassignedProducts, ...missingLinks].map(product => [product.id, product])).values()].map(product => <p key={product.id} className="text-sm"><Link href={`/admin/products/${encodeURIComponent(product.id)}/edit`} className="underline underline-offset-2">{product.name}</Link></p>)}
        {data.unassignedProducts.length === 0 && missingLinks.length === 0 && <p className="text-sm text-muted-foreground">All active designs have their inventory links configured.</p>}
      </div>
    </div>}
  </section>;
}
