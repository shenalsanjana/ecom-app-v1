import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    plainTshirtStock: { create: plainCreate, update: plainUpdate, delete: plainDelete },
    dtfDesign: { create: designCreate, update: designUpdate, delete: designDelete, findUnique: designFindUnique },
    product: { count: productCount },
  },
}));

import {
  upsertPlainTshirtStock, deletePlainTshirtStock,
  createDtfDesign, updateDtfDesign, deleteDtfDesign,
} from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
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
    plainUpdate.mockResolvedValueOnce({});
    const res = await upsertPlainTshirtStock({ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 8 });
    expect(plainUpdate).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { color: "White", colorSlug: "white", size: "M", quantity: 8 } });
    expect(res).toEqual({ success: true });
  });

  it("reports a friendly error on a unique-constraint collision", async () => {
    plainCreate.mockRejectedValueOnce(new Error("Unique constraint failed"));
    const res = await upsertPlainTshirtStock({ color: "White", colorSlug: "white", size: "M", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Could not save — this color+size may already exist." });
  });
});

describe("deletePlainTshirtStock", () => {
  it("deletes by id", async () => {
    plainDelete.mockResolvedValueOnce({});
    const res = await deletePlainTshirtStock("ps1");
    expect(plainDelete).toHaveBeenCalledWith({ where: { id: "ps1" } });
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
    designUpdate.mockResolvedValueOnce({});
    const res = await updateDtfDesign("d1", { name: "Cats v2", quantity: 3 });
    expect(designUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { name: "Cats v2", quantity: 3 } });
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
    designDelete.mockResolvedValueOnce({});
    const res = await deleteDtfDesign("d1");
    expect(designDelete).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(res).toEqual({ success: true });
  });
});
