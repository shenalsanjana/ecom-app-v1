import { describe, expect, it } from "vitest";
import { paymentErrorMessage, readPaymentInitiationResponse } from "../payhere-client";

describe("generic payment client helpers", () => {
  it("parses provider initiation JSON", async () => {
    const response = new Response(JSON.stringify({
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: "https://gateway.example",
      fields: { _orderId: "ORD-1" },
    }));

    await expect(readPaymentInitiationResponse(response)).resolves.toMatchObject({
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: "https://gateway.example",
    });
  });

  it("uses provider-generic error message", () => {
    expect(paymentErrorMessage("Failed to initialize payment")).toBe(
      "Failed to initialize payment. Your order is saved. Please try again or contact support.",
    );
  });
});
