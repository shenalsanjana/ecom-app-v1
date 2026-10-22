import { describe, expect, it } from "vitest";
import { categoryDescendants, categoryMoveError, categoryOptions, inventoryRoot, physicalStockTotals, type InventoryCategoryRow } from "../inventory-structure";

const category = (id: string, name: string, parentId: string | null, systemKey: string | null = null): InventoryCategoryRow => ({ id, name, parentId, systemKey, version: 0 });
const tree = [category("accessories", "Accessories", null, "accessories"), category("bags", "Bags", "accessories", "bags"), category("canvas", "Canvas", "bags"), category("totes", "Totes", "canvas"), category("pouches", "Pouches", "accessories"), category("tees", "T-Shirts", null, "tshirts")];

describe("inventory category hierarchy", () => {
  it("supports nested paths and identifies their physical-stock group", () => {
    expect(inventoryRoot(tree, "totes")?.systemKey).toBe("accessories");
    expect(categoryOptions(tree).find(row => row.id === "totes")?.label).toBe("Accessories → Bags → Canvas → Totes");
    expect(categoryDescendants(tree, "bags")).toEqual(new Set(["bags", "canvas", "totes"]));
  });
  it("rejects direct and indirect cycles", () => {
    expect(categoryMoveError(tree, "canvas", "canvas")).toMatch(/itself/);
    expect(categoryMoveError(tree, "canvas", "totes")).toMatch(/descendants/);
  });
  it("keeps the three built-in shirt groups and root groups stable", () => {
    expect(categoryMoveError(tree, "bags", "pouches")).toMatch(/Built-in/);
  });
  it("moves a custom category within its branch without changing stock ownership", () => {
    expect(categoryMoveError(tree, "canvas", "pouches")).toBeNull();
    expect(categoryMoveError(tree, "canvas", "tees")).toMatch(/same T-Shirts or Accessories/);
  });
  it("handles missing parents and corrupt cycles without looping", () => {
    expect(inventoryRoot(tree, "missing")).toBeNull();
    expect(categoryMoveError(tree, "canvas", "missing")).toMatch(/existing parent/);
    const cycle = [category("a", "A", "b"), category("b", "B", "a")];
    expect(inventoryRoot(cycle, "a")).toBeNull();
    expect(categoryDescendants(cycle, "a")).toEqual(new Set(["a", "b"]));
  });
});

describe("physical inventory totals", () => {
  it("counts a shared blank once across multiple product/design references", () => {
    expect(physicalStockTotals([{ id: "tote", quantity: 22 }, { id: "tote", quantity: 22 }, { id: "pouch", quantity: 25 }])).toEqual({ entries: 2, units: 47 });
  });
  it("includes zero balances and supports empty categories", () => {
    expect(physicalStockTotals([{ id: "empty", quantity: 0 }])).toEqual({ entries: 1, units: 0 });
    expect(physicalStockTotals([])).toEqual({ entries: 0, units: 0 });
  });
});
