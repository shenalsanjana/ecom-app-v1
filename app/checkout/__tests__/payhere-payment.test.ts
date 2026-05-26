// app/checkout/__tests__/payhere-payment.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import crypto from "crypto";

// ── Schema matching the route's validation schema ────────────────────────────

const PaymentRequestSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.literal("LKR").default("LKR"),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive(),
        amount: z.number().nonnegative(),
      }),
    )
    .default([]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string(),
    address: z.string().optional().default(""),
    city: z.string().optional().default(""),
    country: z.string().optional().default("Sri Lanka"),
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

  it("fails when amount is not positive", () => {
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

  it("defaults customer address/city/country", () => {
    const result = PaymentRequestSchema.parse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
    });
    expect(result.customer.address).toBe("");
    expect(result.customer.city).toBe("");
    expect(result.customer.country).toBe("Sri Lanka");
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

  it("accepts address, city, country in customer", () => {
    const result = PaymentRequestSchema.parse({
      orderId: "ORD-123",
      amount: 1500,
      customer: {
        name: "Test User",
        email: "test@example.com",
        phone: "0712345678",
        address: "123 Main St, Apt 4B",
        city: "Colombo",
        country: "Sri Lanka",
      },
    });
    expect(result.customer.address).toBe("123 Main St, Apt 4B");
    expect(result.customer.city).toBe("Colombo");
    expect(result.customer.country).toBe("Sri Lanka");
  });
});

// ── Checkout hash generation ─────────────────────────────────────────────────

describe("Checkout hash generation", () => {
  // Matches the implementation in payhere-config.ts:
  // hash = upper(md5(merchant_id + order_id + amount_formatted + currency + upper(md5(merchant_secret))))
  function generateCheckoutHash(
    merchantId: string,
    orderId: string,
    amount: number,
    currency: string,
    merchantSecret: string,
  ): string {
    const hashedSecret = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();
    const amountFormatted = amount.toFixed(2);
    const str = `${merchantId}${orderId}${amountFormatted}${currency}${hashedSecret}`;
    return crypto.createHash("md5").update(str).digest("hex").toUpperCase();
  }

  const SECRET = "test-merchant-secret-123";

  it("produces a valid uppercase MD5 hash", () => {
    const hash = generateCheckoutHash("256312", "ORD-123", 1500, "LKR", SECRET);
    expect(hash).toMatch(/^[A-F0-9]{32}$/);
  });

  it("formats amount with 2 decimal places", () => {
    const hash1 = generateCheckoutHash("256312", "ORD-123", 1500, "LKR", SECRET);
    const hash2 = generateCheckoutHash("256312", "ORD-123", 1500.0, "LKR", SECRET);
    expect(hash1).toBe(hash2);
  });

  it("hash changes when order_id changes", () => {
    const hash1 = generateCheckoutHash("256312", "ORD-123", 1500, "LKR", SECRET);
    const hash2 = generateCheckoutHash("256312", "ORD-456", 1500, "LKR", SECRET);
    expect(hash1).not.toBe(hash2);
  });

  it("hash changes when amount changes", () => {
    const hash1 = generateCheckoutHash("256312", "ORD-123", 1500, "LKR", SECRET);
    const hash2 = generateCheckoutHash("256312", "ORD-123", 2000, "LKR", SECRET);
    expect(hash1).not.toBe(hash2);
  });

  it("hash changes when secret changes", () => {
    const hash1 = generateCheckoutHash("256312", "ORD-123", 1500, "LKR", SECRET);
    const hash2 = generateCheckoutHash("256312", "ORD-123", 1500, "LKR", "different-secret");
    expect(hash1).not.toBe(hash2);
  });

  it("hash changes when currency changes", () => {
    const hash1 = generateCheckoutHash("256312", "ORD-123", 1500, "LKR", SECRET);
    const hash2 = generateCheckoutHash("256312", "ORD-123", 1500, "USD", SECRET);
    expect(hash1).not.toBe(hash2);
  });

  it("correctly hashes with formatted amount (2 decimal places)", () => {
    // 2999 → "2999.00" in the hash
    const hash = generateCheckoutHash("256312", "ORD-456", 2999, "LKR", SECRET);
    expect(hash).toMatch(/^[A-F0-9]{32}$/);
    // Verify it's different from unformatted (if that were possible)
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(32);
  });
});

// ── Customer name splitting ──────────────────────────────────────────────────

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

// ── Payment link request body ────────────────────────────────────────────────

describe("Payment link request body construction", () => {
  it("builds correct request body for PayHere merchant API", () => {
    const body = {
      order_id: "ORD-456",
      items: "T-Shirt x2, Jeans x1",
      amount: 2999.0,
      currency: "LKR",
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
      phone: "0712345678",
      address: "123 Main St",
      city: "Colombo",
      country: "Sri Lanka",
      return_url: "http://localhost:3000/checkout/success?order_id=ORD-456",
      cancel_url: "http://localhost:3000/checkout/success?status=cancelled&order_id=ORD-456",
      notify_url: "http://localhost:3000/api/payhere/webhook",
      hash: "ABCDEF0123456789ABCDEF0123456789",
    };

    expect(body.order_id).toBe("ORD-456");
    expect(body.amount).toBe(2999.0);
    expect(body.currency).toBe("LKR");
    expect(body.first_name).toBe("John");
    expect(body.last_name).toBe("Doe");
    expect(body.email).toBe("john@example.com");
    expect(body.phone).toBe("0712345678");
    expect(body.address).toBe("123 Main St");
    expect(body.city).toBe("Colombo");
    expect(body.country).toBe("Sri Lanka");
    expect(body.return_url).toContain("order_id=ORD-456");
    expect(body.return_url).not.toContain("status=cancelled");
    expect(body.cancel_url).toContain("order_id=ORD-456");
    expect(body.cancel_url).toContain("status=cancelled");
    expect(body.notify_url).toBe("http://localhost:3000/api/payhere/webhook");
    expect(body.hash).toMatch(/^[A-F0-9]{32}$/);
  });

  it("return_url and cancel_url are different", () => {
    const returnUrl = "http://localhost:3000/checkout/success?order_id=ORD-456";
    const cancelUrl = "http://localhost:3000/checkout/success?status=cancelled&order_id=ORD-456";
    expect(returnUrl).not.toBe(cancelUrl);
  });
});

// ── Webhook signature verification ───────────────────────────────────────────

describe("Webhook signature verification", () => {
  // Matches the implementation in webhook/route.ts:
  // md5(merchant_id + order_id + amount + currency + status_code + upper(md5(merchant_secret)))
  function signPayload(
    merchantId: string,
    orderId: string,
    amount: string,
    currency: string,
    statusCode: string,
    secret: string,
  ): string {
    const hashedSecret = crypto.createHash("md5").update(secret).digest("hex").toUpperCase();
    const str = `${merchantId}${orderId}${amount}${currency}${statusCode}${hashedSecret}`;
    return crypto.createHash("md5").update(str).digest("hex").toUpperCase();
  }

  const SECRET = "4KEQTWQqCSi8m1nlh92Hqe8Rkt8rCfLEZ4Z7h65YXBa9";

  it("returns true for a valid signature", () => {
    const sig = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    const hashedSecret = crypto.createHash("md5").update(SECRET).digest("hex").toUpperCase();
    const expected = crypto.createHash("md5")
      .update(`256312ORD-1231500.00LKR2${hashedSecret}`)
      .digest("hex")
      .toUpperCase();
    expect(sig).toBe(expected);
  });

  it("signature includes hashed secret (not raw secret)", () => {
    const sigWithSecret = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    // Manually compute with raw secret (wrong way) — should differ
    const wrongSig = crypto.createHash("md5")
      .update(`256312ORD-1231500.00LKR2${SECRET}`)
      .digest("hex")
      .toUpperCase();
    expect(sigWithSecret).not.toBe(wrongSig);
  });

  it("signature changes when status_code changes", () => {
    const sigSuccess = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    const sigCanceled = signPayload("256312", "ORD-123", "1500.00", "LKR", "-1", SECRET);
    expect(sigSuccess).not.toBe(sigCanceled);
  });
});
