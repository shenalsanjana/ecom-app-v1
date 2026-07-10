import { describe, it, expect, beforeEach, vi } from "vitest";

const { orderUpdateMany } = vi.hoisted(() => ({ orderUpdateMany: vi.fn() }));
const { sendOrderConfirmationEmail, sendCustomerDispatchEmail, sendCustomerCancellationEmail } =
  vi.hoisted(() => ({
    sendOrderConfirmationEmail: vi.fn(),
    sendCustomerDispatchEmail: vi.fn(),
    sendCustomerCancellationEmail: vi.fn(),
  }));
const { sendOrderConfirmationSms, sendOrderDispatchedSms, sendOrderCancelledSms } = vi.hoisted(() => ({
  sendOrderConfirmationSms: vi.fn(),
  sendOrderDispatchedSms: vi.fn(),
  sendOrderCancelledSms: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { order: { updateMany: orderUpdateMany } } }));
vi.mock("@/app/_lib/mailer", () => ({
  sendOrderConfirmationEmail,
  sendCustomerDispatchEmail,
  sendCustomerCancellationEmail,
  logMailerError: vi.fn(),
}));
vi.mock("@/app/_lib/sms", () => ({
  sendOrderConfirmationSms,
  sendOrderDispatchedSms,
  sendOrderCancelledSms,
}));

import type { OrderDetails } from "@/app/_lib/mailer";
import {
  notifyOrderConfirmed,
  notifyOrderDispatched,
  notifyOrderCancelled,
} from "../order-notifications";

const withEmail: OrderDetails = {
  orderId: "ORD-1",
  customerName: "Jane",
  customerEmail: "jane@example.com",
  customerPhone: "+94771234567",
  items: [{ name: "Tee", color: "White", sku: "DB-TEE-WHT-M", size: "M", price: 1000, quantity: 1 }],
  subtotal: 1000,
  shipping: 0,
  total: 1000,
  shippingAddress: { line1: "1 Main", city: "Colombo", country: "Sri Lanka" },
  paymentMethod: "COD",
  webNumber: "WEB1001",
};
const phoneOnly: OrderDetails = { ...withEmail, customerEmail: "" };

beforeEach(() => {
  vi.clearAllMocks();
  orderUpdateMany.mockResolvedValue({ count: 1 });
});

describe("notifyOrderConfirmed", () => {
  it("with email → sends both the confirmation email and SMS", async () => {
    await notifyOrderConfirmed(withEmail);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
    expect(sendOrderConfirmationSms).toHaveBeenCalledOnce();
    expect(sendOrderConfirmationSms.mock.calls[0][0]).toMatchObject({
      phone: "+94771234567",
      ref: "WEB1001",
      total: 1000,
      items: [{ name: "Tee", color: "White" }],
    });
  });

  it("phone-only (no email) → SMS only, email skipped, resolves without throwing", async () => {
    await expect(notifyOrderConfirmed(phoneOnly)).resolves.toBeUndefined();
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
    expect(sendOrderConfirmationSms).toHaveBeenCalledOnce();
  });

  it("is idempotent — a repeated trigger sends the SMS at most once", async () => {
    orderUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await notifyOrderConfirmed(phoneOnly); // claim wins → sends
    await notifyOrderConfirmed(phoneOnly); // claim loses → skips
    expect(sendOrderConfirmationSms).toHaveBeenCalledOnce();
  });

  it("releases the SMS flag when the send fails, and never throws", async () => {
    sendOrderConfirmationSms.mockRejectedValueOnce(new Error("notify down"));
    await expect(notifyOrderConfirmed(phoneOnly)).resolves.toBeUndefined();
    const release = orderUpdateMany.mock.calls.find(
      (c) => c[0]?.data?.confirmationSmsSentAt === null,
    );
    expect(release).toBeTruthy();
  });
});

describe("notifyOrderDispatched", () => {
  it("with email → dispatch email (with tracking) and SMS both sent", async () => {
    await notifyOrderDispatched(withEmail, "RA999");
    expect(sendCustomerDispatchEmail).toHaveBeenCalledOnce();
    expect(sendCustomerDispatchEmail.mock.calls[0][0].trackingCode).toBe("RA999");
    expect(sendOrderDispatchedSms).toHaveBeenCalledOnce();
    expect(sendOrderDispatchedSms.mock.calls[0][0]).toMatchObject({ trackingCode: "RA999" });
  });

  it("phone-only (no email) → SMS only, dispatch email skipped, no throw", async () => {
    await expect(notifyOrderDispatched(phoneOnly, "RA999")).resolves.toBeUndefined();
    expect(sendCustomerDispatchEmail).not.toHaveBeenCalled();
    expect(sendOrderDispatchedSms).toHaveBeenCalledOnce();
  });
});

describe("notifyOrderCancelled", () => {
  it("with email → cancellation email and SMS both sent", async () => {
    await notifyOrderCancelled(withEmail);
    expect(sendCustomerCancellationEmail).toHaveBeenCalledOnce();
    expect(sendOrderCancelledSms).toHaveBeenCalledOnce();
  });

  it("phone-only → SMS only, no throw", async () => {
    await expect(notifyOrderCancelled(phoneOnly)).resolves.toBeUndefined();
    expect(sendCustomerCancellationEmail).not.toHaveBeenCalled();
    expect(sendOrderCancelledSms).toHaveBeenCalledOnce();
  });
});
