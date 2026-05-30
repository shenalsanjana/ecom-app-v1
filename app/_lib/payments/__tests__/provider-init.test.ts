import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, verify } from "crypto";
import type { PaymentOrder } from "../types";

const { payHereCheckoutHash, mintpayFetch } = vi.hoisted(() => ({
  payHereCheckoutHash: vi.fn(() => "PAYHERE_HASH"),
  mintpayFetch: vi.fn(),
}));

vi.mock("@/app/_lib/payhere-config", () => ({
  payHereMerchantId: () => "256312",
  payHereCheckoutUrl: () => "https://sandbox.payhere.lk/pay/checkout",
  payHereCheckoutHash,
}));

const ORDER: PaymentOrder = {
  id: "ORD-123",
  webNumber: "WEB1001",
  total: 2440,
  subtotal: 2090,
  shippingCost: 350,
  paymentMethod: "PAYHERE",
  paymentStatus: "PENDING",
  paymentMethodDisplay: "PayHere",
  customerPhone: "0771234567",
  guestName: "Jane Buyer",
  guestEmail: "jane@example.com",
  shippingLine1: "1 Main Street",
  shippingLine2: null,
  shippingCity: "Colombo",
  shippingCountry: "Sri Lanka",
  user: null,
  items: [{ productId: "P1", name: "Oversize Tee", quantity: 2, price: 1045, size: "M" }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.APP_URL = "https://shop.example.com";
});

describe("provider initiation", () => {
  it("creates PayHere form fields from the stored order", async () => {
    const { payHereProvider } = await import("../payhere");
    const result = await payHereProvider.initiate(ORDER, "https://shop.example.com");

    expect(result).toMatchObject({
      provider: "PAYHERE",
      displayName: "PayHere",
      gatewayUrl: "https://sandbox.payhere.lk/pay/checkout",
      fields: {
        merchant_id: "256312",
        order_id: "ORD-123",
        amount: "2440.00",
        currency: "LKR",
        hash: "PAYHERE_HASH",
        return_url: "https://shop.example.com/checkout/success",
        cancel_url: "https://shop.example.com/checkout/success?status=cancelled",
        notify_url: "https://shop.example.com/api/payhere/webhook",
      },
    });
  });

  it("creates Koko fields and a verifiable RSA SHA256 signature", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
    process.env.KOKO_MERCHANT_ID = "merchant-1";
    process.env.KOKO_API_KEY = "api-key-1";
    process.env.KOKO_PRIVATE_KEY = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    process.env.KOKO_PLUGIN_NAME = "customapi";
    process.env.KOKO_PLUGIN_VERSION = "1";

    const { kokoProvider } = await import("../koko");
    const result = await kokoProvider.initiate({ ...ORDER, paymentMethod: "KOKO" }, "https://shop.example.com");

    const data = result.fields.dataString;
    const signatureBytes = Buffer.from(result.fields.signature, "base64");
    expect(result.gatewayUrl).toBe("https://qaapi.paykoko.com/api/merchants/orderCreate");
    expect(result.fields._orderId).toBe("ORD-123");
    expect(result.fields._responseUrl).toBe("https://shop.example.com/api/payments/koko/response");
    expect(result.fields._returnUrl).toBe("https://shop.example.com/api/payments/koko/return?order_id=ORD-123");
    expect(
      verify("RSA-SHA256", Buffer.from(data), publicKey, signatureBytes),
    ).toBe(true);
  });

  it("throws when Koko order has no resolvable customer name or email", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
    process.env.KOKO_MERCHANT_ID = "merchant-1";
    process.env.KOKO_API_KEY = "api-key-1";
    process.env.KOKO_PRIVATE_KEY = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    process.env.KOKO_PLUGIN_NAME = "customapi";
    process.env.KOKO_PLUGIN_VERSION = "1";

    const { kokoProvider } = await import("../koko");
    await expect(
      kokoProvider.initiate(
        { ...ORDER, paymentMethod: "KOKO", guestName: null, guestEmail: null, user: null },
        "https://shop.example.com",
      ),
    ).rejects.toThrow(/missing customer/i);
  });

  it("throws when PayHere order has no resolvable customer name or email", async () => {
    const { payHereProvider } = await import("../payhere");
    await expect(
      payHereProvider.initiate(
        { ...ORDER, guestName: null, guestEmail: null, user: null },
        "https://shop.example.com",
      ),
    ).rejects.toThrow(/missing customer/i);
  });

  it("throws a diagnostic error when Mintpay gateway responds non-OK", async () => {
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";
    mintpayFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mintpayFetch);

    const { mintpayProvider } = await import("../mintpay");
    await expect(
      mintpayProvider.initiate({ ...ORDER, paymentMethod: "MINTPAY" }, "https://shop.example.com"),
    ).rejects.toThrow(/Mintpay order creation failed/);
  });

  it("sends a Mintpay customer_id within the 10-character limit and keeps the email separate", async () => {
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";
    mintpayFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Success", data: "PURCHASE-1" }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", mintpayFetch);

    const { mintpayProvider } = await import("../mintpay");
    await mintpayProvider.initiate({ ...ORDER, paymentMethod: "MINTPAY" }, "https://shop.example.com");

    const body = JSON.parse(mintpayFetch.mock.calls[0][1].body as string);
    expect(body.customer_id.length).toBeLessThanOrEqual(10);
    expect(body.customer_email).toBe("jane@example.com");

    // Stable: the same customer email yields the same customer_id.
    mintpayFetch.mockClear();
    await mintpayProvider.initiate(
      { ...ORDER, paymentMethod: "MINTPAY", id: "ORD-999" },
      "https://shop.example.com",
    );
    const body2 = JSON.parse(mintpayFetch.mock.calls[0][1].body as string);
    expect(body2.customer_id).toBe(body.customer_id);
  });

  it("creates Mintpay purchase and returns purchase_id form fields", async () => {
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";
    mintpayFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Success", data: "PURCHASE-1" }),
      text: async () => JSON.stringify({ message: "Success", data: "PURCHASE-1" }),
    });
    vi.stubGlobal("fetch", mintpayFetch);

    const { mintpayProvider } = await import("../mintpay");
    const result = await mintpayProvider.initiate({ ...ORDER, paymentMethod: "MINTPAY" }, "https://shop.example.com");

    expect(result).toMatchObject({
      provider: "MINTPAY",
      gatewayUrl: "https://dev.mintpay.lk/user-order/login/",
      fields: { purchase_id: "PURCHASE-1" },
    });
    expect(mintpayFetch).toHaveBeenCalledWith(
      "https://dev.mintpay.lk/user-order/api/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Token secret",
          "Content-Type": "application/json",
        }),
      }),
    );
  });
});
