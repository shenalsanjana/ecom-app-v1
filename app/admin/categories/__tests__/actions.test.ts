import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const {
  designCreate, designUpdate, designFindUnique, designFindFirst, designDelete,
  historyUpsert, historyDeleteMany, productCount, productUpdateMany, txn,
} = vi.hoisted(() => ({
  designCreate: vi.fn(), designUpdate: vi.fn(), designFindUnique: vi.fn(),
  designFindFirst: vi.fn(), designDelete: vi.fn(),
  historyUpsert: vi.fn(), historyDeleteMany: vi.fn(), productCount: vi.fn(),
  productUpdateMany: vi.fn(), txn: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

function makeClient() {
  return {
    design: { create: designCreate, update: designUpdate, findUnique: designFindUnique, findFirst: designFindFirst, delete: designDelete },
    designSlugHistory: { upsert: historyUpsert, deleteMany: historyDeleteMany },
    product: { count: productCount, updateMany: productUpdateMany },
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
  productUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => fn(makeClient()));
});

describe("createCategory", () => {
  it("rejects an empty name", async () => {
    expect(await createCategory({ name: "  ", image: "/x.jpg", departmentSlug: "women" }))
      .toEqual({ success: false, error: "Name is required" });
  });
  it("slugifies, ensures uniqueness, creates, and returns the slug", async () => {
    designFindUnique.mockResolvedValueOnce({ slug: "hats" }).mockResolvedValueOnce(null); // 'hats' taken, 'hats-2' free
    designCreate.mockResolvedValueOnce({ slug: "hats-2", name: "Hats" });
    const res = await createCategory({ name: "Hats", image: "/hats.jpg", departmentSlug: "women" });
    // hex is not collected by the form; it is derived from the slug.
    expect(designCreate).toHaveBeenCalledWith({
      data: {
        slug: "hats-2", name: "Hats", image: "/hats.jpg",
        departmentSlug: "women", hex: tintForSlug("hats-2"),
      },
    });
    expect(res).toEqual({ success: true, slug: "hats-2", name: "Hats" });
  });
  it("rejects a name with no slug-able characters", async () => {
    const res = await createCategory({ name: "!!!", image: "/x.jpg", departmentSlug: "women" });
    expect(res).toEqual({ success: false, error: "Name must contain letters or numbers" });
    expect(designCreate).not.toHaveBeenCalled();
  });

  // FIX 1 — image is optional and must persist as NULL, never "".
  it.each([
    ["empty string", ""],
    ["whitespace only", "   "],
    ["null", null],
    ["absent", undefined],
  ])("creates a design with no image when image is %s, persisting NULL not \"\"", async (_label, image) => {
    designFindUnique.mockResolvedValueOnce(null);
    designCreate.mockResolvedValueOnce({ slug: "tote", name: "Tote" });
    const res = await createCategory({ name: "Tote", image, departmentSlug: "accessories" });
    expect(designCreate).toHaveBeenCalledWith({
      data: {
        slug: "tote", name: "Tote", image: null,
        departmentSlug: "accessories", hex: tintForSlug("tote"),
      },
    });
    expect(res).toEqual({ success: true, slug: "tote", name: "Tote" });
  });

  // FIX 2 — the chosen department is written, not hardcoded to "women".
  it("files the design under the chosen department", async () => {
    designFindUnique.mockResolvedValueOnce(null);
    designCreate.mockResolvedValueOnce({ slug: "car", name: "Car" });
    await createCategory({ name: "Car", image: "/car.jpg", departmentSlug: "men" });
    expect(designCreate).toHaveBeenCalledWith({
      data: {
        slug: "car", name: "Car", image: "/car.jpg",
        departmentSlug: "men", hex: tintForSlug("car"),
      },
    });
  });
  it("falls back to women when no department is supplied (product-form quick-create)", async () => {
    designFindUnique.mockResolvedValueOnce(null);
    designCreate.mockResolvedValueOnce({ slug: "hats", name: "Hats" });
    await createCategory({ name: "Hats", image: "/h.jpg" });
    expect(designCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentSlug: "women" }) }),
    );
  });
});

describe("updateCategory", () => {
  it("cosmetic edit (name changes but slug doesn't): updates fields only, no history, no suffix", async () => {
    designUpdate.mockResolvedValueOnce({});
    const res = await updateCategory("cats", { name: "Cats", image: "/cats.jpg", departmentSlug: "women" }); // slugify('Cats') === 'cats'
    expect(designUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { name: "Cats", image: "/cats.jpg", departmentSlug: "women" } });
    expect(designFindFirst).not.toHaveBeenCalled();
    expect(historyUpsert).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, slug: "cats", name: "Cats" });
  });
  it("rename (slug changes): regenerates slug, records history, clears self-loop", async () => {
    designFindFirst.mockResolvedValueOnce(null); // 'kittens' free (excluding self)
    designUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });
    const res = await updateCategory("cats", { name: "Kittens", image: "/k.jpg", departmentSlug: "women" });
    expect(designFindFirst).toHaveBeenCalledWith({ where: { slug: "kittens", NOT: { slug: "cats" } } });
    expect(designUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { slug: "kittens", name: "Kittens", image: "/k.jpg", departmentSlug: "women" } });
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
    const res = await updateCategory("cats", { name: "Kittens", image: "/k.jpg", departmentSlug: "women" });
    expect(designUpdate).toHaveBeenCalledWith({ where: { slug: "cats" }, data: { slug: "kittens-2", name: "Kittens", image: "/k.jpg", departmentSlug: "women" } });
    expect(res).toEqual({ success: true, slug: "kittens-2", name: "Kittens" });
  });
  it("rejects a rename to a name with no slug-able characters", async () => {
    const res = await updateCategory("cats", { name: "!!!", image: "/k.jpg", departmentSlug: "women" });
    expect(res).toEqual({ success: false, error: "Name must contain letters or numbers" });
    expect(designUpdate).not.toHaveBeenCalled();
    expect(designFindFirst).not.toHaveBeenCalled();
  });

  // FIX 1 — a null-image design must be editable without uploading a photo.
  it("saves a design that has no image, keeping it NULL rather than \"\"", async () => {
    designUpdate.mockResolvedValueOnce({});
    const res = await updateCategory("cats", { name: "Cats", image: "", departmentSlug: "women" });
    expect(designUpdate).toHaveBeenCalledWith({
      where: { slug: "cats" },
      data: { name: "Cats", image: null, departmentSlug: "women" },
    });
    expect(res).toEqual({ success: true, slug: "cats", name: "Cats" });
  });

  // FIX 2 — the department is writable, and on both branches.
  it("moves a design to another department on a field-only edit", async () => {
    designUpdate.mockResolvedValueOnce({});
    await updateCategory("cats", { name: "Cats", image: null, departmentSlug: "men" });
    expect(designUpdate).toHaveBeenCalledWith({
      where: { slug: "cats" },
      data: { name: "Cats", image: null, departmentSlug: "men" },
    });
  });
  it("carries the department through the rename branch too", async () => {
    designFindFirst.mockResolvedValueOnce(null);
    designUpdate.mockResolvedValueOnce({});
    historyUpsert.mockResolvedValueOnce({});
    historyDeleteMany.mockResolvedValueOnce({ count: 0 });
    await updateCategory("cats", { name: "Kittens", image: null, departmentSlug: "accessories" });
    expect(designUpdate).toHaveBeenCalledWith({
      where: { slug: "cats" },
      data: { slug: "kittens", name: "Kittens", image: null, departmentSlug: "accessories" },
    });
  });
  it("rejects an update with no department rather than defaulting it to women", async () => {
    // @ts-expect-error departmentSlug is required — this guards the runtime path
    // against a caller that omits it, which would silently re-file the design.
    const res = await updateCategory("cats", { name: "Cats", image: "/c.jpg" });
    expect(res).toEqual({ success: false, error: "Name and department are required" });
    expect(designUpdate).not.toHaveBeenCalled();
  });

  // BLOCKER 1 — Product.departmentSlug is denormalised from Design.departmentSlug.
  // updateCategory is the second write path to that invariant (the first is
  // departmentForDesign in app/admin/products/actions.ts) and must re-stamp the
  // design's products, or moving a design between departments leaves every
  // product under it filed in the old department with no error.
  describe("keeps Product.departmentSlug in step with the design", () => {
    it("re-stamps the design's products on a field-only move", async () => {
      designUpdate.mockResolvedValueOnce({});
      const res = await updateCategory("cats", { name: "Cats", image: null, departmentSlug: "men" });
      expect(txn).toHaveBeenCalledTimes(1); // design + products move atomically
      expect(productUpdateMany).toHaveBeenCalledWith({
        where: { designSlug: "cats" },
        data: { departmentSlug: "men" },
      });
      expect(res).toEqual({ success: true, slug: "cats", name: "Cats" });
    });

    it("re-stamps the design's products on the rename branch, matching on the NEW slug", async () => {
      designFindFirst.mockResolvedValueOnce(null); // 'kittens' free
      designUpdate.mockResolvedValueOnce({});
      historyUpsert.mockResolvedValueOnce({});
      historyDeleteMany.mockResolvedValueOnce({ count: 0 });
      const res = await updateCategory("cats", { name: "Kittens", image: null, departmentSlug: "men" });
      // ON UPDATE CASCADE has already moved Product.designSlug to 'kittens' by
      // the time this runs, so a `where` on the old slug would match nothing.
      expect(productUpdateMany).toHaveBeenCalledWith({
        where: { designSlug: "kittens" },
        data: { departmentSlug: "men" },
      });
      expect(productUpdateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { designSlug: "cats" } }),
      );
      expect(res).toEqual({ success: true, slug: "kittens", name: "Kittens" });
    });

    it("re-stamps against the suffixed slug when the rename collides", async () => {
      designFindFirst.mockResolvedValueOnce({ slug: "kittens" }).mockResolvedValueOnce(null);
      designUpdate.mockResolvedValueOnce({});
      historyUpsert.mockResolvedValueOnce({});
      historyDeleteMany.mockResolvedValueOnce({ count: 0 });
      await updateCategory("cats", { name: "Kittens", image: null, departmentSlug: "accessories" });
      expect(productUpdateMany).toHaveBeenCalledWith({
        where: { designSlug: "kittens-2" },
        data: { departmentSlug: "accessories" },
      });
    });

    it("does not re-stamp products when the design write fails", async () => {
      designUpdate.mockRejectedValueOnce(new Error("db down"));
      const res = await updateCategory("cats", { name: "Cats", image: null, departmentSlug: "men" });
      expect(productUpdateMany).not.toHaveBeenCalled();
      expect(res).toEqual({ success: false, error: "Could not update category." });
    });
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
