import Link from "next/link";
import type { listInventoryHierarchy } from "@/app/_lib/admin-inventory";
import { categoryDescendants, physicalStockTotals } from "@/app/_lib/inventory-structure";
import { PhysicalStockTable } from "./physical-stock-table";

type Data = Awaited<ReturnType<typeof listInventoryHierarchy>>;

export function InventoryHierarchyTree({ data, categoryId, lowStockThreshold, query = "" }: {
  data: Data; categoryId: string; lowStockThreshold: number; query?: string;
}) {
  const byStock = new Map(data.stock.map(row => [row.id, row]));
  const byParent = new Map(data.products.map(parent => [parent.id, parent]));
  const search = query.trim().toLocaleLowerCase();
  const matching = (parent: Data["products"][number]) => !search || [parent.name, ...parent.designs.flatMap(design => [design.name, ...design.variants.flatMap(variant => variant.sizeStocks.map(size => size.sku))]),
    ...data.stock.filter(row => row.inventoryProductId === parent.id).map(row => `${row.color} ${row.size}`)].some(value => value.toLocaleLowerCase().includes(search));
  function renderCategory(id: string, ancestors: Set<string>) {
    if (ancestors.has(id)) return null;
    const category = data.categories.find(row => row.id === id);
    if (!category) return null;
    const path = new Set([...ancestors, id]);
    const descendants = categoryDescendants(data.categories, id);
    const parents = data.products.filter(parent => descendants.has(parent.categoryId) && matching(parent));
    if (search && parents.length === 0) return null;
    const parentIds = new Set(parents.map(parent => parent.id));
    const total = physicalStockTotals(data.stock.filter(row => row.inventoryProductId && parentIds.has(row.inventoryProductId)));
    return <details key={id} open={id === categoryId || !!search} className="rounded-lg border bg-background">
      <summary className="cursor-pointer p-4 text-sm font-semibold">{category.name} <span className="ml-2 font-normal text-muted-foreground">{total.entries} blank entries · {total.units} units available</span></summary>
      <div className="space-y-3 border-t p-3 sm:p-4">
        {data.categories.filter(child => child.parentId === id).map(child => renderCategory(child.id, path))}
        {data.products.filter(parent => parent.categoryId === id && matching(parent)).map(parent => {
          const rows = data.stock.filter(row => row.inventoryProductId === parent.id);
          const totals = physicalStockTotals(rows);
          return <details key={parent.id} open={!!search} className="rounded-lg border">
            <summary className="cursor-pointer p-4 text-sm font-medium">{parent.name} <span className="ml-2 font-normal text-muted-foreground">{parent.designs.length} designs · {totals.units} shared blank units available</span></summary>
            <div className="space-y-5 border-t p-3 sm:p-4">
              <PhysicalStockTable inventoryProductId={parent.id} rows={rows} lowStockThreshold={lowStockThreshold} />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2"><h4 className="mr-auto text-sm font-semibold">Design products</h4><Link href={`/admin/products/new?inventoryProductId=${encodeURIComponent(parent.id)}`} className="text-xs underline underline-offset-2">Add design to this family</Link></div>
                {parent.designs.length === 0 && <p className="text-sm text-muted-foreground">No designs linked yet. Add a design to start with this physical family already selected.</p>}
                {parent.designs.map(design => <details key={design.id} open={!!search} className="rounded-md border">
                  <summary className="cursor-pointer p-3 text-sm">{design.name}{design.archived ? " (archived)" : design.status === "DRAFT" ? " (draft)" : ""}<span className="ml-2 text-xs text-muted-foreground">{design.variants.length} colours</span></summary>
                  <div className="space-y-3 border-t p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-xs"><span>{design.stockMode === "PLAIN" ? "Plain item — shared blank only" : design.dtfDesign ? `Print: ${design.dtfDesign.name} · ${design.dtfDesign.quantity} shared prints available` : "DTF print not configured — unavailable for sale"}</span><Link href={`/admin/products/${encodeURIComponent(design.id)}/edit`} className="font-medium underline underline-offset-2">Manage design, colours and sizes</Link></div>
                    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Design variants and availability from shared stock</caption>
                      <thead><tr><th scope="col" className="p-2">Colour / sale SKU</th><th scope="col" className="p-2">Size</th><th scope="col" className="p-2">Physical blank source</th><th scope="col" className="p-2">Available from shared stock</th></tr></thead>
                      <tbody>{design.variants.flatMap(variant => variant.sizeStocks.map(size => {
                        const blank = size.plainTshirtStockId ? byStock.get(size.plainTshirtStockId) : undefined;
                        const source = blank?.inventoryProductId ? byParent.get(blank.inventoryProductId)?.name : "Unassigned blank";
                        const available = blank ? design.stockMode === "PLAIN" ? blank.quantity : design.dtfDesign ? Math.min(blank.quantity, design.dtfDesign.quantity) : 0 : 0;
                        return <tr key={`${variant.id}:${size.size}`} className="border-t"><td className="p-2">{variant.color}<code className="block text-muted-foreground">{size.sku}</code></td><td className="p-2">{size.size}</td><td className="p-2">{blank ? source : "Not configured"}</td><td className="p-2">{available}</td></tr>;
                      }))}</tbody>
                    </table></div>
                    <p className="text-xs text-muted-foreground">Availability follows the item’s plain or printed stock rule. These design quantities are not added to physical stock totals.</p>
                  </div>
                </details>)}
              </div>
            </div>
          </details>;
        })}
        {parents.length === 0 && <p className="text-sm text-muted-foreground">No physical families in this category. Add one using Manage physical categories &amp; families.</p>}
      </div>
    </details>;
  }
  return <div className="space-y-3">{renderCategory(categoryId, new Set())}{search && !data.products.some(parent => categoryDescendants(data.categories, categoryId).has(parent.categoryId) && matching(parent)) && <p className="text-sm text-muted-foreground">No matching inventory in this group.</p>}</div>;
}
