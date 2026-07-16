import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const {
  orderFindUnique, orderUpdate, orderDelete, noteCreate, plainStockUpdateMany, plainStockFindUnique,
  dtfDesignUpdateMany, txn, orderAdjustmentCreate, orderAdjustmentDelete, productFindMany, variantFindUnique,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderDelete: vi.fn(),
  noteCreate: vi.fn(),
  plainStockUpdateMany: vi.fn(),
  plainStockFindUnique: vi.fn(),
  dtfDesignUpdateMany: vi.fn(),
  txn: vi.fn(),
  orderAdjustmentCreate: vi.fn(),
  orderAdjustmentDelete: vi.fn(),
  productFindMany: vi.fn(),
  variantFindUnique: vi.fn(),
}));
const { orderItemUpdate, orderItemDelete, orderItemCreate } = vi.hoisted(() => ({
  orderItemUpdate: vi.fn(),
  orderItemDelete: vi.fn(),
  orderItemCreate: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/store-settings", () => ({
  getDeliveryConfig: vi.fn().mockResolvedValue({ colombo: 350, other: 450, freeThreshold: 5000 }),
}));

const { bookCourierAndNotify } = vi.hoisted(() => ({ bookCourierAndNotify: vi.fn() }));
vi.mock("@/app/checkout/book-courier", () => ({ bookCourierAndNotify }));
const { sendOrderConfirmationEmail, sendCustomerDispatchEmail, sendCustomerCancellationEmail, logMailerError } = vi.hoisted(() => ({
  sendOrderConfirmationEmail: vi.fn(),
  sendCustomerDispatchEmail: vi.fn(),
  sendCustomerCancellationEmail: vi.fn(),
  logMailerError: vi.fn(),
}));
vi.mock("@/app/_lib/mailer", () => ({ sendOrderConfirmationEmail, sendCustomerDispatchEmail, sendCustomerCancellationEmail, logMailerError }));

const { notifyOrderDispatched, notifyOrderCancelled } = vi.hoisted(() => ({
  notifyOrderDispatched: vi.fn(),
  notifyOrderCancelled: vi.fn(),
}));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderDispatched, notifyOrderCancelled }));

vi.mock("@/app/_lib/prisma", () => {
  const client = {
    order: { findUnique: orderFindUnique, update: orderUpdate, delete: orderDelete },
    orderNote: { create: noteCreate },
    plainTshirtStock: { updateMany: plainStockUpdateMany, findUnique: plainStockFindUnique },
    dtfDesign: { updateMany: dtfDesignUpdateMany },
    orderItem: { update: orderItemUpdate, delete: orderItemDelete, create: orderItemCreate },
    orderAdjustment: { create: orderAdjustmentCreate, delete: orderAdjustmentDelete },
    product: { findMany: productFindMany },
    productVariant: { findUnique: variantFindUnique },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(client)) } };
});

import { addNote, markCodCollected } from "../actions";

beforeEach(() => {
  process.env.ROYAL_EXPRESS_ENABLED = "true";
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  orderFindUnique.mockReset();
  orderUpdate.mockReset();
  orderDelete.mockReset();
  noteCreate.mockReset();
  plainStockUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  plainStockFindUnique.mockReset();
  dtfDesignUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  orderItemUpdate.mockReset();
  orderItemDelete.mockReset();
  orderItemCreate.mockReset();
  orderAdjustmentCreate.mockReset();
  orderAdjustmentDelete.mockReset();
  productFindMany.mockReset();
  variantFindUnique.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => {
    const client = {
      order: { findUnique: orderFindUnique, update: orderUpdate, delete: orderDelete },
      orderNote: { create: noteCreate },
      plainTshirtStock: { updateMany: plainStockUpdateMany, findUnique: plainStockFindUnique },
      dtfDesign: { updateMany: dtfDesignUpdateMany },
      orderItem: { update: orderItemUpdate, delete: orderItemDelete, create: orderItemCreate },
      orderAdjustment: { create: orderAdjustmentCreate, delete: orderAdjustmentDelete },
      product: { findMany: productFindMany },
      productVariant: { findUnique: variantFindUnique },
    };
    return fn(client);
  });
  bookCourierAndNotify.mockReset();
  sendOrderConfirmationEmail.mockReset();
  sendCustomerDispatchEmail.mockReset();
  sendCustomerCancellationEmail.mockReset();
  logMailerError.mockReset();
  notifyOrderDispatched.mockReset();
  notifyOrderCancelled.mockReset();
});

describe("addNote", () => {
  it("requires admin and rejects empty body", async () => {
    const res = await addNote("o1", "   ");
    expect(requireAdmin).toHaveBeenCalled();
    expect(res).toEqual({ success: false, error: "Note cannot be empty" });
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("creates a note attributed to the admin", async () => {
    noteCreate.mockResolvedValueOnce({});
    const res = await addNote("o1", "Deliver after 5pm");
    expect(noteCreate).toHaveBeenCalledWith({
      data: { orderId: "o1", authorEmail: "admin@x.test", body: "Deliver after 5pm" },
    });
    expect(res).toEqual({ success: true });
  });
});

describe("markCodCollected", () => {
  it("only works for COD orders pending collection", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", paymentMethod: "PAYHERE", paymentStatus: "PAID" });
    const res = await markCodCollected("o1");
    expect(res).toEqual({ success: false, error: "Not a COD order awaiting collection" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("sets paymentStatus to COD_COLLECTED", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", paymentMethod: "COD", paymentStatus: "COD_PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await markCodCollected("o1");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { paymentStatus: "COD_COLLECTED" } });
    expect(res).toEqual({ success: true });
  });
});

import { advanceStatus } from "../actions";

describe("advanceStatus", () => {
  it("rejects an illegal transition", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING" });
    const res = await advanceStatus("o1", "DELIVERED");
    expect(res).toEqual({ success: false, error: "Cannot move order from PENDING to DELIVERED" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("allows PENDING→CONFIRMED for a paid order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PAID" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await advanceStatus("o1", "CONFIRMED");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res).toEqual({ success: true });
  });

  it("blocks confirming an unpaid online order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PENDING" });
    const res = await advanceStatus("o1", "CONFIRMED");
    expect(res).toEqual({ success: false, error: "Awaiting payment — confirm online orders only after payment." });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("confirms an unpaid online order when allowUnpaid is set", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await advanceStatus("o1", "CONFIRMED", { allowUnpaid: true });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res).toEqual({ success: true });
  });

  it("allows confirming a COD order awaiting collection", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "COD", paymentStatus: "COD_PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await advanceStatus("o1", "CONFIRMED");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res).toEqual({ success: true });
  });
});

import { cancelOrder } from "../actions";

describe("cancelOrder", () => {
  it("is idempotent — rejects an already-cancelled order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CANCELLED", items: [] });
    const res = await cancelOrder("o1");
    expect(res).toEqual({ success: false, error: "Order is already cancelled" });
  });

  it("rejects cancelling a delivered order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "DELIVERED", items: [] });
    const res = await cancelOrder("o1");
    expect(res).toEqual({ success: false, error: "Delivered orders cannot be cancelled" });
  });

  it("restores both pools and warns when the order was paid", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "PAID",
      items: [{ plainTshirtStockId: "ps1", dtfDesignId: "d1", quantity: 2 }],
      adjustments: [],
    });
    const res = await cancelOrder("o1");
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { quantity: { increment: 2 } } });
    expect(dtfDesignUpdateMany).toHaveBeenCalledWith({ where: { id: "d1" }, data: { quantity: { increment: 2 } } });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res).toEqual({ success: true, warning: "Order was paid — refund must be handled manually." });
  });

  it("skips a pool whose id is null (sizeless item, or an order predating this feature)", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "PENDING",
      guestName: null, guestEmail: null, user: null,
      items: [
        { plainTshirtStockId: null, dtfDesignId: null, name: "Gone", size: "M", price: 6500, quantity: 2 },
        { plainTshirtStockId: null, dtfDesignId: "d2", name: "Scarf", size: null, price: 2000, quantity: 3 },
        { plainTshirtStockId: "ps1", dtfDesignId: "d1", name: "Dress", size: "M", price: 1000, quantity: 1 },
      ],
      adjustments: [],
    });
    const res = await cancelOrder("o1");
    expect(plainStockUpdateMany).toHaveBeenCalledTimes(1);
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { quantity: { increment: 1 } } });
    expect(dtfDesignUpdateMany).toHaveBeenCalledTimes(2); // items 2 and 3 both carry a dtfDesignId
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res).toEqual({ success: true });
  });

  it("emails the customer that their order was cancelled", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "COD_PENDING",
      guestName: "Nimali", guestEmail: "n@x.test", user: null,
      webNumber: "WEB1", rbNumber: null, trackingCode: null,
      items: [{ plainTshirtStockId: "ps1", dtfDesignId: "d1", name: "Dress", size: "M", price: 1000, quantity: 1 }],
      adjustments: [],
    });
    const res = await cancelOrder("o1");
    expect(notifyOrderCancelled).toHaveBeenCalledTimes(1);
    expect(notifyOrderCancelled.mock.calls[0][0].customerEmail).toBe("n@x.test");
    expect(res).toEqual({ success: true });
  });

  it("does not email when the order has no customer email", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "COD_PENDING",
      guestName: null, guestEmail: null, user: null,
      items: [{ plainTshirtStockId: "ps1", dtfDesignId: "d1", name: "Dress", size: "M", price: 1000, quantity: 1 }],
      adjustments: [],
    });
    await cancelOrder("o1");
    expect(notifyOrderCancelled).toHaveBeenCalledTimes(1);
  });
});

import { editItems } from "../actions";

describe("editItems", () => {
  const ORDER = {
    id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", shippingCity: "Colombo",
    items: [
      { id: "i1", variantId: "v1", name: "Dress", size: "M", price: 2000, quantity: 2, plainTshirtStockId: "ps1", dtfDesignId: "d1" },
    ],
  };

  it("rejects editing a cancelled order", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, status: "CANCELLED" });
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    expect(res).toEqual({ success: false, error: "This order can no longer be edited" });
  });

  it("decreasing quantity restores the full original quantity then reacquires the new one, recomputing totals", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    orderUpdate.mockResolvedValueOnce({});
    orderItemUpdate.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    expect(plainStockUpdateMany).toHaveBeenNthCalledWith(1, { where: { id: "ps1" }, data: { quantity: { increment: 2 } } });
    expect(plainStockUpdateMany).toHaveBeenNthCalledWith(2, { where: { id: "ps1", quantity: { gte: 1 } }, data: { quantity: { decrement: 1 } } });
    expect(orderItemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { quantity: 1, size: "M", plainTshirtStockId: "ps1" } });
    // subtotal 2000 (qty 2→1 at price 2000), Colombo, below the 5000 free-shipping threshold → 350 shipping
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 2000, shippingCost: 350, total: 2350 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("remove path: deletes the item and restores its full quantity, recomputing totals to zero subtotal", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    orderUpdate.mockResolvedValueOnce({});
    orderItemDelete.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", remove: true }]);
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { quantity: { increment: 2 } } });
    expect(dtfDesignUpdateMany).toHaveBeenCalledWith({ where: { id: "d1" }, data: { quantity: { increment: 2 } } });
    expect(orderItemDelete).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 0 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("fails the increase when the reacquire has insufficient plain-tee stock", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    plainStockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // the restore call always succeeds
      .mockResolvedValueOnce({ count: 0 }); // the reacquire at the higher quantity fails
    const res = await editItems("o1", [{ id: "i1", quantity: 10 }]);
    expect(res).toEqual({ success: false, error: 'Insufficient stock for "Dress"' });
    expect(orderItemUpdate).not.toHaveBeenCalled();
  });

  it("a size change resolves the new color+size pool from the frozen row's colorSlug, not the variant's current color", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    plainStockFindUnique
      .mockResolvedValueOnce({ colorSlug: "white" }) // lookup of the OLD pool row's colorSlug, by id "ps1"
      .mockResolvedValueOnce({ id: "ps-white-l" });   // lookup of the NEW (white, L) pool row
    orderUpdate.mockResolvedValueOnce({});
    orderItemUpdate.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", size: "L" }]);
    expect(plainStockFindUnique).toHaveBeenNthCalledWith(1, { where: { id: "ps1" }, select: { colorSlug: true } });
    expect(plainStockFindUnique).toHaveBeenNthCalledWith(2, { where: { colorSlug_size: { colorSlug: "white", size: "L" } }, select: { id: true } });
    expect(orderItemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { quantity: 2, size: "L", plainTshirtStockId: "ps-white-l" } });
    expect(res).toEqual({ success: true });
  });

  it("rejects a size change when the target color+size has no matching pool row", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    plainStockFindUnique
      .mockResolvedValueOnce({ colorSlug: "white" })
      .mockResolvedValueOnce(null); // no (white, XXL) pool row exists
    const res = await editItems("o1", [{ id: "i1", size: "XXL" }]);
    expect(res).toEqual({ success: false, error: 'Size "XXL" is not available for "Dress"' });
    expect(orderItemUpdate).not.toHaveBeenCalled();
  });

  it("restores every original line's pool before reacquiring any surviving line's pool (cross-item netting)", async () => {
    // Two lines share one plain-tee pool row (same color+size, two different
    // designs) with zero headroom above what this order already holds. An
    // interleaved restore/acquire-per-item loop would fail here even though
    // total demand is unchanged; the correct restore-all-then-reacquire-all
    // ordering must succeed.
    const SHARED_ORDER = {
      id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", shippingCity: "Colombo",
      items: [
        { id: "i1", variantId: "v1", name: "A", size: "M", price: 1000, quantity: 2, plainTshirtStockId: "ps-shared", dtfDesignId: "d1" },
        { id: "i2", variantId: "v2", name: "B", size: "M", price: 1000, quantity: 3, plainTshirtStockId: "ps-shared", dtfDesignId: "d2" },
      ],
    };
    orderFindUnique.mockResolvedValueOnce(SHARED_ORDER);
    orderUpdate.mockResolvedValueOnce({});
    orderItemUpdate.mockResolvedValue({});

    let poolQty = 0; // fully consumed by the original order (2 + 3 = 5, no free headroom)
    plainStockUpdateMany.mockReset().mockImplementation(async ({ data }: { data: { quantity: { increment?: number; decrement?: number } } }) => {
      if (data.quantity.increment !== undefined) {
        poolQty += data.quantity.increment;
        return { count: 1 };
      }
      const dec = data.quantity.decrement!;
      if (poolQty < dec) return { count: 0 };
      poolQty -= dec;
      return { count: 1 };
    });

    // Swap quantities (net pool demand unchanged: 3+2 === 2+3).
    const res = await editItems("o1", [
      { id: "i1", quantity: 3 },
      { id: "i2", quantity: 2 },
    ]);

    expect(res).toEqual({ success: true });
  });

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, courierBookedAt: new Date() });
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("includes existing adjustments when recomputing totals", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, adjustments: [{ id: "a1", amount: 500 }] });
    orderUpdate.mockResolvedValueOnce({});
    orderItemUpdate.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    // subtotal 2000 (qty 1 @ 2000), Colombo shipping 350, +500 adjustment = 2850
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 2000, shippingCost: 350, total: 2850 }),
    }));
    expect(res).toEqual({ success: true });
  });
});

import { editAddress } from "../actions";

const ADDR = { line1: "1 New Rd", line2: "", city: "Kandy", country: "Sri Lanka" };

describe("editAddress", () => {
  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CONFIRMED", courierBookedAt: new Date(), items: [] });
    const res = await editAddress("o1", ADDR);
    expect(res).toEqual({ success: false, error: "Address already sent to Curfox — cancel/rebook there." });
  });

  it("updates fields and recomputes shipping for the new city", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", courierBookedAt: null,
      items: [{ price: 1000, quantity: 1 }],
    });
    orderUpdate.mockResolvedValueOnce({});
    const res = await editAddress("o1", ADDR);
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: expect.objectContaining({
        shippingLine1: "1 New Rd", shippingCity: "Kandy", shippingCountry: "Sri Lanka",
        shippingCost: 450, total: 1450,
      }),
    });
    expect(res).toEqual({ success: true });
  });

  it("includes existing adjustments when recomputing totals for the new city", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", courierBookedAt: null,
      items: [{ price: 1000, quantity: 1 }],
      adjustments: [{ amount: -200 }],
    });
    orderUpdate.mockResolvedValueOnce({});
    const res = await editAddress("o1", ADDR);
    // subtotal 1000, Kandy shipping 450, -200 adjustment = 1250
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ shippingCost: 450, total: 1250 }),
    }));
    expect(res).toEqual({ success: true });
  });
});

import { addAdjustment } from "../actions";

describe("addAdjustment", () => {
  const BASE = { id: "o1", status: "CONFIRMED", courierBookedAt: null, paymentStatus: "PENDING",
    shippingCity: "Colombo", items: [{ price: 1000, quantity: 1 }], adjustments: [] };

  it("rejects a blank label", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    const res = await addAdjustment("o1", { label: "  ", amount: 500, kind: "CHARGE" });
    expect(res).toEqual({ success: false, error: "Enter a label and a positive amount" });
    expect(orderAdjustmentCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    const res = await addAdjustment("o1", { label: "Rush fee", amount: 0, kind: "CHARGE" });
    expect(res.success).toBe(false);
    expect(orderAdjustmentCreate).not.toHaveBeenCalled();
  });

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, courierBookedAt: new Date() });
    const res = await addAdjustment("o1", { label: "Rush fee", amount: 500, kind: "CHARGE" });
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
  });

  it("stores a charge as a positive amount and recomputes total", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    orderAdjustmentCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});
    const res = await addAdjustment("o1", { label: "Rush fee", amount: 500, kind: "CHARGE" });
    expect(orderAdjustmentCreate).toHaveBeenCalledWith({ data: { orderId: "o1", label: "Rush fee", amount: 500 } });
    // subtotal 1000, Colombo shipping 350, +500 = 1850
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" }, data: expect.objectContaining({ total: 1850 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("stores a discount as a negative amount", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    orderAdjustmentCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});
    const res = await addAdjustment("o1", { label: "Loyalty discount", amount: 200, kind: "DISCOUNT" });
    expect(orderAdjustmentCreate).toHaveBeenCalledWith({ data: { orderId: "o1", label: "Loyalty discount", amount: -200 } });
    expect(res).toEqual({ success: true });
  });

  it("warns when the order was already paid", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, paymentStatus: "PAID" });
    orderAdjustmentCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});
    const res = await addAdjustment("o1", { label: "Rush fee", amount: 500, kind: "CHARGE" });
    expect(res).toEqual({ success: true, warning: "Order was paid — any price difference must be settled manually." });
  });
});

import { removeAdjustment } from "../actions";

describe("removeAdjustment", () => {
  const BASE = { id: "o1", status: "CONFIRMED", courierBookedAt: null, paymentStatus: "PENDING",
    shippingCity: "Colombo", items: [{ price: 1000, quantity: 1 }],
    adjustments: [{ id: "a1", amount: 500 }, { id: "a2", amount: -100 }] };

  it("rejects an unknown adjustment id", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    const res = await removeAdjustment("o1", "does-not-exist");
    expect(res).toEqual({ success: false, error: "Adjustment not found" });
    expect(orderAdjustmentDelete).not.toHaveBeenCalled();
  });

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, courierBookedAt: new Date() });
    const res = await removeAdjustment("o1", "a1");
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
  });

  it("deletes the row and recomputes total from the remaining adjustments", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    orderAdjustmentDelete.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});
    const res = await removeAdjustment("o1", "a1");
    expect(orderAdjustmentDelete).toHaveBeenCalledWith({ where: { id: "a1" } });
    // subtotal 1000, Colombo shipping 350, remaining adjustment -100 = 1250
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" }, data: expect.objectContaining({ total: 1250 }),
    }));
    expect(res).toEqual({ success: true });
  });
});

import { bookCourier, resendConfirmationEmail } from "../actions";

const FULL_ORDER = {
  id: "o1", status: "CONFIRMED", courierBookedAt: null,
  guestName: "Nimali", guestEmail: "n@x.test", customerPhone: "0771234567",
  shippingLine1: "1 Rd", shippingLine2: null, shippingCity: "Colombo", shippingCountry: "Sri Lanka",
  subtotal: 6500, shippingCost: 0, total: 6500,
  paymentMethod: "KOKO", paymentMethodDisplay: "Koko", paymentStatus: "PAID",
  webNumber: "DB-1", rbNumber: null, notes: null, trackingCode: null,
  user: null,
  items: [{ name: "Dress", color: "Black", sku: "DB-DRESS-BLK-M", size: "M", price: 6500, quantity: 1 }],
  adjustments: [],
};

describe("bookCourier", () => {
  it("rejects when not CONFIRMED", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, status: "PENDING" });
    const res = await bookCourier("o1");
    expect(res).toEqual({ success: false, error: "Only confirmed, un-booked orders can be dispatched" });
  });

  it("rejects when already booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, courierBookedAt: new Date() });
    const res = await bookCourier("o1");
    expect(res).toEqual({ success: false, error: "Only confirmed, un-booked orders can be dispatched" });
  });

  it("books via bookCourierAndNotify and reports the waybill", async () => {
    orderFindUnique.mockResolvedValueOnce(FULL_ORDER);
    bookCourierAndNotify.mockResolvedValueOnce("CF-88213");
    const res = await bookCourier("o1");
    expect(bookCourierAndNotify).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, warning: "Booked — waybill CF-88213." });
  });

  it("returns an error when Curfox booking did not yield a waybill", async () => {
    orderFindUnique.mockResolvedValueOnce(FULL_ORDER);
    bookCourierAndNotify.mockResolvedValueOnce(undefined);
    const res = await bookCourier("o1");
    expect(res).toEqual({ success: false, error: "Courier booking failed — check Curfox / retry." });
  });
});

import { dispatchManually, updateTrackingNumber } from "../actions";

describe("dispatchManually", () => {
  it("rejects a blank tracking number", async () => {
    const res = await dispatchManually("o1", "   ");
    expect(res).toEqual({ success: false, error: "Enter a valid tracking number" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("rejects an order that is not CONFIRMED", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, status: "DISPATCHED" });
    const res = await dispatchManually("o1", "RX-123");
    expect(res).toEqual({ success: false, error: "Only confirmed orders can be dispatched" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("sets DISPATCHED + Royal Express + tracking and emails the customer once", async () => {
    orderFindUnique.mockResolvedValueOnce(FULL_ORDER);
    orderUpdate.mockResolvedValue({});
    notifyOrderDispatched.mockResolvedValueOnce(undefined);

    const res = await dispatchManually("o1", "  RX-123  ");

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { trackingCode: "RX-123", status: "DISPATCHED", deliveryCompany: "Royal Express" },
    });
    expect(notifyOrderDispatched).toHaveBeenCalledTimes(1);
    expect(notifyOrderDispatched.mock.calls[0][1]).toBe("RX-123");
    expect(res).toEqual({ success: true, warning: "Dispatched — tracking RX-123." });
  });

  it("still reports success (and does not throw) when the email send fails", async () => {
    orderFindUnique.mockResolvedValueOnce(FULL_ORDER);
    orderUpdate.mockResolvedValue({});
    notifyOrderDispatched.mockRejectedValueOnce(new Error("dispatcher down"));

    const res = await dispatchManually("o1", "RX-9");

    expect(logMailerError).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, warning: "Dispatched — tracking RX-9." });
  });

  it("dispatches a phone-only customer (no email): status/tracking persist, dispatch email is skipped", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, guestEmail: null, user: null });
    orderUpdate.mockResolvedValue({});

    const res = await dispatchManually("o1", "RX-777");

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { trackingCode: "RX-777", status: "DISPATCHED", deliveryCompany: "Royal Express" },
    });
    // The dispatcher is now always invoked — it decides the email skip internally.
    expect(notifyOrderDispatched).toHaveBeenCalledTimes(1);
    // No email was ever sent, so the "sent" timestamp update must not happen either.
    expect(orderUpdate).not.toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { customerDispatchEmailSentAt: expect.any(Date) },
    });
    expect(res).toEqual({ success: true, warning: "Dispatched — tracking RX-777." });
  });
});

describe("updateTrackingNumber", () => {
  it("updates trackingCode on a dispatched order without emailing", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, status: "DISPATCHED" });
    orderUpdate.mockResolvedValueOnce({});

    const res = await updateTrackingNumber("o1", "RX-NEW");

    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { trackingCode: "RX-NEW" } });
    expect(notifyOrderDispatched).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it("rejects updating a non-dispatched order", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, status: "CONFIRMED" });
    const res = await updateTrackingNumber("o1", "RX-NEW");
    expect(res).toEqual({ success: false, error: "Tracking number can only be updated on a dispatched order" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});

describe("resendConfirmationEmail", () => {
  it("re-sends with the tracking code when dispatched", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, trackingCode: "CF-88213" });
    sendOrderConfirmationEmail.mockResolvedValueOnce(undefined);
    const res = await resendConfirmationEmail("o1");
    const arg = sendOrderConfirmationEmail.mock.calls[0][0];
    expect(arg.trackingCode).toBe("CF-88213");
    expect(arg.customerEmail).toBe("n@x.test");
    expect(arg.items[0]).toMatchObject({
      color: "Black",
      sku: "DB-DRESS-BLK-M",
    });
    expect(res).toEqual({ success: true, warning: undefined });
  });

  it("fails when there is no customer email", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, guestEmail: null, user: null });
    const res = await resendConfirmationEmail("o1");
    expect(res).toEqual({ success: false, error: "No customer email on this order" });
  });

  it("warns when sent without a tracking code (not dispatched yet)", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, trackingCode: null });
    sendOrderConfirmationEmail.mockResolvedValueOnce(undefined);
    const res = await resendConfirmationEmail("o1");
    expect(res).toEqual({ success: true, warning: "Sent without a tracking code (not dispatched yet)." });
  });

  it("passes adjustments through to the email", async () => {
    orderFindUnique.mockResolvedValueOnce({
      ...FULL_ORDER, trackingCode: "CF-88213",
      adjustments: [{ label: "Rush fee", amount: 500 }, { label: "Loyalty discount", amount: -100 }],
    });
    sendOrderConfirmationEmail.mockResolvedValueOnce(undefined);
    await resendConfirmationEmail("o1");
    const arg = sendOrderConfirmationEmail.mock.calls[0][0];
    expect(arg.adjustments).toEqual([{ label: "Rush fee", amount: 500 }, { label: "Loyalty discount", amount: -100 }]);
  });
});

import { bulkConfirm, bulkDispatch } from "../actions";
import { bulkCancel } from "../actions";

describe("bulkConfirm", () => {
  it("confirms eligible orders and skips ineligible ones with a summary", async () => {
    // o1: PENDING paid online → confirm; o2: PENDING unpaid online → skip; o3: already CONFIRMED → skip
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PAID" })
      .mockResolvedValueOnce({ id: "o2", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PENDING" })
      .mockResolvedValueOnce({ id: "o3", status: "CONFIRMED", paymentMethod: "COD", paymentStatus: "COD_PENDING" });
    orderUpdate.mockResolvedValue({});

    const res = await bulkConfirm(["o1", "o2", "o3"]);

    expect(orderUpdate).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res.okCount).toBe(1);
    expect(res.skippedCount).toBe(2);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: false, error: "Awaiting payment" },
      { id: "o3", ok: false, error: "Already confirmed" },
    ]);
  });

  it("confirms unpaid online orders when allowUnpaid is set", async () => {
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PENDING" })
      .mockResolvedValueOnce({ id: "o2", status: "PENDING", paymentMethod: "MINTPAY", paymentStatus: null });
    orderUpdate.mockResolvedValue({});

    const res = await bulkConfirm(["o1", "o2"], { allowUnpaid: true });

    expect(orderUpdate).toHaveBeenCalledTimes(2);
    expect(res.okCount).toBe(2);
    expect(res.skippedCount).toBe(0);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: true },
    ]);
  });
});

describe("bulkDispatch", () => {
  it("dispatches confirmed un-booked orders and skips the rest", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "true";
    // o1: CONFIRMED not booked → book; o2: still PENDING → skip
    orderFindUnique
      .mockResolvedValueOnce({ ...FULL_ORDER, id: "o1", status: "CONFIRMED", courierBookedAt: null })
      .mockResolvedValueOnce({ ...FULL_ORDER, id: "o2", status: "PENDING", courierBookedAt: null });
    bookCourierAndNotify.mockResolvedValueOnce("CF-1");

    const res = await bulkDispatch(["o1", "o2"]);

    expect(bookCourierAndNotify).toHaveBeenCalledTimes(1);
    expect(res.okCount).toBe(1);
    expect(res.skippedCount).toBe(1);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: false, error: "Not dispatchable" },
    ]);
  });

  it("returns all-skipped when the courier integration is disabled", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "false";
    const res = await bulkDispatch(["o1", "o2"]);
    expect(res.okCount).toBe(0);
    expect(res.skippedCount).toBe(2);
    expect(bookCourierAndNotify).not.toHaveBeenCalled();
  });
});

describe("bulkCancel", () => {
  it("cancels eligible orders, restores both pools, and skips terminal ones", async () => {
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", items: [{ plainTshirtStockId: "ps1", dtfDesignId: "d1", quantity: 2 }], adjustments: [] })
      .mockResolvedValueOnce({ id: "o2", status: "CANCELLED", paymentStatus: "PENDING", items: [] })
      .mockResolvedValueOnce({ id: "o3", status: "DELIVERED", paymentStatus: "PAID", items: [{ plainTshirtStockId: "ps9", dtfDesignId: "d9", quantity: 1 }] });
    orderUpdate.mockResolvedValue({});

    const res = await bulkCancel(["o1", "o2", "o3"]);

    expect(plainStockUpdateMany).toHaveBeenCalledTimes(1);
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { quantity: { increment: 2 } } });
    expect(orderUpdate).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res.okCount).toBe(1);
    expect(res.skippedCount).toBe(2);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: false, error: "Already cancelled" },
      { id: "o3", ok: false, error: "Cannot cancel (DELIVERED)" },
    ]);
  });
});

import { deleteOrder, bulkDelete } from "../actions";

describe("deleteOrder", () => {
  it("deletes a cancelled order without touching stock", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CANCELLED" });
    orderDelete.mockResolvedValueOnce({});
    const res = await deleteOrder("o1");
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: "o1" } });
    expect(plainStockUpdateMany).not.toHaveBeenCalled();
    expect(dtfDesignUpdateMany).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it("deletes a delivered order without restoring stock", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "DELIVERED" });
    orderDelete.mockResolvedValueOnce({});
    const res = await deleteOrder("o1");
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: "o1" } });
    // delivered goods shipped — deletion must NOT return them to inventory
    expect(plainStockUpdateMany).not.toHaveBeenCalled();
    expect(dtfDesignUpdateMany).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it("rejects deleting an order that is neither cancelled nor delivered", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CONFIRMED" });
    const res = await deleteOrder("o1");
    expect(res).toEqual({ success: false, error: "Only cancelled or delivered orders can be deleted" });
    expect(orderDelete).not.toHaveBeenCalled();
  });
});

describe("bulkDelete", () => {
  it("deletes cancelled and delivered orders and skips the rest", async () => {
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "CANCELLED" })
      .mockResolvedValueOnce({ id: "o2", status: "DELIVERED" })
      .mockResolvedValueOnce({ id: "o3", status: "CONFIRMED" });
    orderDelete.mockResolvedValue({});
    const res = await bulkDelete(["o1", "o2", "o3"]);
    expect(orderDelete).toHaveBeenCalledTimes(2);
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: "o1" } });
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: "o2" } });
    expect(plainStockUpdateMany).not.toHaveBeenCalled(); // delete must never restore stock
    expect(dtfDesignUpdateMany).not.toHaveBeenCalled(); // delete must never restore stock
    expect(res.okCount).toBe(2);
    expect(res.skippedCount).toBe(1);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: true },
      { id: "o3", ok: false, error: "Not deletable" },
    ]);
  });
});

import { searchProductsForOrder } from "../actions";

describe("searchProductsForOrder", () => {
  it("returns an empty array for a blank query without hitting the database", async () => {
    const res = await searchProductsForOrder("   ");
    expect(res).toEqual([]);
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it("maps products/variants/sizes into the picker shape", async () => {
    productFindMany.mockResolvedValueOnce([
      {
        id: "p1", name: "Cat Tee", price: 2000,
        variants: [
          { id: "v1", color: "White", colorSlug: "white", price: null, sizeStocks: [{ size: "M" }, { size: "L" }] },
        ],
      },
    ]);
    const res = await searchProductsForOrder("cat");
    expect(productFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { archived: false, name: { contains: "cat", mode: "insensitive" } },
      take: 20,
    }));
    expect(res).toEqual([
      { id: "p1", name: "Cat Tee", price: 2000, variants: [{ id: "v1", color: "White", colorSlug: "white", price: null, sizes: ["M", "L"] }] },
    ]);
  });
});

import { addOrderItem } from "../actions";

describe("addOrderItem", () => {
  const BASE = { id: "o1", status: "CONFIRMED", courierBookedAt: null, paymentStatus: "PENDING",
    shippingCity: "Colombo", items: [{ price: 1000, quantity: 1 }], adjustments: [] };
  const VARIANT = {
    id: "v1", productId: "p1", color: "White", colorSlug: "white", sku: "DB-CAT-WHT", price: null,
    sizeStocks: [{ size: "M" }, { size: "L" }],
    product: { id: "p1", name: "Cat Tee", price: 2000, dtfDesignId: "d1", archived: false },
  };

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, courierBookedAt: new Date() });
    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "M", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
  });

  it("rejects a variant that doesn't belong to the given product", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce({ ...VARIANT, productId: "other-product" });
    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "M", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Selected product/color is no longer available" });
  });

  it("rejects a size not offered by the variant", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "XXL", quantity: 1 });
    expect(res).toEqual({ success: false, error: 'Size "XXL" is not offered for this color' });
  });

  it("resolves the color+size pool, acquires stock, creates the line, and recomputes totals", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    plainStockFindUnique.mockResolvedValueOnce({ id: "ps-white-m" });
    orderItemCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});

    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "M", quantity: 2 });

    expect(plainStockFindUnique).toHaveBeenCalledWith({ where: { colorSlug_size: { colorSlug: "white", size: "M" } }, select: { id: true } });
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps-white-m", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } } });
    expect(dtfDesignUpdateMany).toHaveBeenCalledWith({ where: { id: "d1", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } } });
    expect(orderItemCreate).toHaveBeenCalledWith({
      data: {
        orderId: "o1", productId: "p1", variantId: "v1", color: "White", sku: "DB-CAT-WHT",
        name: "Cat Tee", size: "M", price: 2000, quantity: 2,
        plainTshirtStockId: "ps-white-m", dtfDesignId: "d1",
      },
    });
    // subtotal 1000 (existing) + 2000*2 (new) = 5000, at/above 5000 free-shipping threshold -> 0
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" }, data: expect.objectContaining({ subtotal: 5000, shippingCost: 0, total: 5000 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("fails when the stock acquire has insufficient quantity, without creating the line", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    plainStockFindUnique.mockResolvedValueOnce({ id: "ps-white-m" });
    plainStockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "M", quantity: 50 });

    expect(res).toEqual({ success: false, error: 'Insufficient stock for "Cat Tee"' });
    expect(orderItemCreate).not.toHaveBeenCalled();
  });

  it("adds a sizeless item without touching the plain-tee pool", async () => {
    const sizelessVariant = { ...VARIANT, sizeStocks: [] };
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(sizelessVariant);
    orderItemCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});

    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: null, quantity: 1 });

    expect(plainStockFindUnique).not.toHaveBeenCalled();
    expect(plainStockUpdateMany).not.toHaveBeenCalled();
    expect(orderItemCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ size: null, plainTshirtStockId: null }),
    }));
    expect(res).toEqual({ success: true });
  });
});

import { swapOrderItem } from "../actions";

describe("swapOrderItem", () => {
  const BASE = {
    id: "o1", status: "CONFIRMED", courierBookedAt: null, paymentStatus: "PENDING", shippingCity: "Colombo",
    items: [{ id: "i1", price: 2000, quantity: 1, plainTshirtStockId: "ps-old", dtfDesignId: "d-old" }],
    adjustments: [],
  };
  const VARIANT = {
    id: "v2", productId: "p2", color: "Black", colorSlug: "black", sku: "DB-DOG-BLK", price: null,
    sizeStocks: [{ size: "S" }, { size: "M" }],
    product: { id: "p2", name: "Dog Tee", price: 1800, dtfDesignId: "d-new", archived: false },
  };

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, courierBookedAt: new Date() });
    const res = await swapOrderItem("o1", "i1", { productId: "p2", variantId: "v2", size: "S", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
  });

  it("rejects an unknown order item id", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    const res = await swapOrderItem("o1", "does-not-exist", { productId: "p2", variantId: "v2", size: "S", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Order item not found" });
  });

  it("restores the old line's pools, resolves the new variant's pools fresh, and updates the row in place", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    plainStockFindUnique.mockResolvedValueOnce({ id: "ps-black-s" });
    orderItemUpdate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});

    const res = await swapOrderItem("o1", "i1", { productId: "p2", variantId: "v2", size: "S", quantity: 3 });

    expect(plainStockUpdateMany).toHaveBeenNthCalledWith(1, { where: { id: "ps-old" }, data: { quantity: { increment: 1 } } });
    expect(dtfDesignUpdateMany).toHaveBeenNthCalledWith(1, { where: { id: "d-old" }, data: { quantity: { increment: 1 } } });
    expect(plainStockFindUnique).toHaveBeenCalledWith({ where: { colorSlug_size: { colorSlug: "black", size: "S" } }, select: { id: true } });
    expect(plainStockUpdateMany).toHaveBeenNthCalledWith(2, { where: { id: "ps-black-s", quantity: { gte: 3 } }, data: { quantity: { decrement: 3 } } });
    expect(orderItemUpdate).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: {
        productId: "p2", variantId: "v2", color: "Black", sku: "DB-DOG-BLK",
        name: "Dog Tee", size: "S", price: 1800, quantity: 3,
        plainTshirtStockId: "ps-black-s", dtfDesignId: "d-new",
      },
    });
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" }, data: expect.objectContaining({ subtotal: 5400, shippingCost: 0, total: 5400 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("fails when the new variant has insufficient stock, leaving the original row untouched", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    plainStockFindUnique.mockResolvedValueOnce({ id: "ps-black-s" });
    plainStockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const res = await swapOrderItem("o1", "i1", { productId: "p2", variantId: "v2", size: "S", quantity: 3 });

    expect(res).toEqual({ success: false, error: 'Insufficient stock for "Dog Tee"' });
    expect(orderItemUpdate).not.toHaveBeenCalled();
  });
});
