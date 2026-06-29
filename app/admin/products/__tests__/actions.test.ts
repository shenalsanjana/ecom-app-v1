import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { productUpdate, productFindUnique, productCreate, productDelete, orderItemCount, categoryCreate, categoryFindUnique, imageCreateMany, imageDeleteMany, txn } =
  vi.hoisted(() => ({
    productUpdate: vi.fn(), productFindUnique: vi.fn(), productCreate: vi.fn(),
    productDelete: vi.fn(), orderItemCount: vi.fn(),
    categoryCreate: vi.fn(), categoryFindUnique: vi.fn(),
    imageCreateMany: vi.fn(), imageDeleteMany: vi.fn(), txn: vi.fn(),
  }));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const client = {
    product: { update: productUpdate, findUnique: productFindUnique, create: productCreate, delete: productDelete },
    category: { create: categoryCreate, findUnique: categoryFindUnique },
    productImage: { createMany: imageCreateMany, deleteMany: imageDeleteMany },
    orderItem: { count: orderItemCount },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(client)) } };
});

import { updateStock, archiveProduct, unarchiveProduct } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  productUpdate.mockReset(); productFindUnique.mockReset(); productCreate.mockReset();
  productDelete.mockReset(); orderItemCount.mockReset();
  categoryCreate.mockReset(); categoryFindUnique.mockReset();
  imageCreateMany.mockReset(); imageDeleteMany.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => {
    const client = {
      product: { update: productUpdate, findUnique: productFindUnique, create: productCreate, delete: productDelete },
      category: { create: categoryCreate, findUnique: categoryFindUnique },
      productImage: { createMany: imageCreateMany, deleteMany: imageDeleteMany },
      orderItem: { count: orderItemCount },
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
  it("rejects a non-integer stock", async () => {
    const res = await updateStock("cat-white", 1.5);
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

import { createProduct } from "../actions";

const NEW_INPUT = {
  name: "Cat White", slug: "cat-white", categorySlug: "cat",
  price: 2190, originalPrice: null, stock: 10,
  sizes: ["S", "M", "L"], description: "Soft tee", image: "/products/cat-white/main.jpg",
  gallery: ["/products/cat-white/2.jpg", "/products/cat-white/3.jpg"],
};

describe("createProduct", () => {
  it("rejects empty name / non-positive price / empty image", async () => {
    expect((await createProduct({ ...NEW_INPUT, name: " " })).success).toBe(false);
    expect((await createProduct({ ...NEW_INPUT, price: 0 })).success).toBe(false);
    expect((await createProduct({ ...NEW_INPUT, image: "" })).success).toBe(false);
  });
  it("generates a unique slug and creates product + ordered gallery", async () => {
    productFindUnique.mockResolvedValueOnce(null); // slug free
    productCreate.mockResolvedValueOnce({ id: "cat-white" });
    imageCreateMany.mockResolvedValueOnce({ count: 2 });
    const res = await createProduct(NEW_INPUT);
    const createArg = productCreate.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      id: "cat-white", name: "Cat White", categorySlug: "cat",
      price: 2190, originalPrice: null, stock: 10, sizes: "S,M,L",
      description: "Soft tee", image: "/products/cat-white/main.jpg", archived: false,
    });
    expect(imageCreateMany).toHaveBeenCalledWith({
      data: [
        { productId: "cat-white", url: "/products/cat-white/2.jpg", sortOrder: 0 },
        { productId: "cat-white", url: "/products/cat-white/3.jpg", sortOrder: 1 },
      ],
    });
    expect(res).toEqual({ success: true, slug: "cat-white" });
  });
});

import { updateProduct } from "../actions";
import { deleteProduct } from "../actions";

describe("updateProduct", () => {
  it("rejects when the product does not exist", async () => {
    productFindUnique.mockResolvedValueOnce(null);
    const res = await updateProduct("nope", { ...NEW_INPUT });
    expect(res).toEqual({ success: false, error: "Product not found" });
  });
  it("updates scalars, never changes slug, and replaces the gallery", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productUpdate.mockResolvedValueOnce({});
    imageDeleteMany.mockResolvedValueOnce({ count: 2 });
    imageCreateMany.mockResolvedValueOnce({ count: 1 });
    const res = await updateProduct("cat-white", { ...NEW_INPUT, name: "Cat White v2", gallery: ["/g/1.jpg"] });
    const updArg = productUpdate.mock.calls[0][0];
    expect(updArg.where).toEqual({ id: "cat-white" });
    expect(updArg.data.name).toBe("Cat White v2");
    expect(updArg.data.id).toBeUndefined(); // slug/id never updated
    expect(imageDeleteMany).toHaveBeenCalledWith({ where: { productId: "cat-white" } });
    expect(imageCreateMany).toHaveBeenCalledWith({ data: [{ productId: "cat-white", url: "/g/1.jpg", sortOrder: 0 }] });
    expect(res).toEqual({ success: true });
  });
  it("clears the gallery (deleteMany, no createMany) when gallery is empty", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productUpdate.mockResolvedValueOnce({});
    imageDeleteMany.mockResolvedValueOnce({ count: 2 });
    const res = await updateProduct("cat-white", { ...NEW_INPUT, gallery: [] });
    expect(imageDeleteMany).toHaveBeenCalledWith({ where: { productId: "cat-white" } });
    expect(imageCreateMany).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });
});

describe("deleteProduct", () => {
  it("blocks deletion when the product has order history", async () => {
    orderItemCount.mockResolvedValueOnce(3);
    const res = await deleteProduct("cat-white");
    expect(orderItemCount).toHaveBeenCalledWith({ where: { productId: "cat-white" } });
    expect(productDelete).not.toHaveBeenCalled();
    expect(res).toEqual({
      success: false,
      error: "This product has order history and can't be deleted. Archive it instead.",
    });
  });
  it("deletes a product with no order history", async () => {
    orderItemCount.mockResolvedValueOnce(0);
    productDelete.mockResolvedValueOnce({});
    const res = await deleteProduct("cat-white");
    expect(requireAdmin).toHaveBeenCalled();
    expect(productDelete).toHaveBeenCalledWith({ where: { id: "cat-white" } });
    expect(res).toEqual({ success: true });
  });
  it("returns a generic error when the delete throws", async () => {
    orderItemCount.mockResolvedValueOnce(0);
    productDelete.mockRejectedValueOnce(new Error("db down"));
    const res = await deleteProduct("cat-white");
    expect(res).toEqual({ success: false, error: "Something went wrong. Please try again." });
  });
});
