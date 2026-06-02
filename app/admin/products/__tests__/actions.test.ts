import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { productUpdate, productFindUnique, productCreate, categoryCreate, categoryFindUnique, imageCreateMany, imageDeleteMany, txn } =
  vi.hoisted(() => ({
    productUpdate: vi.fn(), productFindUnique: vi.fn(), productCreate: vi.fn(),
    categoryCreate: vi.fn(), categoryFindUnique: vi.fn(),
    imageCreateMany: vi.fn(), imageDeleteMany: vi.fn(), txn: vi.fn(),
  }));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const client = {
    product: { update: productUpdate, findUnique: productFindUnique, create: productCreate },
    category: { create: categoryCreate, findUnique: categoryFindUnique },
    productImage: { createMany: imageCreateMany, deleteMany: imageDeleteMany },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(client)) } };
});

import { updateStock, archiveProduct, unarchiveProduct } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  productUpdate.mockReset(); productFindUnique.mockReset(); productCreate.mockReset();
  categoryCreate.mockReset(); categoryFindUnique.mockReset();
  imageCreateMany.mockReset(); imageDeleteMany.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => {
    const client = {
      product: { update: productUpdate, findUnique: productFindUnique, create: productCreate },
      category: { create: categoryCreate, findUnique: categoryFindUnique },
      productImage: { createMany: imageCreateMany, deleteMany: imageDeleteMany },
    };
    return fn(client);
  });
});

describe("updateStock", () => {
  it("rejects a negative stock", async () => {
    const res = await updateStock("cat-white", -1);
    expect(res).toEqual({ success: false, error: "Stock must be 0 or more" });
    expect(productUpdate).not.toHaveBeenCalled();
  });
  it("sets stock", async () => {
    productUpdate.mockResolvedValueOnce({});
    const res = await updateStock("cat-white", 12);
    expect(requireAdmin).toHaveBeenCalled();
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: "cat-white" }, data: { stock: 12 } });
    expect(res).toEqual({ success: true });
  });
});

describe("archive/unarchive", () => {
  it("archives", async () => {
    productUpdate.mockResolvedValueOnce({});
    const res = await archiveProduct("cat-white");
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: "cat-white" }, data: { archived: true } });
    expect(res).toEqual({ success: true });
  });
  it("unarchives", async () => {
    productUpdate.mockResolvedValueOnce({});
    const res = await unarchiveProduct("cat-white");
    expect(productUpdate).toHaveBeenCalledWith({ where: { id: "cat-white" }, data: { archived: false } });
    expect(res).toEqual({ success: true });
  });
});
