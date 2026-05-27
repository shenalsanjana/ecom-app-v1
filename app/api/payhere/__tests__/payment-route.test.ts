import { beforeEach, describe, expect, it, vi } from "vitest";

const { orderFindUnique, payHereCheckoutHash } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  payHereCheckoutHash: vi.fn(() => "CHECKOUT_HASH"),
}));

vi.mock("@/app/_lib/payhere-config", () => ({
  payHereMerchantId: () => "256312",
  payHereCheckoutUrl: () => "https://www.payhere.lk/pay/checkout",
  payHereCheckoutHash,
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
    orderFindUnique.mockReset();
    payHereCheckoutHash.mockReset();
    payHereCheckoutHash.mockReturnValue("CHECKOUT_HASH");
    process.env.APP_URL = "https://shop.example.com";
  });

  it("returns PayHere Checkout POST fields using the stored order total", async () => {
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
    await expect(res.json()).resolves.toMatchObject({
      gatewayUrl: "https://www.payhere.lk/pay/checkout",
      fields: {
        merchant_id: "256312",
        order_id: ORDER.id,
        amount: "2440.00",
        currency: "LKR",
        items: "Oversize Tee x2",
        first_name: "Jane",
        last_name: "Buyer",
        email: "jane@example.com",
        phone: ORDER.customerPhone,
        hash: "CHECKOUT_HASH",
      },
    });
    expect(payHereCheckoutHash).toHaveBeenCalledWith("256312", ORDER.id, ORDER.total, "LKR");
  });

  it("uses server-derived callback URLs instead of client supplied URLs", async () => {
    orderFindUnique.mockResolvedValue(ORDER);

    const res = await POST(
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

    expect(res.status).toBe(200);
    // PayHere appends `order_id` itself when it redirects the buyer back, so
    // our return_url/cancel_url must NOT include it — duplicates would be
    // parsed as string[] by Next.js and break the success page.
    await expect(res.json()).resolves.toMatchObject({
      fields: {
        return_url: "https://shop.example.com/checkout/success",
        cancel_url: "https://shop.example.com/checkout/success?status=cancelled",
        notify_url: "https://shop.example.com/api/payhere/webhook",
      },
    });
  });

  it("uses PayHere's required snake_case callback field names", async () => {
    orderFindUnique.mockResolvedValue(ORDER);

    const res = await POST(
      new Request("https://shop.example.com/api/payhere/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER.id }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      fields: {
        return_url: "https://shop.example.com/checkout/success",
        cancel_url: "https://shop.example.com/checkout/success?status=cancelled",
        notify_url: "https://shop.example.com/api/payhere/webhook",
      },
    });
  });

  it("rejects checkout field creation for non-PayHere orders", async () => {
    orderFindUnique.mockResolvedValue({ ...ORDER, paymentMethod: "COD" });

    const res = await POST(
      new Request("https://shop.example.com/api/payhere/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER.id }),
      }),
    );

    expect(res.status).toBe(409);
  });

  it("returns a JSON error when PayHere credentials are not configured", async () => {
    orderFindUnique.mockResolvedValue(ORDER);
    payHereCheckoutHash.mockImplementation(() => {
      throw new Error("PAYHERE_MERCHANT_SECRET must be set in environment");
    });

    const res = await POST(
      new Request("https://shop.example.com/api/payhere/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: ORDER.id }),
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Payment gateway is not configured",
    });
  });
});
