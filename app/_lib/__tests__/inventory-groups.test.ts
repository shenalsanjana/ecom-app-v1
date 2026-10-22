import { describe, expect, it } from "vitest";
import { groupInventoryStock, type InventoryStockRow, type InventoryVariant } from "../inventory-groups";

const stock = (patch: Partial<InventoryStockRow> = {}): InventoryStockRow => ({
  id: "stock-1", color: "White", colorSlug: "white", size: "M", quantity: 8, version: 3, ...patch,
});
const variant = (department = "accessories", patch: Partial<InventoryVariant> = {}): InventoryVariant => ({
  archived: false,
  color: "White", colorSlug: "white", sizeStocks: [{ size: "M" }],
  product: { id: "pouch", name: "Canvas pouch", archived: false, department: { slug: department, slugHistory: [] } },
  ...patch,
});

describe("inventory groups", () => {
  it("keeps classified accessory stock separate from its storefront merchandising department", () => {
    const owner = "physical-tote";
    const offered = variant("women", { sizeStocks: [{ size: "M", plainTshirtStockId: "stock-1" }] });
    offered.product.inventoryProductId = owner;
    const result = groupInventoryStock([stock({ stockGroup: "ACCESSORY", inventoryProductId: owner })], [offered]);
    expect(result.accessories.map(row => row.id)).toEqual(["stock-1"]);
    expect(result.shared).toEqual([]);
    expect(result.plain).toEqual([]);
  });
  it("keeps same-colour blanks for different physical parents separate by ID", () => {
    const bag = stock({ id: "bag", inventoryProductId: "bag-parent", stockGroup: "ACCESSORY" });
    const tee = stock({ id: "tee", inventoryProductId: "oversized-parent" });
    const result = groupInventoryStock([bag, tee], [
      variant("accessories", { sizeStocks: [{ size: "M", plainTshirtStockId: "bag" }] }),
      variant("men", { sizeStocks: [{ size: "M", plainTshirtStockId: "tee" }] }),
    ]);
    expect(result.accessories.map(row => row.id)).toEqual(["bag"]);
    expect(result.plain.map(row => row.id)).toEqual(["tee"]);
    expect(result.shared).toEqual([]);
  });

  it("does not match an explicitly unconfigured accessory to a same-colour shirt", () => {
    const result = groupInventoryStock([stock({ inventoryProductId: "oversized" })], [variant("accessories", { sizeStocks: [{ size: "M", plainTshirtStockId: null }] })]);
    expect(result.accessories[0].quantity).toBeNull();
    expect(result.plain).toHaveLength(1);
  });
  it("keeps a newly added accessory in Accessories without any product links", () => {
    const result = groupInventoryStock([stock({ stockGroup: "ACCESSORY" })], []);
    expect(result.plain).toEqual([]);
    expect(result.accessories).toMatchObject([{ id: "stock-1", quantity: 8, products: [] }]);
  });

  it("flags an explicitly marked accessory linked to a T-shirt for review", () => {
    const result = groupInventoryStock([stock({ stockGroup: "ACCESSORY" })], [variant("men")]);
    expect(result.plain).toEqual([]);
    expect(result.accessories).toEqual([]);
    expect(result.shared).toHaveLength(1);
  });

  it("separates accessory stock by both colour and size without moving other sizes of that colour", () => {
    const rows = [stock(), stock({ id: "large", size: "L" })];
    const result = groupInventoryStock(rows, [variant()]);
    expect(result.plain.map(row => row.id)).toEqual(["large"]);
    expect(result.accessories).toMatchObject([{ id: "stock-1", quantity: 8, version: 3 }]);
  });

  it("counts a shared blank once and keeps links to all products using it", () => {
    const other = variant();
    other.product = { ...other.product, id: "other-pouch", name: "Printed pouch" };
    const result = groupInventoryStock([stock()], [variant(), other, variant()]);
    expect(result.accessories).toHaveLength(1);
    expect(result.accessories[0].quantity).toBe(8);
    expect(result.accessories[0].products.map(product => product.id)).toEqual(["pouch", "other-pouch"]);
    expect(result.plain).toHaveLength(0);
  });

  it("distinguishes missing stock setup from an actual zero quantity", () => {
    expect(groupInventoryStock([], [variant()]).accessories[0]).toMatchObject({ id: null, quantity: null, version: null });
    expect(groupInventoryStock([stock({ quantity: 0 })], [variant()]).accessories[0]).toMatchObject({ id: "stock-1", quantity: 0, version: 3 });
  });

  it("keeps accessory grouping after the department slug is renamed", () => {
    const renamed = variant("bags");
    renamed.product.department.slugHistory = [{ oldSlug: "accessories" }];
    expect(groupInventoryStock([stock()], [renamed]).accessories).toHaveLength(1);
  });

  it("retains accessory stock when its linked products are archived", () => {
    const archived = variant();
    archived.product.archived = true;
    expect(groupInventoryStock([stock()], [archived]).accessories[0].products[0].archived).toBe(true);
  });

  it("does not create missing stock entries for discontinued variants or products", () => {
    const discontinuedProduct = variant();
    discontinuedProduct.product.archived = true;
    expect(groupInventoryStock([], [variant("accessories", { archived: true }), discontinuedProduct]).accessories).toEqual([]);
  });

  it("flags stock used by both product types without duplicating it in either editable group", () => {
    const shirt = variant("men");
    shirt.product.id = "tshirt";
    const result = groupInventoryStock([stock()], [variant(), shirt]);
    expect(result.plain).toHaveLength(0);
    expect(result.accessories).toHaveLength(0);
    expect(result.shared).toMatchObject([{ id: "stock-1", quantity: 8 }]);
    expect(result.shared[0].products.map(product => product.id)).toEqual(["pouch", "tshirt"]);
  });

  it("keeps unlinked blanks in their original T-shirt stock group", () => {
    expect(groupInventoryStock([stock()], []).plain).toEqual([stock()]);
  });

  it("does not guess product type from dimensions or clothing size labels", () => {
    const shirt = stock({ size: '12" × 12"' });
    const result = groupInventoryStock([shirt], [variant("plain", { sizeStocks: [{ size: shirt.size }] })]);
    expect(result.plain).toEqual([shirt]);
    expect(result.accessories).toHaveLength(0);
  });
});
