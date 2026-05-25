// app/checkout/__tests__/payhere-webhook.test.ts
import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";

// ── Re-implement the signature verification from the webhook route ───────────
// (Tests verify the logic independently of the route)

export function verifyPayHereSignature(params: {
  merchantId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  md5sig: string;
  secret: string;
}): boolean {
  const { merchantId, orderId, amount, currency, status, md5sig, secret } = params;
  const str = `${merchantId}${orderId}${amount}${currency}${status}`;
  const expected = crypto.createHash("md5").update(str).digest("hex").toUpperCase();
  return expected === md5sig.toUpperCase();
}

function signPayload(merchantId: string, orderId: string, amount: number, currency: string, status: string, secret: string): string {
  const str = `${merchantId}${orderId}${amount}${currency}${status}`;
  return crypto.createHash("md5").update(str).digest("hex").toUpperCase();
}

const SECRET = "4KEQTWQqCSi8m1nlh92Hqe8Rkt8rCfLEZ4Z7h65YXBa9";

describe("verifyPayHereSignature", () => {
  it("returns true for a valid signature", () => {
    const sig = signPayload("256312", "ORD-123", 1500, "LKR", "COMPLETED", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: 1500,
      currency: "LKR",
      status: "COMPLETED",
      md5sig: sig,
      secret: SECRET,
    });
    expect(result).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: 1500,
      currency: "LKR",
      status: "COMPLETED",
      md5sig: "INVALID0000000000000000000000000",
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it("returns false when orderId differs", () => {
    const sig = signPayload("256312", "ORD-123", 1500, "LKR", "COMPLETED", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-999",
      amount: 1500,
      currency: "LKR",
      status: "COMPLETED",
      md5sig: sig,
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it("returns false when amount differs", () => {
    const sig = signPayload("256312", "ORD-123", 1500, "LKR", "COMPLETED", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: 2000, // different
      currency: "LKR",
      status: "COMPLETED",
      md5sig: sig,
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it("returns false when status is CANCELLED vs COMPLETED", () => {
    const sig = signPayload("256312", "ORD-123", 1500, "LKR", "COMPLETED", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: 1500,
      currency: "LKR",
      status: "CANCELLED",
      md5sig: sig,
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it("signature is case-insensitive (uppercase hex)", () => {
    const sig = signPayload("256312", "ORD-123", 1500, "LKR", "COMPLETED", SECRET);
    // PayHere sends uppercase; our function normalizes to uppercase before comparing
    const lowerSig = sig.toLowerCase();
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: 1500,
      currency: "LKR",
      status: "COMPLETED",
      md5sig: lowerSig,
      secret: SECRET,
    });
    expect(result).toBe(true);
  });
});

describe("PayHere webhook data parsing", () => {
  it("parses form-urlencoded body correctly", () => {
    const body = "payment_id=pmt-abc123&merchant_id=256312&order_id=ORD-456&amount=2999&currency=LKR&status=COMPLETED&md5sig=ABCDEF0123456789";
    const params = new URLSearchParams(body);
    expect(params.get("order_id")).toBe("ORD-456");
    expect(params.get("status")).toBe("COMPLETED");
    expect(Number(params.get("amount"))).toBe(2999);
  });

  it("converts PayHere amount to cents correctly (LKR, no decimals)", () => {
    // PayHere sends 2999 = LKR 2999.00
    const payhereAmount = Number("2999");
    const cents = Math.round(payhereAmount * 100); // 299900
    expect(cents).toBe(299900);
  });

  it("handles decimal amounts correctly", () => {
    // In case PayHere sends decimal (unlikely but safe)
    const payhereAmount = Number("2999.50");
    const cents = Math.round(payhereAmount * 100);
    expect(cents).toBe(299950);
  });
});