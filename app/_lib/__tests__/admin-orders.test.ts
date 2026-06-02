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
