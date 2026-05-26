// app/checkout/__tests__/payhere-webhook.test.ts
import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ── Re-implement the signature verification from the webhook route ───────────
// PayHere computes: md5(merchant_id + order_id + amount + currency + status_code + upper(md5(merchant_secret)))

export function verifyPayHereSignature(params: {
  merchantId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  md5sig: string;
  secret: string;
}): boolean {
  const { merchantId, orderId, amount, currency, status, md5sig, secret } = params;
  const hashedSecret = crypto.createHash("md5").update(secret).digest("hex").toUpperCase();
  const str = `${merchantId}${orderId}${amount}${currency}${status}${hashedSecret}`;
  const expected = crypto.createHash("md5").update(str).digest("hex").toUpperCase();
  return expected === md5sig.toUpperCase();
}

function signPayload(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  status: string,
  secret: string,
): string {
  const hashedSecret = crypto.createHash("md5").update(secret).digest("hex").toUpperCase();
  const str = `${merchantId}${orderId}${amount}${currency}${status}${hashedSecret}`;
  return crypto.createHash("md5").update(str).digest("hex").toUpperCase();
}

const SECRET = "4KEQTWQqCSi8m1nlh92Hqe8Rkt8rCfLEZ4Z7h65YXBa9";

describe("verifyPayHereSignature", () => {
  it("returns true for a valid signature (status_code=2 success)", () => {
    const sig = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: "1500.00",
      currency: "LKR",
      status: "2",
      md5sig: sig,
      secret: SECRET,
    });
    expect(result).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: "1500.00",
      currency: "LKR",
      status: "2",
      md5sig: "INVALID0000000000000000000000000",
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it("returns false when orderId differs", () => {
    const sig = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-999",
      amount: "1500.00",
      currency: "LKR",
      status: "2",
      md5sig: sig,
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it("returns false when amount differs", () => {
    const sig = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: "2000.00",
      currency: "LKR",
      status: "2",
      md5sig: sig,
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it("returns false when status_code differs (success vs canceled)", () => {
    const sig = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: "1500.00",
      currency: "LKR",
      status: "-1",
      md5sig: sig,
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it("returns false when secret differs", () => {
    const sig = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: "1500.00",
      currency: "LKR",
      status: "2",
      md5sig: sig,
      secret: "wrong-secret",
    });
    expect(result).toBe(false);
  });

  it("signature is case-insensitive (uppercase hex)", () => {
    const sig = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    const lowerSig = sig.toLowerCase();
    const result = verifyPayHereSignature({
      merchantId: "256312",
      orderId: "ORD-123",
      amount: "1500.00",
      currency: "LKR",
      status: "2",
      md5sig: lowerSig,
      secret: SECRET,
    });
    expect(result).toBe(true);
  });

  it("uses hashed secret (upper(md5(secret))) not raw secret", () => {
    const correctSig = signPayload("256312", "ORD-123", "1500.00", "LKR", "2", SECRET);
    // Manually create wrong signature using raw secret
    const strWrong = `256312ORD-1231500.00LKR2${SECRET}`;
    const wrongSig = crypto.createHash("md5").update(strWrong).digest("hex").toUpperCase();
    expect(correctSig).not.toBe(wrongSig);
  });
});

describe("PayHere webhook data parsing", () => {
  it("parses form-urlencoded body correctly", () => {
    const body =
      "payment_id=pmt-abc123&merchant_id=256312&order_id=ORD-456&amount=2999.00&currency=LKR&status=COMPLETED&status_code=2&md5sig=ABCDEF0123456789&method=VISA&status_message=Payment successful";
    const params = new URLSearchParams(body);
    expect(params.get("order_id")).toBe("ORD-456");
    expect(params.get("status")).toBe("COMPLETED");
    expect(params.get("status_code")).toBe("2");
    expect(params.get("method")).toBe("VISA");
    expect(Number(params.get("amount"))).toBe(2999.0);
  });

  it("handles decimal amounts correctly", () => {
    const payhereAmount = Number("2999.50");
    const amountLkr = Number(payhereAmount.toFixed(2));
    expect(amountLkr).toBe(2999.5);
  });

  it("form data includes status_code field", () => {
    const body = "status_code=2&merchant_id=256312&order_id=ORD-123";
    const params = new URLSearchParams(body);
    expect(params.get("status_code")).toBe("2");
  });
});
