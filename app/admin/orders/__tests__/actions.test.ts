import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { orderFindUnique, orderUpdate, noteCreate, productUpdateMany, txn } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  noteCreate: vi.fn(),
  productUpdateMany: vi.fn(),
  txn: vi.fn(),
}));
const { orderItemUpdate, orderItemDelete } = vi.hoisted(() => ({
  orderItemUpdate: vi.fn(),
  orderItemDelete: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { bookCourierAndNotify } = vi.hoisted(() => ({ bookCourierAndNotify: vi.fn() }));
vi.mock("@/app/checkout/book-courier", () => ({ bookCourierAndNotify }));
const { sendOrderConfirmationEmail } = vi.hoisted(() => ({ sendOrderConfirmationEmail: vi.fn() }));
vi.mock("@/app/_lib/mailer", () => ({ sendOrderConfirmationEmail }));

vi.mock("@/app/_lib/prisma", () => {
  const client = {
    order: { findUnique: orderFindUnique, update: orderUpdate },
    orderNote: { create: noteCreate },
    product: { updateMany: productUpdateMany },
    orderItem: { update: orderItemUpdate, delete: orderItemDelete },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(client)) } };
});

import { addNote, markCodCollected } from "../actions";

beforeEach(() => {
  process.env.ROYAL_EXPRESS_ENABLED = "true";
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  orderFindUnique.mockReset();
  orderUpdate.mockReset();
  noteCreate.mockReset();
  productUpdateMany.mockReset();
  orderItemUpdate.mockReset();
  orderItemDelete.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => {
    const client = {
      order: { findUnique: orderFindUnique, update: orderUpdate },
      orderNote: { create: noteCreate },
      product: { updateMany: productUpdateMany },
      orderItem: { update: orderItemUpdate, delete: orderItemDelete },
    };
    return fn(client);
  });
  bookCourierAndNotify.mockReset();
  sendOrderConfirmationEmail.mockReset();
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

  it("allows PENDING→CONFIRMED", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING" });
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

  it("restores stock and warns when the order was paid", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "PAID",
      items: [{ productId: "p1", quantity: 2 }],
    });
    const res = await cancelOrder("o1");
    expect(productUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1" }, data: { stock: { increment: 2 } },
    });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res).toEqual({ success: true, warning: "Order was paid — refund must be handled manually." });
  });
});

import { editItems } from "../actions";

describe("editItems", () => {
  const ORDER = {
    id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", shippingCity: "Colombo",
    items: [
      { id: "i1", productId: "p1", name: "Dress", size: "M", price: 2000, quantity: 2 },
    ],
  };

  it("rejects editing a cancelled order", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, status: "CANCELLED" });
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    expect(res).toEqual({ success: false, error: "This order can no longer be edited" });
  });

  it("decreasing quantity restores stock and recomputes totals", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    productUpdateMany.mockResolvedValue({ count: 1 });
    orderUpdate.mockResolvedValueOnce({});
    orderItemUpdate.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    // restore 1 unit of p1
    expect(productUpdateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stock: { increment: 1 } } });
    // item updated to new quantity
    expect(orderItemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { quantity: 1, size: "M" } });
    // subtotal 2000 (qty 2→1), Colombo, below the 5000 free-shipping threshold → 350 shipping
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 2000, shippingCost: 350, total: 2350 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("remove path: deletes item, restores stock, recomputes totals to zero subtotal", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    productUpdateMany.mockResolvedValue({ count: 1 });
    orderUpdate.mockResolvedValueOnce({});
    orderItemDelete.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", remove: true }]);
    // restore 2 units of p1
    expect(productUpdateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stock: { increment: 2 } } });
    // item deleted
    expect(orderItemDelete).toHaveBeenCalledWith({ where: { id: "i1" } });
    // totals recomputed for empty item set: subtotal 0
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 0 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("fails the increase when stock is insufficient", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    productUpdateMany.mockResolvedValueOnce({ count: 0 }); // decrement guard fails
    const res = await editItems("o1", [{ id: "i1", quantity: 5 }]);
    expect(res).toEqual({ success: false, error: "Insufficient stock for \"Dress\"" });
    expect(orderUpdate).not.toHaveBeenCalled();
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
  items: [{ name: "Dress", size: "M", price: 6500, quantity: 1 }],
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

describe("resendConfirmationEmail", () => {
  it("re-sends with the tracking code when dispatched", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, trackingCode: "CF-88213" });
    sendOrderConfirmationEmail.mockResolvedValueOnce(undefined);
    const res = await resendConfirmationEmail("o1");
    const arg = sendOrderConfirmationEmail.mock.calls[0][0];
    expect(arg.trackingCode).toBe("CF-88213");
    expect(arg.customerEmail).toBe("n@x.test");
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
});
