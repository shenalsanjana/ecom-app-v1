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

  it("merges explicit status/payment filters over the tab preset", () => {
    const where = buildOrderWhere({ tab: "all", status: "PENDING", payment: "PAID" });
    expect(where.status).toBe("PENDING");
    expect(where.paymentStatus).toBe("PAID");
  });

  it("drops the needs-dispatch courierBookedAt constraint when status is overridden", () => {
    const where = buildOrderWhere({ tab: "needs-dispatch", status: "PENDING" });
    expect(where.status).toBe("PENDING");
    expect(where.courierBookedAt).toBeUndefined();
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
});

import { applyItemChanges } from "../admin-orders";

const makeItems = () => [
  { id: "i1", productId: "p1", name: "Dress", size: "M", price: 6500, quantity: 1 },
  { id: "i2", productId: "p2", name: "Scarf", size: null, price: 2000, quantity: 2 },
];

describe("applyItemChanges", () => {
  it("decreasing quantity restores stock (positive delta)", () => {
    const { nextItems, stockDeltas } = applyItemChanges(makeItems(), [{ id: "i2", quantity: 1 }]);
    expect(nextItems.find((i) => i.id === "i2")!.quantity).toBe(1);
    expect(stockDeltas).toEqual({ p2: 1 });
  });

  it("increasing quantity decrements stock (negative delta)", () => {
    const { stockDeltas } = applyItemChanges(makeItems(), [{ id: "i1", quantity: 3 }]);
    expect(stockDeltas).toEqual({ p1: -2 });
  });

  it("removing an item restores its full quantity and drops it", () => {
    const { nextItems, stockDeltas } = applyItemChanges(makeItems(), [{ id: "i2", remove: true }]);
    expect(nextItems.map((i) => i.id)).toEqual(["i1"]);
    expect(stockDeltas).toEqual({ p2: 2 });
  });

  it("changes size without affecting stock", () => {
    const { nextItems, stockDeltas } = applyItemChanges(makeItems(), [{ id: "i1", size: "L" }]);
    expect(nextItems.find((i) => i.id === "i1")!.size).toBe("L");
    expect(stockDeltas).toEqual({});
  });

  it("rejects reducing quantity to zero (use remove instead)", () => {
    expect(() => applyItemChanges(makeItems(), [{ id: "i1", quantity: 0 }])).toThrow();
  });
});

import { nextStatuses, canEdit, canCancel } from "../admin-orders";

describe("status transitions", () => {
  it("allows PENDING→CONFIRMED and CONFIRMED→DELIVERED", () => {
    expect(nextStatuses("PENDING")).toEqual(["CONFIRMED"]);
    expect(nextStatuses("CONFIRMED")).toEqual(["DELIVERED"]);
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
