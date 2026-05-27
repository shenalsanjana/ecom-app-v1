import { describe, expect, it } from "vitest";
import {
  payHerePaymentErrorMessage,
  readPayHerePaymentResponse,
} from "../payhere-client";

describe("readPayHerePaymentResponse", () => {
  it("parses a successful PayHere Checkout form response", async () => {
    const response = new Response(
      JSON.stringify({
        gatewayUrl: "https://sandbox.payhere.lk/pay/checkout",
        fields: {
          merchant_id: "256312",
          order_id: "ORD-123",
          amount: "2440.00",
          hash: "CHECKOUT_HASH",
        },
      }),
      { status: 200 },
    );

    await expect(readPayHerePaymentResponse(response)).resolves.toEqual({
      gatewayUrl: "https://sandbox.payhere.lk/pay/checkout",
      fields: {
        merchant_id: "256312",
        order_id: "ORD-123",
        amount: "2440.00",
        hash: "CHECKOUT_HASH",
      },
    });
  });

  it("returns an error for an empty response body", async () => {
    const response = new Response(null, { status: 500 });

    await expect(readPayHerePaymentResponse(response)).resolves.toEqual({
      error: "Payment gateway returned an empty response",
    });
  });

  it("returns an error for a non-JSON response body", async () => {
    const response = new Response("<html>Server error</html>", { status: 502 });

    await expect(readPayHerePaymentResponse(response)).resolves.toEqual({
      error: "Payment gateway returned an invalid response",
    });
  });
});

describe("payHerePaymentErrorMessage", () => {
  it("builds a retryable customer message from a gateway error", () => {
    expect(payHerePaymentErrorMessage("Payment gateway temporarily unavailable")).toBe(
      "Payment gateway temporarily unavailable. Your order is saved. Please try again or contact support.",
    );
  });

  it("uses a generic customer message when no gateway error exists", () => {
    expect(payHerePaymentErrorMessage()).toBe(
      "Payment gateway error. Your order is saved. Please try again or contact support.",
    );
  });
});
