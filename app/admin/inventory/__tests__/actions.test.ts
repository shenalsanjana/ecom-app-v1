vi.mock("@/app/_lib/stock-movements", async importOriginal => {
  const original = await importOriginal<typeof import("@/app/_lib/stock-movements")>();
  return { ...original, writeStaffStock: vi.fn(async (_actor, _reason, _payload, _key, write) => {
    const { prisma } = await import("@/app/_lib/prisma"); await write(prisma);
  }) };
});
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { listInventoryStockGroups } = vi.hoisted(() => ({ listInventoryStockGroups: vi.fn() }));
const { plainCreate, plainUpdate, plainDelete, designCreate, designUpdate, designDelete, designFindUnique, productCount } = vi.hoisted(() => ({
  plainCreate: vi.fn(),
  plainUpdate: vi.fn(),
  plainDelete: vi.fn(),
  designCreate: vi.fn(),
  designUpdate: vi.fn(),
  designDelete: vi.fn(),
  designFindUnique: vi.fn(),
  productCount: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/app/_lib/admin-inventory", () => ({ listInventoryStockGroups }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    plainTshirtStock: { create: plainCreate, updateMany: plainUpdate, deleteMany: plainDelete },
    dtfDesign: { create: designCreate, updateMany: designUpdate, deleteMany: designDelete, findUnique: designFindUnique },
    product: { count: productCount },
  },
}));

import {
  upsertPlainTshirtStock, deletePlainTshirtStock, createAccessoryStock, restockAccessoryStock,
  createDtfDesign, updateDtfDesign, deleteDtfDesign,
} from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  listInventoryStockGroups.mockReset().mockResolvedValue({ plain: [], accessories: [{ id: "acc1" }], shared: [] });
  plainCreate.mockReset();
  plainUpdate.mockReset();
  plainDelete.mockReset();
  designCreate.mockReset();
  designUpdate.mockReset();
  designDelete.mockReset();
  designFindUnique.mockReset();
  productCount.mockReset();
});

describe("upsertPlainTshirtStock", () => {
  it("rejects a negative quantity", async () => {
    const res = await upsertPlainTshirtStock({ color: "White", colorSlug: "white", size: "M", quantity: -1 });
    expect(res).toEqual({ success: false, error: "Color, size and quantity are required" });
    expect(plainCreate).not.toHaveBeenCalled();
  });

  it("creates a new row when no id is given", async () => {
    plainCreate.mockResolvedValueOnce({});
    const res = await upsertPlainTshirtStock({ color: "White", colorSlug: "White ", size: "M", quantity: 5 });
    expect(plainCreate).toHaveBeenCalledWith({ data: { color: "White", colorSlug: "white", size: "M", quantity: 5 } });
    expect(res).toEqual({ success: true });
  });

  it("updates an existing row when an id is given", async () => {
    plainUpdate.mockResolvedValueOnce({ count: 1 });
    const res = await upsertPlainTshirtStock({ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 8, expectedVersion: 2, reason: "Count correction" });
    expect(plainUpdate).toHaveBeenCalledWith({ where: { id: "ps1", version: 2, colorSlug: "white", size: "M" }, data: { quantity: 8, version: { increment: 1 } } });
    expect(res).toEqual({ success: true });
  });

  it("reports a friendly error on a unique-constraint collision", async () => {
    plainCreate.mockRejectedValueOnce(new Error("Unique constraint failed"));
    const res = await upsertPlainTshirtStock({ color: "White", colorSlug: "white", size: "M", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Could not save — this color+size may already exist." });
  });
});

describe("createAccessoryStock", () => {
  it("creates an accessory with an explicit group before it has a linked product", async () => {
    plainCreate.mockResolvedValueOnce({});
    expect(await createAccessoryStock({ color: " Canvas Tote Natural Ivory ", size: " One size ", quantity: 12 })).toEqual({ success: true });
    expect(plainCreate).toHaveBeenCalledWith({ data: {
      color: "Canvas Tote Natural Ivory", colorSlug: "canvas-tote-natural-ivory", size: "One size", quantity: 12, stockGroup: "ACCESSORY",
    } });
  });

  it.each([-1, 1.5, Number.NaN, 2147483648])("rejects invalid opening quantities: %s", async quantity => {
    expect((await createAccessoryStock({ color: "Canvas Tote", size: "One size", quantity })).success).toBe(false);
    expect(plainCreate).not.toHaveBeenCalled();
  });

  it("preserves an existing accessory variant's stock key when initializing its balance", async () => {
    plainCreate.mockResolvedValueOnce({});
    expect((await createAccessoryStock({ color: "Natural Ivory", colorSlug: "canvas-natural", size: "One size", quantity: 3 })).success).toBe(true);
    expect(plainCreate).toHaveBeenCalledWith({ data: {
      color: "Natural Ivory", colorSlug: "canvas-natural", size: "One size", quantity: 3, stockGroup: "ACCESSORY",
    } });
  });

  it("rejects missing item descriptions and sizes", async () => {
    expect((await createAccessoryStock({ color: " ", size: "One size", quantity: 0 })).success).toBe(false);
    expect((await createAccessoryStock({ color: "Canvas Tote", size: " ", quantity: 0 })).success).toBe(false);
    expect(plainCreate).not.toHaveBeenCalled();
  });

  it("does not replace an existing balance when the item and size already exist", async () => {
    plainCreate.mockRejectedValueOnce({ code: "P2002" });
    expect(await createAccessoryStock({ color: "Canvas Tote", size: "One size", quantity: 12 })).toMatchObject({ success: false, error: expect.stringMatching(/already exist/) });
    expect(plainUpdate).not.toHaveBeenCalled();
  });

  it("requires current admin authorization before creating stock", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(createAccessoryStock({ color: "Canvas Tote", size: "One size", quantity: 12 })).rejects.toThrow("Unauthorized");
    expect(plainCreate).not.toHaveBeenCalled();
  });
});

describe("restockAccessoryStock", () => {
  it("adds to the current stock atomically and invalidates stale count edits", async () => {
    plainUpdate.mockResolvedValueOnce({ count: 1 });
    expect(await restockAccessoryStock({ id: "acc1", quantity: 7 })).toEqual({ success: true });
    expect(plainUpdate).toHaveBeenCalledWith({
      where: { id: "acc1", quantity: { lte: 2147483640 } },
      data: { quantity: { increment: 7 }, version: { increment: 1 } },
    });
    expect(plainCreate).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, 2147483648])("rejects invalid restock quantities: %s", async quantity => {
    expect((await restockAccessoryStock({ id: "acc1", quantity })).success).toBe(false);
    expect(plainUpdate).not.toHaveBeenCalled();
    expect(listInventoryStockGroups).not.toHaveBeenCalled();
  });

  it("rejects a missing stock selection", async () => {
    expect((await restockAccessoryStock({ id: " ", quantity: 2 })).success).toBe(false);
    expect(plainUpdate).not.toHaveBeenCalled();
  });

  it.each(["plain", "shared"])("does not restock a %s entry through the accessory form", async group => {
    listInventoryStockGroups.mockResolvedValueOnce({ plain: [], accessories: [], shared: [], [group]: [{ id: "acc1" }] });
    expect((await restockAccessoryStock({ id: "acc1", quantity: 2 })).success).toBe(false);
    expect(plainUpdate).not.toHaveBeenCalled();
  });

  it("reports a removed row or a quantity exceeding the database limit without creating stock", async () => {
    plainUpdate.mockResolvedValueOnce({ count: 0 });
    expect((await restockAccessoryStock({ id: "acc1", quantity: 7 })).success).toBe(false);
    expect(plainCreate).not.toHaveBeenCalled();
  });

  it("handles a failed stock write", async () => {
    plainUpdate.mockRejectedValueOnce(new Error("Unavailable"));
    expect((await restockAccessoryStock({ id: "acc1", quantity: 7 })).success).toBe(false);
  });

  it("requires admin authorization before reading or writing stock", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(restockAccessoryStock({ id: "acc1", quantity: 7 })).rejects.toThrow("Unauthorized");
    expect(listInventoryStockGroups).not.toHaveBeenCalled();
    expect(plainUpdate).not.toHaveBeenCalled();
  });
});

describe("deletePlainTshirtStock", () => {
  it("deletes by id", async () => {
    plainDelete.mockResolvedValueOnce({ count: 1 });
    const res = await deletePlainTshirtStock("ps1");
    expect(plainDelete).toHaveBeenCalledWith({ where: { id: "ps1", quantity: 0, movements: { none: {} }, orderItems: { none: {} }, variantSizes: { none: {} } } });
    expect(res).toEqual({ success: true });
  });
});

describe("createDtfDesign", () => {
  it("rejects a blank name", async () => {
    const res = await createDtfDesign({ name: "  ", quantity: 5 });
    expect(res).toEqual({ success: false, error: "Name and quantity are required" });
  });

  it("slugifies the name and creates the design", async () => {
    designFindUnique.mockResolvedValueOnce(null); // slug is free
    designCreate.mockResolvedValueOnce({});
    const res = await createDtfDesign({ name: "Cats", quantity: 5 });
    expect(designCreate).toHaveBeenCalledWith({ data: { name: "Cats", slug: "cats", quantity: 5 } });
    expect(res).toEqual({ success: true });
  });
});

describe("updateDtfDesign", () => {
  it("updates name and quantity", async () => {
    designUpdate.mockResolvedValueOnce({ count: 1 });
    const res = await updateDtfDesign("d1", { name: "Cats v2", quantity: 3, expectedVersion: 2, reason: "Count correction" });
    expect(designUpdate).toHaveBeenCalledWith({ where: { id: "d1", version: 2 }, data: { name: "Cats v2", quantity: 3, version: { increment: 1 } } });
    expect(res).toEqual({ success: true });
  });
});

describe("deleteDtfDesign", () => {
  it("blocks deletion when products still reference it", async () => {
    productCount.mockResolvedValueOnce(2);
    const res = await deleteDtfDesign("d1");
    expect(res).toEqual({ success: false, error: "This design is used by products. Reassign them first." });
    expect(designDelete).not.toHaveBeenCalled();
  });

  it("deletes when unused", async () => {
    productCount.mockResolvedValueOnce(0);
    designDelete.mockResolvedValueOnce({ count: 1 });
    const res = await deleteDtfDesign("d1");
    expect(designDelete).toHaveBeenCalledWith({ where: { id: "d1", quantity: 0, products: { none: {} }, designs: { none: {} }, movements: { none: {} }, orderItems: { none: {} } } });
    expect(res).toEqual({ success: true });
  });
});


describe("stale inventory edits", () => {
  it("rejects a count if a sale changed the displayed stock version", async () => {
    plainUpdate.mockResolvedValue({ count: 0 });
    const result = await upsertPlainTshirtStock({ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 10, expectedVersion: 1, reason: "Count correction" });
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/Stock changed/) });
  });
  it("requires a displayed version for an existing count", async () => {
    const result = await upsertPlainTshirtStock({ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 10 });
    expect(result.success).toBe(false);
    expect(plainUpdate).not.toHaveBeenCalled();
  });
  it("renames a print without writing a stale quantity", async () => {
    designUpdate.mockResolvedValue({ count: 1 });
    expect(await updateDtfDesign("d1", { name: "New name" })).toEqual({ success: true });
    expect(designUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { name: "New name" } });
  });
  it("protects stock with history from deletion", async () => {
    plainDelete.mockResolvedValue({ count: 0 });
    expect((await deletePlainTshirtStock("ps1")).success).toBe(false);
  });
});
