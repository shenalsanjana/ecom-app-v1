// app/checkout/__tests__/payhere-payment.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

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
    // Zod returns "Invalid input" for missing nested fields — confirm failure
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

  it("defaults returnUrl and notifyUrl", () => {
    const result = PaymentRequestSchema.parse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
    });
    expect(result.returnUrl).toBe("http://localhost:3000/checkout/success");
    expect(result.notifyUrl).toBe("http://localhost:3000/api/payhere/webhook");
  });

  it("accepts custom returnUrl and notifyUrl", () => {
    const result = PaymentRequestSchema.parse({
      orderId: "ORD-123",
      amount: 1500,
      customer: { name: "Test User", email: "test@example.com", phone: "0712345678" },
      returnUrl: "https://shop.example.com/success",
      notifyUrl: "https://shop.example.com/api/notify",
    });
    expect(result.returnUrl).toBe("https://shop.example.com/success");
    expect(result.notifyUrl).toBe("https://shop.example.com/api/notify");
  });
});

describe("PayHere API payload building", () => {
  it("builds pipe-delimited items string", () => {
    const items = [
      { name: "T-Shirt", quantity: 2, amount: 1500 },
      { name: "Jeans", quantity: 1, amount: 3000 },
    ];
    const itemsString = items
      .map((it) => `${it.name}|${it.quantity}|${Math.round(it.amount)}`)
      .join("|");
    expect(itemsString).toBe("T-Shirt|2|1500|Jeans|1|3000");
  });

  it("splits customer name into first_name and last_name", () => {
    const name = "John Peter Smith";
    const parts = name.split(" ");
    const first_name = parts[0];
    const last_name = parts.slice(1).join(" ") || name;
    expect(first_name).toBe("John");
    expect(last_name).toBe("Peter Smith");
  });

  it("handles single-word customer name as both first and last", () => {
    const name = "Madhavi";
    const parts = name.split(" ");
    const first_name = parts[0];
    const last_name = parts.slice(1).join(" ") || name;
    expect(first_name).toBe("Madhavi");
    expect(last_name).toBe("Madhavi");
  });

  it("encodes Basic auth header correctly", () => {
    const auth = Buffer.from("app-id:app-secret").toString("base64");
    expect(auth).toBe("YXBwLWlkOmFwcC1zZWNyZXQ=");
  });
});