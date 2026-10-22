export type InventoryCategoryRow = {
  id: string; name: string; parentId: string | null; systemKey: string | null; version: number;
};

export function inventoryRoot(categories: InventoryCategoryRow[], id: string): InventoryCategoryRow | null {
  const byId = new Map(categories.map(category => [category.id, category]));
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    if (!current.parentId) return current;
    current = byId.get(current.parentId);
  }
  return null;
}

export function categoryMoveError(categories: InventoryCategoryRow[], id: string, parentId: string): string | null {
  const category = categories.find(row => row.id === id);
  if (!category) return "Category not found. Refresh inventory.";
  if (category.systemKey) return "Built-in inventory groups cannot be moved or renamed.";
  const byId = new Map(categories.map(row => [row.id, row]));
  const visited = new Set([id]);
  let parent = byId.get(parentId);
  if (!parent) return "Choose an existing parent category.";
  while (parent) {
    if (visited.has(parent.id)) return "A category cannot be placed inside itself or its descendants.";
    visited.add(parent.id);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  if (inventoryRoot(categories, id)?.id !== inventoryRoot(categories, parentId)?.id) {
    return "Move categories within the same T-Shirts or Accessories group.";
  }
  if (!inventorySection(categories, parentId)) return "Choose Regular, Oversized or Oversized Raglan as the T-shirt category.";
  return null;
}

export function inventorySection(categories: InventoryCategoryRow[], id: string): string | null {
  if (inventoryRoot(categories, id)?.systemKey === "accessories") return "accessories";
  const byId = new Map(categories.map(row => [row.id, row]));
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (["regular", "oversized", "raglan"].includes(current.systemKey ?? "")) return current.systemKey;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}

export function categoryOptions(categories: InventoryCategoryRow[]) {
  const byId = new Map(categories.map(row => [row.id, row]));
  return categories.map(row => {
    const names = [row.name];
    const visited = new Set([row.id]);
    let parent = row.parentId ? byId.get(row.parentId) : undefined;
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id); names.unshift(parent.name);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return { id: row.id, label: names.join(" → ") };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

// Counts describe physical stock only. Never sum availability from printed
// designs: many designs can consume exactly the same blank or DTF print pool.
export function physicalStockTotals(rows: { id: string; quantity: number }[]) {
  const unique = new Map(rows.map(row => [row.id, row.quantity]));
  return { entries: unique.size, units: [...unique.values()].reduce((sum, quantity) => sum + quantity, 0) };
}

export function categoryDescendants(categories: InventoryCategoryRow[], id: string): Set<string> {
  const result = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    for (const category of categories) if (category.parentId === current) queue.push(category.id);
  }
  return result;
}
