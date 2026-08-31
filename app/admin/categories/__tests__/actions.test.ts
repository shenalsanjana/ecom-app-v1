import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const {
  designCreate, designUpdate, designFindUnique, designFindFirst, designDelete,
  historyUpsert, historyDeleteMany, productCount, txn,
} = vi.hoisted(() => ({
  designCreate: vi.fn(), designUpdate: vi.fn(), designFindUnique: vi.fn(),
  designFindFirst: vi.fn(), designDelete: vi.fn(),
  historyUpsert: vi.fn(), historyDeleteMany: vi.fn(), productCount: vi.fn(), txn: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

function makeClient() {
  return {
    design: { create: designCreate, update: designUpdate, findUnique: designFindUnique, findFirst: designFindFirst, delete: designDelete },
    designSlugHistory: { upsert: historyUpsert, deleteMany: historyDeleteMany },
    product: { count: productCount },
  };
}

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { ...makeClient(), $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(makeClient())) },
}));

import { createCategory, updateCategory, deleteCategory } from "../actions";
import { tintForSlug } from "@/app/_lib/taxonomy-tint";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  designCreate.mockReset(); designUpdate.mockReset(); designFindUnique.mockReset();
  designFindFirst.mockReset(); designDelete.mockReset();
  historyUpsert.mockReset(); historyDeleteMany.mockReset(); productCount.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => fn(makeClient()));
});

describe("createCategory", () => {
  it("rejects empty name or image", async () => {
    expect(await createCategory({ name: "  ", image: "/x.jpg" })).toEqual({ success: false, error: "Name and image are required" });
    expect(await createCategory({ name: "Hats", image: "" })).toEqual({ success: false, error: "Name and image are required" });
  });
  it("slugifies, ensures uniqueness, creates, and returns the slug", async () => {
    designFindUnique.mockResolvedValueOnce({ slug: "hats" }).mockResolvedValueOnce(null); // 'hats' taken, 'hats-2' free
    designCreate.mockResolvedValueOnce({ slug: "hats-2", name: "Hats" });
    const res = await createCategory({ name: "Hats", image: "/hats.jpg" });
    // departmentSlug and hex are defaulted — the form collects neither.
    expect(designCreate).toHaveBeenCalledWith({
      data: {
        slug: "hats-2", name: "Hats", image: "/hats.jpg",
        departmentSlug: "women", hex: tintForSlug("hats-2"),
      },
    });
    expect(res).toEqual({ success: true, slug: "hats-2", name: "Hats" });
  });
  it("rejects a name with no slug-able characters", async () => {
    const res = await createCategory({ name: "!!!", image: "/x.jpg" });
    expect(res).toEqual({ success: false, error: "Name must contain letters or numbers" });
    expect(designCreate).not.toHaveBeenCalled();
  });
});

describe("updateCategory", () => {
  it("cosmetic edit (name changes but slug doesn't): updates name/image only, no history, no suffix", async () => {
    designUpdate.mockResolvedValueOnce({});
    const res = await updateCategory("cats", { name: "Cats", image: "/cats.jpg" }); // slugify('Cats') === 'cats'
    expect(designUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { name: "Cats", image: "/cats.jpg" } });
    expect(designFindFirst).not.toHaveBeenCalled();
    expect(historyUpsert).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, slug: "cats", name: "Cats" });
  });
  it("rename (slug changes): regenerates slug, records history, clears self-loop", async () => {
    designFindFirst.mockResolvedValueOnce(null); // 'kittens' free (excluding self)
    designUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await updateCategory("cats", { name: "Kittens", image: "/k.jpg" });
    expect(designFindFirst).toHaveBeenCalledWith({ where: { slug: "kittens", NOT: { slug: "cats" } } });
    expect(designUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { slug: "kittens", name: "Kittens", image: "/k.jpg" } });
    expect(historyUpsert).toHaveBeenCalledWith({
      where: { oldSlug: "cats" },
      update: { currentSlug: "kittens" },
      create: { oldSlug: "cats", currentSlug: "kittens" },
    });
    expect(historyDeleteMany).toHaveBeenCalledWith({ where: { oldSlug: "kittens" } });
    expect(res).toEqual({ success: true, slug: "kittens", name: "Kittens" });
  });
  it("rename collides with a different category: appends a numeric suffix", async () => {
    designFindFirst.mockResolvedValueOnce({ slug: "kittens" }).mockResolvedValueOnce(null); // 'kittens' taken, 'kittens-2' free
    designUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await updateCategory("cats", { name: "Kittens", image: "/k.jpg" });
    expect(designUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { slug: "kittens-2", name: "Kittens", image: "/k.jpg" } });
    expect(res).toEqual({ success: true, slug: "kittens-2", name: "Kittens" });
  });
  it("rejects a rename to a name with no slug-able characters", async () => {
    const res = await updateCategory("cats", { name: "!!!", image: "/k.jpg" });
    expect(res).toEqual({ success: false, error: "Name must contain letters or numbers" });
    expect(designUpdate).not.toHaveBeenCalled();
    expect(designFindFirst).not.toHaveBeenCalled();
  });
});

describe("deleteCategory", () => {
  it("blocks deletion when the category still has products", async () => {
    productCount.mockResolvedValueOnce(4);
    const res = await deleteCategory("cats");
    expect(productCount).toHaveBeenCalledWith({ where: { designSlug: "cats" } });
    expect(designDelete).not.toHaveBeenCalled();
    expect(res).toEqual({ success: false, error: "This category has products. Reassign or remove them first." });
  });
  it("deletes an empty category", async () => {
    productCount.mockResolvedValueOnce(0);
    designDelete.mockResolvedValueOnce({});
    const res = await deleteCategory("cats");
    expect(designDelete).toHaveBeenCalledWith({ where: { slug: "cats" } });
    expect(res).toEqual({ success: true });
  });
});
