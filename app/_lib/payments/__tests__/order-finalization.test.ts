import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  orderFindUnique,
  orderUpdate,
  orderUpdateMany,
  productUpdate,
  orderItemFindMany,
  sendOrderConfirmationEmail,
  sendAdminFailureAlertEmail,
  bookCourierAndNotify,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderUpdateMany: vi.fn(),
  productUpdate: vi.fn(),
  orderItemFindMany: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  sendAdminFailureAlertEmail: vi.fn(),
  bookCourierAndNotify: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { findUnique: orderFindUnique, update: orderUpdate, updateMany: orderUpdateMany },
    orderItem: { findMany: orderItemFindMany },
    product: { update: productUpdate },
    $transaction: vi.fn(async (fn) =>
      fn({
        order: { findUnique: orderFindUnique, update: orderUpdate, updateMany: orderUpdateMany },
        product: { update: productUpdate },
      }),
    ),
  },
}));

vi.mock("@/app/_lib/mailer", () => ({
  sendOrderConfirmationEmail,
  sendAdminFailureAlertEmail,
  logMailerError: vi.fn(),
}));

vi.mock("@/app/checkout/book-courier", () => ({ bookCourierAndNotify }));

import { finalizeFailedPayment, finalizePaidPayment } from "../order-finalization";

const ORDER = {
  id: "ORD-1",
  total: 1000,
  subtotal: 900,
  shippingCost: 100,
  paymentMethod: "KOKO",
  paymentMethodDisplay: "Koko",
  paymentStatus: "PENDING",
  status: "PENDING",
  guestName: "Jane",
  guestEmail: "jane@example.com",
  user: null,
  customerPhone: "0771234567",
  shippingLine1: "1 Main Street",
  shippingLine2: null,
  shippingCity: "Colombo",
  shippingCountry: "Sri Lanka",
  webNumber: "WEB1001",
  rbNumber: null,
  emailSent: false,
};

const ITEMS = [{ productId: "P1", name: "Tee", size: "M", price: 1000, quantity: 2 }];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ROYAL_EXPRESS_ENABLED = "false";
  orderFindUnique.mockResolvedValue(ORDER);
  orderUpdate.mockResolvedValue({ ...ORDER, paymentStatus: "PAID" });
  orderUpdateMany.mockResolvedValue({ count: 1 });
  orderItemFindMany.mockResolvedValue(ITEMS);
});

describe("order finalization", () => {
  it("marks paid and sends confirmation email", async () => {
    await finalizePaidPayment("ORD-1", "KOKO");

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "ORD-1", paymentStatus: { not: "PAID" } },
      data: { paymentStatus: "PAID" },
    });
    expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
  });

  it("marks failed, cancels order, and restores stock once", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "ORD-1",
        paymentStatus: { notIn: ["PAID", "PAYMENT_FAILED"] },
        status: { not: "CANCELLED" },
      },
      data: { paymentStatus: "PAYMENT_FAILED", status: "CANCELLED" },
    });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "P1" },
      data: { stock: { increment: 2 } },
    });
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it("does not restore stock when already failed", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, paymentStatus: "PAYMENT_FAILED", status: "CANCELLED", items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("ignores failure when already paid", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, paymentStatus: "PAID", items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it("never books the courier on payment, even when RoyalExpress is enabled", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "true";

    const result = await finalizePaidPayment("ORD-1", "KOKO");

    expect(bookCourierAndNotify).not.toHaveBeenCalled();
    expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "success" });

    process.env.ROYAL_EXPRESS_ENABLED = "false";
  });

  it("returns payment_method_mismatch when method differs", async () => {
    const result = await finalizePaidPayment("ORD-1", "PAYHERE");

    expect(result).toEqual({ status: "payment_method_mismatch" });
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("returns order_not_found when order is missing", async () => {
    orderFindUnique.mockResolvedValueOnce(null);

    const result = await finalizePaidPayment("ORD-1", "KOKO");

    expect(result).toEqual({ status: "order_not_found" });
  });

  it("returns already_failed when failure claim is a no-op", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, items: ITEMS });
    orderUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await finalizeFailedPayment("ORD-1", "KOKO", "duplicate callback");

    expect(result).toEqual({ status: "already_failed" });
    expect(productUpdate).not.toHaveBeenCalled();
  });
});
