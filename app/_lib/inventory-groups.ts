export type InventoryStockRow = {
  id: string;
  color: string;
  colorSlug: string;
  size: string;
  quantity: number;
  version: number;
  stockGroup?: "PLAIN_TSHIRT" | "ACCESSORY";
  inventoryProductId?: string | null;
};

export type InventoryVariant = {
  archived: boolean;
  color: string;
  colorSlug: string;
  sizeStocks: { size: string; plainTshirtStockId?: string | null }[];
  product: {
    id: string;
    name: string;
    archived: boolean;
    inventoryProductId?: string | null;
    department: { slug: string; slugHistory: { oldSlug: string }[] };
  };
};

export type AccessoryStockRow = {
  id: string | null;
  color: string;
  colorSlug: string;
  size: string;
  quantity: number | null;
  version: number | null;
  inventoryProductId?: string | null;
  products: { id: string; name: string; archived: boolean }[];
};

// Match the same colour AND size used by checkout. A shared blank appears once
// even when several printed products use it. Never infer item type from size.
export function groupInventoryStock(stock: InventoryStockRow[], variants: InventoryVariant[]) {
  const key = (colorSlug: string, size: string) => JSON.stringify([colorSlug, size]);
  const existing = new Map(stock.filter(row => !row.inventoryProductId).map(row => [key(row.colorSlug, row.size), row]));
  const byId = new Map(stock.map(row => [row.id, row]));
  const accessoryRows = new Map<string, AccessoryStockRow>();
  const tshirtProducts = new Map<string, AccessoryStockRow["products"]>();

  for (const row of stock) {
    if (row.stockGroup === "ACCESSORY") {
      accessoryRows.set(row.id, { ...row, products: [] });
    }
  }

  for (const variant of variants) {
    const product = variant.product;
    const legacyAccessory = product.department.slug === "accessories" ||
      product.department.slugHistory.some(history => history.oldSlug === "accessories");
    for (const cell of variant.sizeStocks) {
      const { size } = cell;
      const saved = cell.plainTshirtStockId ? byId.get(cell.plainTshirtStockId) :
        cell.plainTshirtStockId === null ? undefined : existing.get(key(variant.colorSlug, size));
      // Physical inventory ownership is authoritative after classification;
      // storefront departments remain free to merchandise the same product.
      const isAccessory = product.inventoryProductId && saved?.inventoryProductId ? saved.stockGroup === "ACCESSORY" : legacyAccessory;
      const stockKey = saved?.id ?? JSON.stringify([product.inventoryProductId ?? "legacy", variant.colorSlug, size]);
      if (!isAccessory) {
        const products = tshirtProducts.get(stockKey) ?? [];
        if (!products.some(linked => linked.id === product.id)) {
          products.push({ id: product.id, name: product.name, archived: product.archived });
        }
        tshirtProducts.set(stockKey, products);
        continue;
      }
      let row = accessoryRows.get(stockKey);
      if (!row) {
        // Removed variants free their colour key. Do not offer new stock setup
        // for those archived entries or for discontinued products.
        if (!saved && (variant.archived || product.archived)) continue;
        row = {
          id: saved?.id ?? null, color: saved?.color ?? variant.color,
          colorSlug: variant.colorSlug, size, quantity: saved?.quantity ?? null,
          version: saved?.version ?? null, products: [],
          inventoryProductId: saved?.inventoryProductId ?? product.inventoryProductId,
        };
        accessoryRows.set(stockKey, row);
      }
      if (!row.products.some(linked => linked.id === product.id)) {
        row.products.push({ id: product.id, name: product.name, archived: product.archived });
      }
    }
  }

  const accessories: AccessoryStockRow[] = [];
  const shared: AccessoryStockRow[] = [];
  for (const [stockKey, row] of accessoryRows) {
    const shirts = tshirtProducts.get(stockKey);
    if (shirts) {
      row.products.push(...shirts.filter(product => !row.products.some(linked => linked.id === product.id)));
      shared.push(row);
    } else {
      accessories.push(row);
    }
  }
  // Unlinked blanks retain the group explicitly selected when they were added.
  // Archived products are included in the references so their accessory stock
  // does not silently move to the T-shirt screen when a product is archived.
  const plain = stock.filter(row => !accessoryRows.has(row.id));
  return { plain, accessories, shared };
}
