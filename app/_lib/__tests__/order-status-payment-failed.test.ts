import { describe, expect, it } from "vitest";
import { checkoutPaymentState, paymentStatusLabel } from "../order-status";

describe("PAYMENT_FAILED status", () => {
  it("labels failed online payments", () => {
    expect(paymentStatusLabel("PAYMENT_FAILED")).toBe("Payment failed");
  });

  it("treats PAYMENT_FAILED as cancelled on checkout success page", () => {
    expect(
      checkoutPaymentState({
        paymentMethod: "MINTPAY",
        paymentStatus: "PAYMENT_FAILED",
      }),
    ).toEqual({ isPaid: false, isCod: false, isCancelled: true });
  });
});
