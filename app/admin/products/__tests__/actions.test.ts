import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const {
  productUpdate, productFindUnique, productFindFirst, productCreate, productDelete, orderItemCount,
  categoryCreate, categoryFindUnique,
  variantDeleteMany, variantCreate, variantFindMany, variantUpdate,
  variantImageCreateMany, variantImageDeleteMany,
  variantSizeStockCreateMany, variantSizeStockDeleteMany,
  historyUpsert, historyDeleteMany, txn,
} =
  vi.hoisted(() => ({
    productUpdate: vi.fn(), productFindUnique: vi.fn(), productFindFirst: vi.fn(), productCreate: vi.fn(),
    productDelete: vi.fn(), orderItemCount: vi.fn(),
    categoryCreate: vi.fn(), categoryFindUnique: vi.fn(),
    variantDeleteMany: vi.fn(), variantCreate: vi.fn(), variantFindMany: vi.fn(), variantUpdate: vi.fn(),
    variantImageCreateMany: vi.fn(), variantImageDeleteMany: vi.fn(),
    variantSizeStockCreateMany: vi.fn(), variantSizeStockDeleteMany: vi.fn(),
    historyUpsert: vi.fn(), historyDeleteMany: vi.fn(), txn: vi.fn(),
  }));

function buildClient() {
  return {
    product: { update: productUpdate, findUnique: productFindUnique, findFirst: productFindFirst, create: productCreate, delete: productDelete },
    category: { create: categoryCreate, findUnique: categoryFindUnique },
    productVariant: { deleteMany: variantDeleteMany, create: variantCreate, findMany: variantFindMany, update: variantUpdate },
    variantImage: { createMany: variantImageCreateMany, deleteMany: variantImageDeleteMany },
    variantSizeStock: { createMany: variantSizeStockCreateMany, deleteMany: variantSizeStockDeleteMany },
    productSlugHistory: { upsert: historyUpsert, deleteMany: historyDeleteMany },
    orderItem: { count: orderItemCount },
  };
}

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const client = buildClient();
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(client)) } };
});

import { archiveProduct, unarchiveProduct } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  productUpdate.mockReset(); productFindUnique.mockReset(); productFindFirst.mockReset(); productCreate.mockReset();
  productDelete.mockReset(); orderItemCount.mockReset();
  categoryCreate.mockReset(); categoryFindUnique.mockReset();
  variantDeleteMany.mockReset(); variantCreate.mockReset().mockResolvedValue({ id: "variant-1" });
  variantFindMany.mockReset().mockResolvedValue([]); variantUpdate.mockReset().mockResolvedValue({});
  variantImageCreateMany.mockReset(); variantImageDeleteMany.mockReset();
  variantSizeStockCreateMany.mockReset(); variantSizeStockDeleteMany.mockReset();
  historyUpsert.mockReset(); historyDeleteMany.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => fn(buildClient()));
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
  price: 2190, originalPrice: null,
  description: "Soft tee",
  variants: [
    {
      color: "White", colorSlug: "white", swatchHex: "#FFFFFF", sku: "CAT-WHITE",
      price: null, originalPrice: null,
      cardImages: ["/products/cat-white/card/1.jpg"],
      detailImages: ["/products/cat-white/detail/1.jpg", "/products/cat-white/detail/2.jpg"],
      sizeStocks: [{ size: "S", stock: 5 }, { size: "M", stock: 10 }],
    },
  ],
};

describe("createProduct", () => {
  it("rejects empty name / non-positive price / empty variants", async () => {
    expect((await createProduct({ ...NEW_INPUT, name: " " })).success).toBe(false);
    expect((await createProduct({ ...NEW_INPUT, price: 0 })).success).toBe(false);
    expect((await createProduct({ ...NEW_INPUT, variants: [] })).success).toBe(false);
  });
  it("rejects a name/slug with no slug-able characters", async () => {
    const res = await createProduct({ ...NEW_INPUT, name: "!!!", slug: "" });
    expect(res).toEqual({ success: false, error: "Name must contain letters or numbers" });
    expect(productCreate).not.toHaveBeenCalled();
  });
  it("rejects duplicate colorSlugs across variants before touching the DB", async () => {
    const res = await createProduct({
      ...NEW_INPUT,
      variants: [NEW_INPUT.variants[0], { ...NEW_INPUT.variants[0], color: "White 2", sku: "OTHER-SKU" }],
    });
    expect(res).toEqual({ success: false, error: 'Duplicate color "White 2"' });
    expect(productCreate).not.toHaveBeenCalled();
  });
  it("rejects duplicate non-empty SKUs across variants before touching the DB", async () => {
    const res = await createProduct({
      ...NEW_INPUT,
      variants: [
        NEW_INPUT.variants[0],
        { ...NEW_INPUT.variants[0], color: "Black", colorSlug: "black" },
      ],
    });
    expect(res).toEqual({ success: false, error: 'Duplicate SKU "CAT-WHITE"' });
    expect(productCreate).not.toHaveBeenCalled();
  });
  it("generates a unique slug and writes variants + images + stock", async () => {
    productFindUnique.mockResolvedValueOnce(null); // slug free
    productCreate.mockResolvedValueOnce({ id: "cat-white" });
    const res = await createProduct(NEW_INPUT);

    const createArg = productCreate.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      id: "cat-white", name: "Cat White", categorySlug: "cat",
      price: 2190, originalPrice: null, description: "Soft tee", archived: false,
    });
    expect(createArg.data).not.toHaveProperty("image");
    expect(createArg.data).not.toHaveProperty("stock");
    expect(createArg.data).not.toHaveProperty("sizes");

    expect(variantDeleteMany).toHaveBeenCalledWith({ where: { productId: "cat-white" } });
    const variantArg = variantCreate.mock.calls[0][0];
    expect(variantArg.data).toMatchObject({
      productId: "cat-white", color: "White", colorSlug: "white", swatchHex: "#FFFFFF",
      sku: "CAT-WHITE", price: null, originalPrice: null, sortOrder: 0, archived: false,
    });
    expect(variantImageCreateMany).toHaveBeenCalledWith({
      data: [
        { variantId: "variant-1", url: "/products/cat-white/card/1.jpg", role: "CARD", sortOrder: 0 },
        { variantId: "variant-1", url: "/products/cat-white/detail/1.jpg", role: "DETAIL", sortOrder: 0 },
        { variantId: "variant-1", url: "/products/cat-white/detail/2.jpg", role: "DETAIL", sortOrder: 1 },
      ],
    });
    expect(variantSizeStockCreateMany).toHaveBeenCalledWith({
      data: [
        { variantId: "variant-1", size: "S", stock: 5 },
        { variantId: "variant-1", size: "M", stock: 10 },
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
  it("updates scalars, never changes slug, and rebuilds variants", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productUpdate.mockResolvedValueOnce({});
    const res = await updateProduct("cat-white", { ...NEW_INPUT, name: "Cat White v2" });
    const updArg = productUpdate.mock.calls[0][0];
    expect(updArg.where).toEqual({ id: "cat-white" });
    expect(updArg.data.name).toBe("Cat White v2");
    expect(updArg.data.id).toBeUndefined(); // slug/id never updated on field-only path
    // reconcileVariants never bulk-deletes ProductVariant rows (preserves identity
    // for OrderItem.variantId); an incoming variant with no id is newly created.
    expect(variantDeleteMany).not.toHaveBeenCalled();
    expect(variantFindMany).toHaveBeenCalledWith({ where: { productId: "cat-white", archived: false }, select: { id: true } });
    expect(variantCreate.mock.calls[0][0].data.productId).toBe("cat-white");
    expect(res).toEqual({ success: true, slug: "cat-white" });
  });

  it("reconciles: an incoming variant carrying an existing id is updated in place, not deleted+recreated", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productUpdate.mockResolvedValueOnce({});
    variantFindMany.mockResolvedValueOnce([{ id: "variant-existing" }]);

    const res = await updateProduct("cat-white", {
      ...NEW_INPUT,
      variants: [{ ...NEW_INPUT.variants[0], id: "variant-existing" }],
    });

    expect(variantDeleteMany).not.toHaveBeenCalled();
    expect(variantUpdate).toHaveBeenCalledWith({
      where: { id: "variant-existing" },
      data: expect.objectContaining({ color: "White", colorSlug: "white", archived: false }),
    });
    expect(variantCreate).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, slug: "cat-white" });
  });

  it("reconciles: a variant with no id (or an id absent from the existing set) is created", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productUpdate.mockResolvedValueOnce({});
    variantFindMany.mockResolvedValueOnce([{ id: "variant-existing" }]);
    variantCreate.mockResolvedValueOnce({ id: "variant-new" });

    const res = await updateProduct("cat-white", {
      ...NEW_INPUT,
      variants: [{ ...NEW_INPUT.variants[0], id: "unknown-id" }],
    });

    expect(variantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ productId: "cat-white", color: "White" }),
    });
    expect(res).toEqual({ success: true, slug: "cat-white" });
  });

  it("reconciles: vacates every active variant's colorSlug/sku up front, before reassigning, to avoid immediate unique-constraint collisions on rename/swap/remove+re-add", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productUpdate.mockResolvedValueOnce({});
    variantFindMany.mockResolvedValueOnce([{ id: "v-a" }, { id: "v-b" }]);

    const res = await updateProduct("cat-white", {
      ...NEW_INPUT,
      variants: [
        { ...NEW_INPUT.variants[0], id: "v-a", color: "Black", colorSlug: "black" },
        { ...NEW_INPUT.variants[0], id: "v-b", color: "White", colorSlug: "white", sku: "OTHER-SKU" },
      ],
    });

    // The vacate pass runs for every active existing variant, freeing colorSlug + sku,
    // so the mock (which doesn't enforce Postgres' immediate unique checks) still
    // demonstrates the collision-avoidance step the real DB depends on.
    const vacateCalls = variantUpdate.mock.calls.filter((c) => /^tmp-/.test(c[0].data.colorSlug ?? ""));
    expect(vacateCalls.map((c) => c[0].where.id).sort()).toEqual(["v-a", "v-b"]);
    expect(vacateCalls.every((c) => c[0].data.sku === null)).toBe(true);
    expect(res).toEqual({ success: true, slug: "cat-white" });
  });

  it("reconciles: an existing variant absent from the incoming set is archived, not deleted", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productUpdate.mockResolvedValueOnce({});
    variantFindMany.mockResolvedValueOnce([{ id: "variant-existing" }, { id: "variant-removed" }]);

    const res = await updateProduct("cat-white", {
      ...NEW_INPUT,
      variants: [{ ...NEW_INPUT.variants[0], id: "variant-existing" }],
    });

    expect(variantDeleteMany).not.toHaveBeenCalled();
    expect(variantUpdate).toHaveBeenCalledWith({
      where: { id: "variant-removed" },
      data: { archived: true, colorSlug: "archived-variant-removed", sku: null },
    });
    expect(res).toEqual({ success: true, slug: "cat-white" });
  });
});

describe("updateProduct rename", () => {
  it("renames the slug, records history, rebuilds variants under the new id, clears self-loop", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productFindFirst.mockResolvedValueOnce(null); // cat-black is free
    productUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await updateProduct("cat-white", { ...NEW_INPUT, name: "Cat Black", slug: "cat-black" });

    expect(productFindFirst).toHaveBeenCalledWith({ where: { id: "cat-black", NOT: { id: "cat-white" } } });
    const updArg = productUpdate.mock.calls[0][0];
    expect(updArg.data.id).toBe("cat-black");
    expect(updArg.data.name).toBe("Cat Black");
    // ON UPDATE CASCADE already moved existing variant rows to the new slug id;
    // reconcileVariants looks them up under newSlug and never bulk-deletes.
    expect(variantDeleteMany).not.toHaveBeenCalled();
    expect(variantFindMany).toHaveBeenCalledWith({ where: { productId: "cat-black", archived: false }, select: { id: true } });
    expect(variantCreate.mock.calls[0][0].data.productId).toBe("cat-black");
    expect(historyUpsert).toHaveBeenCalledWith({
      where: { oldSlug: "cat-white" },
      update: { currentId: "cat-black" },
      create: { oldSlug: "cat-white", currentId: "cat-black" },
    });
    expect(historyDeleteMany).toHaveBeenCalledWith({ where: { oldSlug: "cat-black" } });
    expect(res).toEqual({ success: true, slug: "cat-black" });
  });

  it("rename collides with another product: appends a numeric suffix", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });
    productFindFirst.mockResolvedValueOnce({ id: "cat-black" }).mockResolvedValueOnce(null); // cat-black taken, cat-black-2 free
    productUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await updateProduct("cat-white", { ...NEW_INPUT, name: "Cat Black", slug: "cat-black" });

    const updArg = productUpdate.mock.calls[0][0];
    expect(updArg.data.id).toBe("cat-black-2");
    expect(res).toEqual({ success: true, slug: "cat-black-2" });
  });

  it("rejects a rename to a name/slug with no slug-able characters", async () => {
    productFindUnique.mockResolvedValueOnce({ id: "cat-white" });

    const res = await updateProduct("cat-white", { ...NEW_INPUT, name: "!!!", slug: "" });

    expect(res).toEqual({ success: false, error: "Name must contain letters or numbers" });
    expect(productUpdate).not.toHaveBeenCalled();
    expect(historyUpsert).not.toHaveBeenCalled();
  });
});

describe("deleteProduct", () => {
  it("hard-deletes a product even when it has order history", async () => {
    // The DB FK is ON DELETE SET NULL, so order line items keep their snapshot
    // and lose only the product link — no application-level history guard.
    productDelete.mockResolvedValueOnce({});
    const res = await deleteProduct("cat-white");
    expect(requireAdmin).toHaveBeenCalled();
    expect(orderItemCount).not.toHaveBeenCalled(); // guard removed
    expect(productDelete).toHaveBeenCalledWith({ where: { id: "cat-white" } });
    expect(res).toEqual({ success: true });
  });
  it("returns a generic error when the delete throws", async () => {
    productDelete.mockRejectedValueOnce(new Error("db down"));
    const res = await deleteProduct("cat-white");
    expect(res).toEqual({ success: false, error: "Something went wrong. Please try again." });
  });
});
