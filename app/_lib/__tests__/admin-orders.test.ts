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
});

import { applyItemChanges } from "../admin-orders";

const makeItems = () => [
  { id: "i1", variantId: "v1", name: "Dress", size: "M", price: 6500, quantity: 1 },
  { id: "i2", variantId: "v2", name: "Scarf", size: "S", price: 2000, quantity: 2 },
];

describe("applyItemChanges", () => {
  it("decreasing quantity restores stock (positive delta)", () => {
    const { nextItems, stockDeltas } = applyItemChanges(makeItems(), [{ id: "i2", quantity: 1 }]);
    expect(nextItems.find((i) => i.id === "i2")!.quantity).toBe(1);
    expect(stockDeltas).toEqual([{ variantId: "v2", size: "S", delta: 1 }]);
  });

  it("increasing quantity decrements stock (negative delta)", () => {
    const { stockDeltas } = applyItemChanges(makeItems(), [{ id: "i1", quantity: 3 }]);
    expect(stockDeltas).toEqual([{ variantId: "v1", size: "M", delta: -2 }]);
  });

  it("removing an item restores its full quantity and drops it", () => {
    const { nextItems, stockDeltas } = applyItemChanges(makeItems(), [{ id: "i2", remove: true }]);
    expect(nextItems.map((i) => i.id)).toEqual(["i1"]);
    expect(stockDeltas).toEqual([{ variantId: "v2", size: "S", delta: 2 }]);
  });

  it("size-only change moves the whole line between (variant,size) cells", () => {
    const { nextItems, stockDeltas } = applyItemChanges(makeItems(), [{ id: "i1", size: "L" }]);
    expect(nextItems.find((i) => i.id === "i1")!.size).toBe("L");
    // Old cell (v1,M) restored by the full old quantity; new cell (v1,L) taken by
    // the full (unchanged) quantity — never left as a no-op.
    expect(stockDeltas).toEqual([
      { variantId: "v1", size: "M", delta: 1 },
      { variantId: "v1", size: "L", delta: -1 },
    ]);
  });

  it("combined size+quantity change moves the new quantity into the new cell", () => {
    const { nextItems, stockDeltas } = applyItemChanges(makeItems(), [{ id: "i1", size: "L", quantity: 3 }]);
    expect(nextItems.find((i) => i.id === "i1")!.size).toBe("L");
    expect(nextItems.find((i) => i.id === "i1")!.quantity).toBe(3);
    expect(stockDeltas).toEqual([
      { variantId: "v1", size: "M", delta: 1 }, // full old quantity restored to the old cell
      { variantId: "v1", size: "L", delta: -3 }, // full new quantity taken from the new cell
    ]);
  });

  it("a size change on a hard-deleted (null variantId) item emits no delta", () => {
    // No variant to key a stock cell on, old or new — nothing to restore or decrement.
    const items = [{ id: "i1", variantId: null, name: "Gone", size: "M", price: 6500, quantity: 2 }];
    const { nextItems, stockDeltas } = applyItemChanges(items, [{ id: "i1", size: "L" }]);
    expect(nextItems.find((i) => i.id === "i1")!.size).toBe("L");
    expect(stockDeltas).toEqual([]);
  });

  it("moving a sizeless item (null size) onto a real size only decrements the new cell", () => {
    // Old cell has no size, so nothing to restore there; the new cell is a real
    // (variant,size) pair and must be decremented like any other size change.
    const items = [{ id: "i2", variantId: "v2", name: "Scarf", size: null, price: 2000, quantity: 2 }];
    const { nextItems, stockDeltas } = applyItemChanges(items, [{ id: "i2", size: "M" }]);
    expect(nextItems.find((i) => i.id === "i2")!.size).toBe("M");
    expect(stockDeltas).toEqual([{ variantId: "v2", size: "M", delta: -2 }]);
  });

  it("rejects reducing quantity to zero (use remove instead)", () => {
    expect(() => applyItemChanges(makeItems(), [{ id: "i1", quantity: 0 }])).toThrow();
  });

  it("skips stock deltas for an item with no variant (hard-deleted) or no size (sizeless)", () => {
    // Variant hard-deleted while the order is still live → variantId is null.
    // A sizeless variant has no size-stock cell at all. Neither can be
    // restored/decremented, so they must never enter deltas (a null/undefined
    // key would later try updateMany({ variantId: null }) and mis-fire).
    const items = [
      { id: "i1", variantId: null, name: "Gone", size: "M", price: 6500, quantity: 2 },
      { id: "i2", variantId: "v2", name: "Scarf", size: null, price: 2000, quantity: 2 },
      { id: "i3", variantId: "v3", name: "Live", size: "M", price: 3000, quantity: 1 },
    ];
    const { nextItems, stockDeltas } = applyItemChanges(items, [
      { id: "i1", remove: true },
      { id: "i2", quantity: 1 },
      { id: "i3", quantity: 2 },
    ]);
    expect(nextItems.map((i) => i.id)).toEqual(["i2", "i3"]);
    expect(stockDeltas).toEqual([{ variantId: "v3", size: "M", delta: -1 }]); // only the live variant+size
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
