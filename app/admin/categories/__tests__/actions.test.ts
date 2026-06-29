import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const {
  categoryCreate, categoryUpdate, categoryFindUnique, categoryFindFirst, categoryDelete,
  historyUpsert, historyDeleteMany, productCount, txn,
} = vi.hoisted(() => ({
  categoryCreate: vi.fn(), categoryUpdate: vi.fn(), categoryFindUnique: vi.fn(),
  categoryFindFirst: vi.fn(), categoryDelete: vi.fn(),
  historyUpsert: vi.fn(), historyDeleteMany: vi.fn(), productCount: vi.fn(), txn: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

function makeClient() {
  return {
    category: { create: categoryCreate, update: categoryUpdate, findUnique: categoryFindUnique, findFirst: categoryFindFirst, delete: categoryDelete },
    categorySlugHistory: { upsert: historyUpsert, deleteMany: historyDeleteMany },
    product: { count: productCount },
  };
}

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { ...makeClient(), $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(makeClient())) },
}));

import { createCategory, updateCategory, deleteCategory } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  categoryCreate.mockReset(); categoryUpdate.mockReset(); categoryFindUnique.mockReset();
  categoryFindFirst.mockReset(); categoryDelete.mockReset();
  historyUpsert.mockReset(); historyDeleteMany.mockReset(); productCount.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => fn(makeClient()));
});

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

describe("updateCategory", () => {
  it("cosmetic edit (name changes but slug doesn't): updates name/image only, no history, no suffix", async () => {
    categoryUpdate.mockResolvedValueOnce({});
    const res = await updateCategory("cats", { name: "Cats", image: "/cats.jpg" }); // slugify('Cats') === 'cats'
    expect(categoryUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { name: "Cats", image: "/cats.jpg" } });
    expect(categoryFindFirst).not.toHaveBeenCalled();
    expect(historyUpsert).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, slug: "cats", name: "Cats" });
  });
  it("rename (slug changes): regenerates slug, records history, clears self-loop", async () => {
    categoryFindFirst.mockResolvedValueOnce(null); // 'kittens' free (excluding self)
    categoryUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await updateCategory("cats", { name: "Kittens", image: "/k.jpg" });
    expect(categoryFindFirst).toHaveBeenCalledWith({ where: { slug: "kittens", NOT: { slug: "cats" } } });
    expect(categoryUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { slug: "kittens", name: "Kittens", image: "/k.jpg" } });
    expect(historyUpsert).toHaveBeenCalledWith({
      where: { oldSlug: "cats" },
      update: { currentSlug: "kittens" },
      create: { oldSlug: "cats", currentSlug: "kittens" },
    });
    expect(historyDeleteMany).toHaveBeenCalledWith({ where: { oldSlug: "kittens" } });
    expect(res).toEqual({ success: true, slug: "kittens", name: "Kittens" });
  });
  it("rename collides with a different category: appends a numeric suffix", async () => {
    categoryFindFirst.mockResolvedValueOnce({ slug: "kittens" }).mockResolvedValueOnce(null); // 'kittens' taken, 'kittens-2' free
    categoryUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await updateCategory("cats", { name: "Kittens", image: "/k.jpg" });
    expect(categoryUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { slug: "kittens-2", name: "Kittens", image: "/k.jpg" } });
    expect(res).toEqual({ success: true, slug: "kittens-2", name: "Kittens" });
  });
});

describe("deleteCategory", () => {
  it("blocks deletion when the category still has products", async () => {
    productCount.mockResolvedValueOnce(4);
    const res = await deleteCategory("cats");
    expect(productCount).toHaveBeenCalledWith({ where: { categorySlug: "cats" } });
    expect(categoryDelete).not.toHaveBeenCalled();
    expect(res).toEqual({ success: false, error: "This category has products. Reassign or remove them first." });
  });
  it("deletes an empty category", async () => {
    productCount.mockResolvedValueOnce(0);
    categoryDelete.mockResolvedValueOnce({});
    const res = await deleteCategory("cats");
    expect(categoryDelete).toHaveBeenCalledWith({ where: { slug: "cats" } });
    expect(res).toEqual({ success: true });
  });
});
