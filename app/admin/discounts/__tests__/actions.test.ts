import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { DiscountInput } from "@/app/_lib/discounts";
const mock = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), products: vi.fn(), categories: vi.fn(), targetProducts: vi.fn(), targetCategories: vi.fn(), clearProducts: vi.fn(), clearCategories: vi.fn() }));
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: mock.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const tx = { discount: { create: mock.create, updateMany: mock.update, deleteMany: mock.remove }, product: { count: mock.products }, design: { count: mock.categories },
    discountProduct: { createMany: mock.targetProducts, deleteMany: mock.clearProducts }, discountCategory: { createMany: mock.targetCategories, deleteMany: mock.clearCategories } };
  return { prisma: { ...tx, $transaction: async (fn: (client: unknown) => unknown) => fn(tx) } };
});
import { saveDiscount, setDiscountActive, deleteDiscount } from "../actions";
import { revalidateTag } from "next/cache";
const input: DiscountInput = { name: "Summer", code: " summer ", type: "PERCENTAGE", scope: "STORE", value: 12.5, active: true, startsAt: null, expiresAt: null, usageLimit: 10, minimumOrder: 1000, maximumDiscount: 500, productIds: [], categorySlugs: [] };
beforeEach(() => {
  vi.resetAllMocks(); mock.auth.mockResolvedValue({ user: { id: "admin" } }); mock.create.mockResolvedValue({ id: "d1" }); mock.update.mockResolvedValue({ count: 1 }); mock.remove.mockResolvedValue({ count: 1 });
});
describe("discount admin actions", () => {
  it("saves one or multiple payment methods and normalizes All without broadening omitted edits", async () => {
    await saveDiscount(null, null, { ...input, paymentMethods: ["PAYHERE", "KOKO", "PAYHERE"] });
    expect(mock.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ paymentMethods: ["PAYHERE", "KOKO"] }) });
    await saveDiscount(null, null, { ...input, paymentMethods: ["ALL"] });
    expect(mock.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ paymentMethods: [] }) });
    await saveDiscount(null, null, { ...input, paymentMethods: ["COD", "PAYHERE", "KOKO", "MINTPAY"] });
    expect(mock.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ paymentMethods: [] }) });
    await saveDiscount("d1", 3, input);
    expect(mock.update.mock.calls.at(-1)?.[0].data).not.toHaveProperty("paymentMethods");
    await saveDiscount("d1", 4, { ...input, paymentMethods: ["ALL"] });
    expect(mock.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentMethods: [] }) }));
  });
  it("keeps coupons private by default and publishes only with an explicit choice", async () => {
    await saveDiscount(null, null, input);
    expect(mock.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ publicOffer: false }) });
    await saveDiscount(null, null, { ...input, publicOffer: true });
    expect(mock.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ publicOffer: true }) });
    await saveDiscount(null, null, { ...input, code: "", publicOffer: true });
    expect(mock.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ code: null, publicOffer: false }) });
    expect(revalidateTag).toHaveBeenCalledWith("promotions", { expire: 0 });
  });
  it("converts LKR and percentages to integers and normalizes coupon codes", async () => {
    expect(await saveDiscount(null, null, input)).toEqual({ success: true });
    expect(mock.create).toHaveBeenCalledWith({ data: expect.objectContaining({ code: "SUMMER", value: 1250, minimumOrder: 100000, maximumDiscount: 50000 }) });
  });
  it.each(["PRODUCTS", "CATEGORIES"] as const)("creates validated %s targets", async scope => {
    mock.products.mockResolvedValue(1); mock.categories.mockResolvedValue(1);
    expect((await saveDiscount(null, null, { ...input, scope, productIds: ["p1", "p1"], categorySlugs: ["tees", "tees"] })).success).toBe(true);
    if (scope === "PRODUCTS") expect(mock.targetProducts).toHaveBeenCalledWith({ data: [{ discountId: "d1", productId: "p1" }] });
    else expect(mock.targetCategories).toHaveBeenCalledWith({ data: [{ discountId: "d1", designSlug: "tees" }] });
  });
  it("rejects missing targets and invalid percentage values", async () => {
    mock.products.mockResolvedValue(0);
    expect((await saveDiscount(null, null, { ...input, scope: "PRODUCTS", productIds: ["missing"] })).success).toBe(false);
    expect((await saveDiscount(null, null, { ...input, value: 101 })).success).toBe(false);
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("edits using an optimistic version and never resets usage", async () => {
    expect((await saveDiscount("d1", 3, input)).success).toBe(true);
    expect(mock.update).toHaveBeenCalledWith({ where: { id: "d1", version: 3, usedCount: { lte: 10 } }, data: expect.objectContaining({ version: { increment: 1 } }) });
    expect(mock.update.mock.calls[0][0].data).not.toHaveProperty("usedCount");
    expect(mock.clearProducts).toHaveBeenCalled(); expect(mock.clearCategories).toHaveBeenCalled();
  });
  it("rejects stale updates", async () => {
    mock.update.mockResolvedValue({ count: 0 });
    expect((await saveDiscount("d1", 0, input)).success).toBe(false);
    expect(mock.clearProducts).not.toHaveBeenCalled();
  });
  it("does not lower a usage limit below recorded uses", async () => {
    mock.update.mockResolvedValue({ count: 0 });
    const result = await saveDiscount("d1", 3, { ...input, usageLimit: 1 });
    expect(result).toEqual({ success: false, error: expect.stringContaining("usage limit") });
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d1", version: 3, usedCount: { lte: 1 } } }));
    expect(mock.clearProducts).not.toHaveBeenCalled();
  });
  it("allows changing a limited offer to unlimited without resetting usage", async () => {
    expect(await saveDiscount("d1", 3, { ...input, usageLimit: null })).toEqual({ success: true });
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d1", version: 3 } }));
    expect(mock.update.mock.calls[0][0].data).not.toHaveProperty("usedCount");
  });
  it("reports duplicate codes", async () => {
    mock.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
    expect(await saveDiscount(null, null, input)).toEqual({ success: false, error: "That coupon code is already in use." });
  });
  it("activates, deactivates and deletes with a version guard", async () => {
    expect((await setDiscountActive("d1", 0, true)).success).toBe(true);
    expect((await setDiscountActive("d1", 1, false)).success).toBe(true);
    expect((await deleteDiscount("d1", 2)).success).toBe(true);
    expect(mock.remove).toHaveBeenCalledWith({ where: { id: "d1", version: 2 } });
  });
  it("reports stale activation and deletion without claiming success", async () => {
    mock.update.mockResolvedValue({ count: 0 }); mock.remove.mockResolvedValue({ count: 0 });
    expect(await setDiscountActive("d1", 0, true)).toEqual({ success: false, error: expect.stringContaining("changed") });
    expect(await deleteDiscount("d1", 0)).toEqual({ success: false, error: expect.stringContaining("changed") });
  });
  it("handles activation and deletion database failures", async () => {
    mock.update.mockRejectedValue(new Error("database unavailable")); mock.remove.mockRejectedValue(new Error("database unavailable"));
    expect(await setDiscountActive("d1", 0, true)).toEqual({ success: false, error: "Could not update this offer. Try again." });
    expect(await deleteDiscount("d1", 0)).toEqual({ success: false, error: "Could not delete this offer." });
  });
  it("rejects missing identifiers rather than updating or deleting every offer", async () => {
    expect((await setDiscountActive(undefined as unknown as string, 0, true)).success).toBe(false);
    expect((await deleteDiscount(undefined as unknown as string, undefined as unknown as number)).success).toBe(false);
    expect((await saveDiscount("d1", null, input)).success).toBe(false);
    expect(mock.update).not.toHaveBeenCalled(); expect(mock.remove).not.toHaveBeenCalled();
  });
  it("requires admin access before every mutation", async () => {
    mock.auth.mockRejectedValue(new Error("denied"));
    for (const fn of [() => saveDiscount(null, null, input), () => setDiscountActive("d1", 0, true), () => deleteDiscount("d1", 0)]) await expect(fn()).rejects.toThrow("denied");
    expect(mock.create).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled(); expect(mock.remove).not.toHaveBeenCalled();
  });
});
