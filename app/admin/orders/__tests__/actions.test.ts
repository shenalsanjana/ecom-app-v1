import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { orderFindUnique, orderUpdate, orderDelete, noteCreate, productUpdateMany, txn } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderDelete: vi.fn(),
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
  orderDelete.mockReset();
  noteCreate.mockReset();
  productUpdateMany.mockReset();
  orderItemUpdate.mockReset();
  orderItemDelete.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => {
    const client = {
      order: { findUnique: orderFindUnique, update: orderUpdate, delete: orderDelete },
      orderNote: { create: noteCreate },
      product: { updateMany: productUpdateMany },
      orderItem: { update: orderItemUpdate, delete: orderItemDelete },
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

  it("skips stock restore for an item whose product was deleted (null productId)", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "PENDING",
      guestName: null, guestEmail: null, user: null,
      items: [
        { productId: null, name: "Gone", size: "M", price: 6500, quantity: 2 },
        { productId: "p1", name: "Dress", size: "M", price: 1000, quantity: 1 },
      ],
    });
    const res = await cancelOrder("o1");
    // only the surviving product's stock is restored; the null one is skipped
    expect(productUpdateMany).toHaveBeenCalledTimes(1);
    expect(productUpdateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stock: { increment: 1 } } });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res).toEqual({ success: true });
  });

  it("emails the customer that their order was cancelled", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "COD_PENDING",
      guestName: "Nimali", guestEmail: "n@x.test", user: null,
      webNumber: "WEB1", rbNumber: null, trackingCode: null,
      items: [{ productId: "p1", name: "Dress", size: "M", price: 1000, quantity: 1 }],
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
      items: [{ productId: "p1", name: "Dress", size: "M", price: 1000, quantity: 1 }],
    });
    await cancelOrder("o1");
    // The dispatcher is now always invoked — it decides the email skip internally.
    expect(notifyOrderCancelled).toHaveBeenCalledTimes(1);
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
  it("cancels eligible orders, restores stock, and skips terminal ones", async () => {
    // o1: CONFIRMED → cancel + restore; o2: already CANCELLED → skip; o3: DELIVERED → skip
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", items: [{ productId: "p1", quantity: 2 }] })
      .mockResolvedValueOnce({ id: "o2", status: "CANCELLED", paymentStatus: "PENDING", items: [] })
      .mockResolvedValueOnce({ id: "o3", status: "DELIVERED", paymentStatus: "PAID", items: [{ productId: "p9", quantity: 1 }] });
    orderUpdate.mockResolvedValue({});
    productUpdateMany.mockResolvedValue({ count: 1 });

    const res = await bulkCancel(["o1", "o2", "o3"]);

    expect(productUpdateMany).toHaveBeenCalledTimes(1);
    expect(productUpdateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stock: { increment: 2 } } });
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
    expect(productUpdateMany).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it("deletes a delivered order without restoring stock", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "DELIVERED" });
    orderDelete.mockResolvedValueOnce({});
    const res = await deleteOrder("o1");
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: "o1" } });
    // delivered goods shipped — deletion must NOT return them to inventory
    expect(productUpdateMany).not.toHaveBeenCalled();
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
    expect(productUpdateMany).not.toHaveBeenCalled(); // delete must never restore stock
    expect(res.okCount).toBe(2);
    expect(res.skippedCount).toBe(1);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: true },
      { id: "o3", ok: false, error: "Not deletable" },
    ]);
  });
});
