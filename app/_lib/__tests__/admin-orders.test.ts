import { describe, it, expect } from "vitest";
import { buildOrderWhere } from "../admin-orders";

describe("buildOrderWhere", () => {
  it("returns empty where for the 'all' tab with no filters", () => {
    expect(buildOrderWhere({ tab: "all" })).toEqual({});
  });

  it("maps 'needs-dispatch' to CONFIRMED + not booked", () => {
    expect(buildOrderWhere({ tab: "needs-dispatch" })).toEqual({
      status: "CONFIRMED",
      courierBookedAt: null,
    });
  });

  it("maps 'pending' to status PENDING", () => {
    expect(buildOrderWhere({ tab: "pending" })).toEqual({ status: "PENDING" });
  });

  it("maps 'pending-cod' to paymentStatus COD_PENDING", () => {
    expect(buildOrderWhere({ tab: "pending-cod" })).toEqual({
      paymentStatus: "COD_PENDING",
    });
  });

  it("maps 'delivered' and 'cancelled' to status", () => {
    expect(buildOrderWhere({ tab: "delivered" })).toEqual({ status: "DELIVERED" });
    expect(buildOrderWhere({ tab: "cancelled" })).toEqual({ status: "CANCELLED" });
  });

  it("adds a case-insensitive OR search across order number, name, phone, email", () => {
    const where = buildOrderWhere({ tab: "all", q: "nimali" });
    expect(where.OR).toEqual([
      { webNumber: { contains: "nimali", mode: "insensitive" } },
      { rbNumber: { contains: "nimali", mode: "insensitive" } },
      { guestName: { contains: "nimali", mode: "insensitive" } },
      { guestEmail: { contains: "nimali", mode: "insensitive" } },
      { customerPhone: { contains: "nimali", mode: "insensitive" } },
      { user: { is: { name: { contains: "nimali", mode: "insensitive" } } } },
      { user: { is: { email: { contains: "nimali", mode: "insensitive" } } } },
    ]);
  });

  it("merges an explicit payment filter over the tab preset", () => {
    const where = buildOrderWhere({ tab: "all", payment: "PAID" });
    expect(where.paymentStatus).toBe("PAID");
  });
});

import { recomputeTotals } from "../admin-orders";

describe("recomputeTotals", () => {
  it("charges Colombo delivery below the free threshold", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo");
    expect(r).toEqual({ subtotal: 1000, shippingCost: 350, total: 1350 });
  });

  it("is free shipping at or above the threshold", () => {
    const r = recomputeTotals([{ price: 2500, quantity: 2 }], "Colombo");
    expect(r).toEqual({ subtotal: 5000, shippingCost: 0, total: 5000 });
  });

  it("charges other-zone delivery for non-Colombo cities below threshold", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Kandy");
    expect(r).toEqual({ subtotal: 1000, shippingCost: 450, total: 1450 });
  });

  it("adds a positive adjustment (charge) on top of subtotal+shipping", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo", undefined, [{ amount: 500 }]);
    expect(r).toEqual({ subtotal: 1000, shippingCost: 350, total: 1850 });
  });

  it("subtracts a negative adjustment (discount)", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo", undefined, [{ amount: -300 }]);
    expect(r).toEqual({ subtotal: 1000, shippingCost: 350, total: 1050 });
  });

  it("sums multiple adjustments", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo", undefined, [{ amount: 500 }, { amount: -200 }]);
    expect(r.total).toBe(1650);
  });

  it("clamps total at 0 when discounts exceed subtotal+shipping", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo", undefined, [{ amount: -5000 }]);
    expect(r.total).toBe(0);
  });

  it("defaults to no adjustments when the param is omitted", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo");
    expect(r.total).toBe(1350);
  });
});

import { applyItemChanges } from "../admin-orders";

const makeItems = () => [
  { id: "i1", variantId: "v1", name: "Dress", size: "M", price: 6500, quantity: 1, plainTshirtStockId: "ps1", dtfDesignId: "d1" },
  { id: "i2", variantId: "v2", name: "Scarf", size: "S", price: 2000, quantity: 2, plainTshirtStockId: "ps2", dtfDesignId: "d2" },
];

describe("applyItemChanges", () => {
  it("changes quantity in place, unflagged as a size change", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i2", quantity: 1 }]);
    const i2 = nextItems.find((i) => i.id === "i2")!;
    expect(i2.quantity).toBe(1);
    expect(i2.sizeChanged).toBe(false);
    expect(i2.plainTshirtStockId).toBe("ps2"); // frozen id carried through unchanged
  });

  it("removing an item drops it from nextItems", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i2", remove: true }]);
    expect(nextItems.map((i) => i.id)).toEqual(["i1"]);
  });

  it("a size-only change flags sizeChanged and carries the frozen plainTshirtStockId forward for the caller to re-resolve", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i1", size: "L" }]);
    const i1 = nextItems.find((i) => i.id === "i1")!;
    expect(i1.size).toBe("L");
    expect(i1.sizeChanged).toBe(true);
    expect(i1.plainTshirtStockId).toBe("ps1"); // still the OLD id — caller resolves the new one
  });

  it("a combined size+quantity change applies both and still flags sizeChanged", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i1", size: "L", quantity: 3 }]);
    const i1 = nextItems.find((i) => i.id === "i1")!;
    expect(i1.size).toBe("L");
    expect(i1.quantity).toBe(3);
    expect(i1.sizeChanged).toBe(true);
  });

  it("no size change leaves sizeChanged false even when quantity also changes", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i1", quantity: 5 }]);
    expect(nextItems.find((i) => i.id === "i1")!.sizeChanged).toBe(false);
  });

  it("rejects reducing quantity to zero (use remove instead)", () => {
    expect(() => applyItemChanges(makeItems(), [{ id: "i1", quantity: 0 }])).toThrow();
  });

  it("rejects an unknown item id", () => {
    expect(() => applyItemChanges(makeItems(), [{ id: "does-not-exist", quantity: 1 }])).toThrow("Unknown order item: does-not-exist");
  });

  it("an unchanged item passes through with sizeChanged false", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i2", quantity: 2 }]);
    const i1 = nextItems.find((i) => i.id === "i1")!;
    expect(i1).toMatchObject({ size: "M", quantity: 1, sizeChanged: false });
  });
});

import { nextStatuses, canEdit, canCancel } from "../admin-orders";

describe("status transitions", () => {
  it("allows PENDING→CONFIRMED and CONFIRMED→DELIVERED", () => {
    expect(nextStatuses("PENDING")).toEqual(["CONFIRMED"]);
    expect(nextStatuses("CONFIRMED")).toEqual(["DELIVERED"]);
  });
  it("dispatched orders can be marked delivered, and DISPATCHED is not a plain-advance target", () => {
    expect(nextStatuses("DISPATCHED")).toEqual(["DELIVERED"]);
    expect(nextStatuses("CONFIRMED")).not.toContain("DISPATCHED");
  });
  it("has no transitions from terminal states", () => {
    expect(nextStatuses("DELIVERED")).toEqual([]);
    expect(nextStatuses("CANCELLED")).toEqual([]);
  });
  it("canEdit/canCancel only for non-terminal orders", () => {
    expect(canEdit({ status: "CONFIRMED" })).toBe(true);
    expect(canCancel({ status: "PENDING" })).toBe(true);
    expect(canEdit({ status: "DELIVERED" })).toBe(false);
    expect(canCancel({ status: "CANCELLED" })).toBe(false);
  });
});

import { canConfirm } from "../admin-orders";

describe("canConfirm", () => {
  it("allows COD orders regardless of payment status", () => {
    expect(canConfirm({ paymentMethod: "COD", paymentStatus: "COD_PENDING" })).toBe(true);
    expect(canConfirm({ paymentMethod: "COD", paymentStatus: "COD_COLLECTED" })).toBe(true);
    expect(canConfirm({ paymentMethod: "COD", paymentStatus: null })).toBe(true);
  });

  it("allows online orders only once paid", () => {
    expect(canConfirm({ paymentMethod: "KOKO", paymentStatus: "PAID" })).toBe(true);
    expect(canConfirm({ paymentMethod: "PAYHERE", paymentStatus: "PAID" })).toBe(true);
  });

  it("blocks unpaid online orders", () => {
    expect(canConfirm({ paymentMethod: "KOKO", paymentStatus: "PENDING" })).toBe(false);
    expect(canConfirm({ paymentMethod: "MINTPAY", paymentStatus: null })).toBe(false);
    expect(canConfirm({ paymentMethod: "PAYHERE", paymentStatus: "PAYMENT_FAILED" })).toBe(false);
  });
});

import { signedAdjustmentAmount } from "../admin-orders";

describe("signedAdjustmentAmount", () => {
  it("keeps a charge positive", () => {
    expect(signedAdjustmentAmount("CHARGE", 500)).toBe(500);
  });
  it("negates a discount", () => {
    expect(signedAdjustmentAmount("DISCOUNT", 500)).toBe(-500);
  });
});

import { courierBookedError } from "../admin-orders";

describe("courierBookedError", () => {
  it("returns an error once the courier has been booked", () => {
    expect(courierBookedError({ courierBookedAt: new Date() }))
      .toBe("Order already sent to Curfox — cancel/rebook there to make changes.");
  });
  it("returns null when the courier has not been booked", () => {
    expect(courierBookedError({ courierBookedAt: null })).toBeNull();
  });
});
