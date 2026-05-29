import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

const {
  orderFindUnique,
  orderUpdate,
  orderItemFindMany,
  verifyPayment,
  sendOrderConfirmationEmail,
  finalizePaidPayment,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderItemFindMany: vi.fn(),
  verifyPayment: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  finalizePaidPayment: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: orderFindUnique,
      update: orderUpdate,
    },
    orderItem: {
      findMany: orderItemFindMany,
    },
  },
}));

vi.mock("@/app/_lib/payhere-api", () => ({
  verifyPayment,
}));

vi.mock("@/app/_lib/payhere-config", () => ({
  payHereMerchantId: () => "256312",
  payHereMerchantSecret: () => "merchant-secret",
}));

vi.mock("@/app/_lib/mailer", () => ({
  sendOrderConfirmationEmail,
  logMailerError: vi.fn(),
  sendAdminFailureAlertEmail: vi.fn(),
}));

vi.mock("@/app/_lib/payments/order-finalization", () => ({
  finalizePaidPayment,
}));

import { POST } from "../webhook/route";

const ORDER = {
  id: "ORD-123",
  total: 2440,
  subtotal: 2090,
  shippingCost: 350,
  paymentMethod: "PAYHERE",
  paymentMethodDisplay: "PayHere",
  paymentStatus: "PENDING",
  guestName: "Jane Buyer",
  guestEmail: "jane@example.com",
  userId: null,
  customerPhone: "0771234567",
  shippingLine1: "1 Main Street",
  shippingLine2: null,
  shippingCity: "Colombo",
  shippingCountry: "Sri Lanka",
  webNumber: "WEB1001",
  rbNumber: null,
  emailSent: false,
};

function signPayHereNotification(params: {
  merchantId?: string;
  orderId?: string;
  amount?: string;
  currency?: string;
  statusCode?: string;
  secret?: string;
}) {
  const merchantId = params.merchantId ?? "256312";
  const orderId = params.orderId ?? ORDER.id;
  const amount = params.amount ?? "2440.00";
  const currency = params.currency ?? "LKR";
  const statusCode = params.statusCode ?? "2";
  const secret = params.secret ?? "merchant-secret";
  const hashedSecret = createHash("md5").update(secret).digest("hex").toUpperCase();
  return createHash("md5")
    .update(`${merchantId}${orderId}${amount}${currency}${statusCode}${hashedSecret}`)
    .digest("hex")
    .toUpperCase();
}

function notificationBody(overrides: Record<string, string> = {}) {
  const amount = overrides.payhere_amount ?? "2440.00";
  const currency = overrides.payhere_currency ?? "LKR";
  const statusCode = overrides.status_code ?? "2";
  const orderId = overrides.order_id ?? ORDER.id;
  const merchantId = overrides.merchant_id ?? "256312";
  return new URLSearchParams({
    merchant_id: merchantId,
    order_id: orderId,
    payment_id: "320025",
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: statusCode,
    md5sig: signPayHereNotification({
      merchantId,
      orderId,
      amount,
      currency,
      statusCode,
    }),
    method: "VISA",
    status_message: "Successfully received the payment",
    ...overrides,
  });
}

describe("POST /api/payhere/webhook", () => {
  beforeEach(() => {
    process.env.ROYAL_EXPRESS_ENABLED = "false";
    orderFindUnique.mockReset();
    orderUpdate.mockReset();
    orderItemFindMany.mockReset();
    verifyPayment.mockReset();
    sendOrderConfirmationEmail.mockReset();
    finalizePaidPayment.mockReset();

    // Webhook calls prisma.order.findUnique once for amount/currency verification
    orderFindUnique.mockResolvedValue(ORDER);
    orderUpdate.mockResolvedValue({ ...ORDER, paymentStatus: "PAID" });
    orderItemFindMany.mockResolvedValue([{ name: "Oversize Tee", size: "M", price: 2090, quantity: 1 }]);
    verifyPayment.mockResolvedValue({
      verified: true,
      paymentId: "320025",
      amount: ORDER.total,
      currency: "LKR",
      method: "VISA",
      status: "RECEIVED",
    });
    sendOrderConfirmationEmail.mockResolvedValue(undefined);
    finalizePaidPayment.mockResolvedValue({ status: "success" });
  });

  it("accepts real PayHere notification amount and currency field names", async () => {
    const res = await POST(
      new Request("https://shop.example.com/api/payhere/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: notificationBody().toString(),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "success" });
    expect(finalizePaidPayment).toHaveBeenCalledWith("ORD-123", "PAYHERE");
  });

  it("accepts legacy status when status_code is absent", async () => {
    const body = notificationBody();
    body.delete("status_code");
    body.set("status", "2");

    const res = await POST(
      new Request("https://shop.example.com/api/payhere/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "success" });
    expect(finalizePaidPayment).toHaveBeenCalledWith("ORD-123", "PAYHERE");
  });

  it("confirms a signed notification without depending on the Merchant API", async () => {
    verifyPayment.mockRejectedValueOnce(new Error("PayHere OAuth failed: 403 Forbidden"));

    const res = await POST(
      new Request("https://shop.example.com/api/payhere/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: notificationBody().toString(),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "success" });
    expect(finalizePaidPayment).toHaveBeenCalledWith("ORD-123", "PAYHERE");
  });

  it("does not mark the order paid when the verified amount differs from the order total", async () => {
    const res = await POST(
      new Request("https://shop.example.com/api/payhere/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: notificationBody({ payhere_amount: "1000.00" }).toString(),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "amount_mismatch" });
    expect(finalizePaidPayment).not.toHaveBeenCalled();
  });

  it("rejects a notification whose merchant id does not match", async () => {
    // merchant_id check happens before signature verification in the route,
    // so a mismatched merchant_id returns 403 regardless of md5sig
    const body = new URLSearchParams({
      merchant_id: "999",
      order_id: ORDER.id,
      payment_id: "320025",
      payhere_amount: "2440.00",
      payhere_currency: "LKR",
      status_code: "2",
      md5sig: signPayHereNotification({ merchantId: "999" }),
      method: "VISA",
      status_message: "Successfully received the payment",
    });

    const res = await POST(
      new Request("https://shop.example.com/api/payhere/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "Merchant verification failed" });
    expect(finalizePaidPayment).not.toHaveBeenCalled();
  });
});
