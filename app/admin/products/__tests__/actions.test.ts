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

import { createCategory } from "../actions";

describe("createCategory", () => {
  it("rejects empty name or image", async () => {
    expect(await createCategory({ name: "  ", image: "/x.jpg" })).toEqual({ success: false, error: "Name and image are required" });
    expect(await createCategory({ name: "Hats", image: "" })).toEqual({ success: false, error: "Name and image are required" });
  });
  it("slugifies, ensures uniqueness, creates, and returns the slug", async () => {
    categoryFindUnique.mockResolvedValueOnce({ slug: "hats" }).mockResolvedValueOnce(null); // 'hats' taken, 'hats-2' free
    categoryCreate.mockResolvedValueOnce({ slug: "hats-2", name: "Hats" });
    const res = await createCategory({ name: "Hats", image: "/hats.jpg" });
    expect(categoryCreate).toHaveBeenCalledWith({ data: { slug: "hats-2", name: "Hats", image: "/hats.jpg" } });
    expect(res).toEqual({ success: true, slug: "hats-2", name: "Hats" });
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
