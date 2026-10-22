import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ quote: vi.fn() }));
vi.mock("@/app/_lib/discount-service", () => ({ quoteCart: mock.quote }));
import { DiscountError } from "@/app/_lib/discounts";
import { getDiscountQuote } from "../discount-actions";
const items = [{ productId: "p", variantId: "v", quantity: 1 }];
beforeEach(() => { vi.resetAllMocks(); mock.quote.mockResolvedValue({ subtotal: 10000, originalSubtotal: 10000, discount: null, prices: [] }); });
describe("public quote action", () => {
  it("returns a validated server quote", async () => {
    expect(await getDiscountQuote(items, " SAVE ")).toMatchObject({ success: true, quote: { subtotal: 10000 } });
    expect(mock.quote).toHaveBeenCalledWith(items, "SAVE", undefined);
  });
  it("validates and forwards the selected method instead of trusting arbitrary strings", async () => {
    await getDiscountQuote(items, "SAVE", "KOKO");
    expect(mock.quote).toHaveBeenLastCalledWith(items, "SAVE", "KOKO");
    expect((await getDiscountQuote(items, "SAVE", "ALL" as "COD")).success).toBe(false);
    expect(mock.quote).toHaveBeenCalledTimes(1);
  });
  it("bounds quote work and rejects invalid quantities", async () => {
    for (const value of [[], Array.from({ length: 101 }, () => items[0]), [{ ...items[0], quantity: 0 }], [{ ...items[0], quantity: 11 }], [{ ...items[0], quantity: 1.5 }]]) expect((await getDiscountQuote(value)).success).toBe(false);
    expect((await getDiscountQuote(items, "X".repeat(41))).success).toBe(false);
    expect(mock.quote).not.toHaveBeenCalled();
  });
  it("shows coupon failures without leaking internal errors", async () => {
    mock.quote.mockRejectedValueOnce(new DiscountError("This coupon has expired."));
    expect(await getDiscountQuote(items, "SAVE")).toEqual({ success: false, error: "This coupon has expired." });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mock.quote.mockRejectedValueOnce(new Error("database password private"));
    const result = await getDiscountQuote(items);
    expect(result).toEqual({ success: false, error: "Unable to check offers. Please try again." });
    expect(log).toHaveBeenCalled(); log.mockRestore();
  });
});
