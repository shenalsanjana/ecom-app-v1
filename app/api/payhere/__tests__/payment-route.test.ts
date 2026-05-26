import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPaymentLink, orderFindUnique } = vi.hoisted(() => ({
  createPaymentLink: vi.fn(),
  orderFindUnique: vi.fn(),
}));

vi.mock("@/app/_lib/payhere-config", () => ({
  payHereMerchantId: () => "256312",
  payHereCheckoutHash: vi.fn(() => "CHECKOUT_HASH"),
}));

vi.mock("@/app/_lib/payhere-api", () => ({
  createPaymentLink,
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: orderFindUnique,
    },
  },
}));

import { POST } from "../payment/route";

const ORDER = {
  id: "ORD-123",
  total: 2440,
  paymentMethod: "PAYHERE",
  paymentStatus: "PENDING",
  guestName: "Jane Buyer",
  guestEmail: "jane@example.com",
  customerPhone: "0771234567",
  shippingLine1: "1 Main Street",
  shippingLine2: null,
  shippingCity: "Colombo",
  shippingCountry: "Sri Lanka",
  user: null,
  items: [
    {
      name: "Oversize Tee",
      quantity: 2,
      price: 1045,
    },
  ],
};

describe("POST /api/payhere/payment", () => {
  beforeEach(() => {
    createPaymentLink.mockReset();
    orderFindUnique.mockReset();
    process.env.APP_URL = "https://shop.example.com";
    createPaymentLink.mockResolvedValue({
      success: true,
      paymentUrl: "https://sandbox.payhere.lk/pay/payment-id",
      paymentId: "payment-id",
    });
  });

  it("uses the stored order total instead of the client supplied amount", async () => {
    orderFindUnique.mockResolvedValue(ORDER);

    const res = await POST(
      new Request("https://shop.example.com/api/payhere/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: ORDER.id,
          amount: 1,
          customer: {
            name: "Tampered Name",
            email: "tampered@example.com",
            phone: "000",
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER.id,
        amount: ORDER.total,
        firstName: "Jane",
        lastName: "Buyer",
        email: "jane@example.com",
        phone: ORDER.customerPhone,
      }),
    );
  });

  it("uses server-derived callback URLs instead of client supplied URLs", async () => {
    orderFindUnique.mockResolvedValue(ORDER);

    await POST(
      new Request("https://shop.example.com/api/payhere/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: ORDER.id,
          returnUrl: "https://attacker.example/return",
          cancelUrl: "https://attacker.example/cancel",
          notifyUrl: "https://attacker.example/webhook",
        }),
      }),
    );

    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({
        returnUrl: `https://shop.example.com/checkout/success?order_id=${ORDER.id}`,
        cancelUrl: `https://shop.example.com/checkout/success?status=cancelled&order_id=${ORDER.id}`,
        notifyUrl: "https://shop.example.com/api/payhere/webhook",
      }),
    );
  });

  it("rejects payment link creation for non-PayHere orders", async () => {
    orderFindUnique.mockResolvedValue({ ...ORDER, paymentMethod: "COD" });

    const res = await POST(
      new Request("https://shop.example.com/api/payhere/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER.id }),
      }),
    );

    expect(res.status).toBe(409);
    expect(createPaymentLink).not.toHaveBeenCalled();
  });
});
