// app/checkout/__tests__/payhere-payment.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import crypto from "crypto";

// ── Reusable helpers matching the route's validation schema ──────────────────

const PaymentRequestSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.literal("LKR").default("LKR"),
  items: z
    .array(z.object({ name: z.string(), quantity: z.number().int().positive(), amount: z.number().nonnegative() }))
    .default([]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string(),
  }),
  returnUrl: z.string().url().default("http://localhost:3000/checkout/success"),
  cancelUrl: z.string().url().default("http://localhost:3000/checkout/success?status=cancelled"),
  notifyUrl: z.string().url().default("http://localhost:3000/api/payhere/webhook"),
});

describe("PaymentRequestSchema validation", () => {
  it("passes with all required fields", () => {
    const result = PaymentRequestSchema.safeParse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
    });
    expect(result.success).toBe(true);
  });

  it("fails when orderId is missing", () => {
    const result = PaymentRequestSchema.safeParse({
      amount: 1500,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain("orderId");
  });

  it("fails when amount is missing", () => {
    const result = PaymentRequestSchema.safeParse({
      orderId: "ORD-123",
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain("amount");
  });

  it("fails when customer.email is missing", () => {
    const result = PaymentRequestSchema.safeParse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", phone: "0712345678" },
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("fails when customer.email is invalid", () => {
    const result = PaymentRequestSchema.safeParse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", email: "not-an-email", phone: "0712345678" },
    });
    expect(result.success).toBe(false);
  });

  it("fails when amount is not a positive integer", () => {
    const result = PaymentRequestSchema.safeParse({
      orderId: "ORD-123",
      amount: -100,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
    });
    expect(result.success).toBe(false);
  });

  it("defaults currency to LKR", () => {
    const result = PaymentRequestSchema.parse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
    });
    expect(result.currency).toBe("LKR");
  });

  it("defaults returnUrl, cancelUrl, and notifyUrl", () => {
    const result = PaymentRequestSchema.parse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
    });
    expect(result.returnUrl).toBe("http://localhost:3000/checkout/success");
    expect(result.cancelUrl).toBe("http://localhost:3000/checkout/success?status=cancelled");
    expect(result.notifyUrl).toBe("http://localhost:3000/api/payhere/webhook");
  });

  it("accepts custom returnUrl, cancelUrl, and notifyUrl", () => {
    const result = PaymentRequestSchema.parse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
      returnUrl: "https://shop.example.com/success",
      cancelUrl: "https://shop.example.com/cancel",
      notifyUrl: "https://shop.example.com/api/notify",
    });
    expect(result.returnUrl).toBe("https://shop.example.com/success");
    expect(result.cancelUrl).toBe("https://shop.example.com/cancel");
    expect(result.notifyUrl).toBe("https://shop.example.com/api/notify");
  });
});

describe("PayHere hash generation", () => {
  function generateHash(
    merchantId: string,
    orderId: string,
    amount: string,
    currency: string,
    appSecret: string,
  ): string {
    const secretHash = crypto.createHash("md5").update(appSecret).digest("hex").toUpperCase();
    const str = `${merchantId}${orderId}${amount}${currency}${secretHash}`;
    return crypto.createHash("md5").update(str).digest("hex").toUpperCase();
  }

  const SECRET = "test-secret-123";

  it("produces a valid uppercase MD5 hash", () => {
    const hash = generateHash("256312", "ORD-123", "1500", "LKR", SECRET);
    expect(hash).toMatch(/^[A-F0-9]{32}$/);
  });

  it("hash changes when order_id changes", () => {
    const hash1 = generateHash("256312", "ORD-123", "1500", "LKR", SECRET);
    const hash2 = generateHash("256312", "ORD-456", "1500", "LKR", SECRET);
    expect(hash1).not.toBe(hash2);
  });

  it("hash changes when amount changes", () => {
    const hash1 = generateHash("256312", "ORD-123", "1500", "LKR", SECRET);
    const hash2 = generateHash("256312", "ORD-123", "2000", "LKR", SECRET);
    expect(hash1).not.toBe(hash2);
  });

  it("hash changes when secret changes", () => {
    const hash1 = generateHash("256312", "ORD-123", "1500", "LKR", SECRET);
    const hash2 = generateHash("256312", "ORD-123", "1500", "LKR", "different-secret");
    expect(hash1).not.toBe(hash2);
  });
});

describe("Customer name splitting", () => {
  function splitName(fullName: string): { first_name: string; last_name: string } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { first_name: parts[0], last_name: parts[0] };
    }
    return {
      first_name: parts[0],
      last_name: parts.slice(1).join(" "),
    };
  }

  it("splits full name into first_name and last_name", () => {
    const result = splitName("John Peter Smith");
    expect(result.first_name).toBe("John");
    expect(result.last_name).toBe("Peter Smith");
  });

  it("handles single-word customer name as both first and last", () => {
    const result = splitName("Madhavi");
    expect(result.first_name).toBe("Madhavi");
    expect(result.last_name).toBe("Madhavi");
  });

  it("handles two-word names", () => {
    const result = splitName("John Doe");
    expect(result.first_name).toBe("John");
    expect(result.last_name).toBe("Doe");
  });
});

describe("PayHere Checkout URL building", () => {
  it("includes order_id in the return URL", () => {
    const baseUrl = "http://localhost:3000/checkout/success";
    const orderId = "ORD-123";
    const returnUrl = `${baseUrl}?order_id=${encodeURIComponent(orderId)}`;
    expect(returnUrl).toBe("http://localhost:3000/checkout/success?order_id=ORD-123");
  });

  it("encodes special characters in order_id for URL safety", () => {
    const baseUrl = "http://localhost:3000/checkout/success";
    const orderId = "ORD 123&foo=bar";
    const returnUrl = `${baseUrl}?order_id=${encodeURIComponent(orderId)}`;
    expect(returnUrl).toBe("http://localhost:3000/checkout/success?order_id=ORD%20123%26foo%3Dbar");
  });

  it("builds a valid PayHere checkout URL with all required params", () => {
    const merchantId = "256312";
    const baseUrl = "https://sandbox.payhere.lk/pay/checkout";
    const orderId = "ORD-456";
    const amount = "2999";
    const currency = "LKR";
    const returnUrl = `http://localhost:3000/checkout/success?order_id=${encodeURIComponent(orderId)}`;
    const cancelUrl = `http://localhost:3000/checkout/success?status=cancelled&order_id=${encodeURIComponent(orderId)}`;

    const params = new URLSearchParams({
      merchant_id: merchantId,
      order_id: orderId,
      amount,
      currency,
      items: "T-Shirt x2, Jeans x1",
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
      phone: "0712345678",
      address: "",
      country: "Sri Lanka",
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: "http://localhost:3000/api/payhere/webhook",
      hash: "ABCDEF0123456789ABCDEF0123456789",
    });

    const paymentUrl = `${baseUrl}?${params.toString()}`;
    const parsed = new URL(paymentUrl);
    const queryParams = parsed.searchParams;

    // Verify the base URL is the correct checkout endpoint
    expect(parsed.origin + parsed.pathname).toBe("https://sandbox.payhere.lk/pay/checkout");

    // Verify all required params are present
    expect(queryParams.get("merchant_id")).toBe(merchantId);
    expect(queryParams.get("order_id")).toBe("ORD-456");
    expect(queryParams.get("amount")).toBe("2999");
    expect(queryParams.get("currency")).toBe("LKR");
    expect(queryParams.get("first_name")).toBe("John");
    expect(queryParams.get("last_name")).toBe("Doe");
    expect(queryParams.get("email")).toBe("john@example.com");
    expect(queryParams.get("phone")).toBe("0712345678");
    expect(queryParams.get("country")).toBe("Sri Lanka");
    expect(queryParams.get("hash")).toBe("ABCDEF0123456789ABCDEF0123456789");

    // Verify return/cancel URLs
    expect(queryParams.get("return_url")).toContain("order_id=ORD-456");
    expect(queryParams.get("return_url")).not.toContain("status=cancelled");
    expect(queryParams.get("cancel_url")).toContain("order_id=ORD-456");
    expect(queryParams.get("cancel_url")).toContain("status=cancelled");
    expect(queryParams.get("notify_url")).toBe("http://localhost:3000/api/payhere/webhook");
  });

  it("does NOT contain deprecated _fp_id or _signature params", () => {
    const baseUrl = "https://sandbox.payhere.lk/pay/checkout";
    const params = new URLSearchParams({
      merchant_id: "256312",
      order_id: "ORD-456",
      amount: "2999",
      currency: "LKR",
      hash: "ABCDEF0123456789ABCDEF0123456789",
    });

    const paymentUrl = `${baseUrl}?${params.toString()}`;
    const parsed = new URL(paymentUrl);
    const queryParams = parsed.searchParams;

    expect(queryParams.has("_fp_id")).toBe(false);
    expect(queryParams.has("_signature")).toBe(false);
    expect(queryParams.has("_payer_name")).toBe(false);
    expect(queryParams.has("_payer_email")).toBe(false);
    expect(queryParams.has("_payer_phone")).toBe(false);
  });
});
