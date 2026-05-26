import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPayment } from "@/app/_lib/payhere-api";

describe("verifyPayment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.PAYHERE_MODE = "sandbox";
    process.env.PAYHERE_MERCHANT_ID = "256312";
    process.env.PAYHERE_APP_ID = "app-id";
    process.env.PAYHERE_APP_SECRET = "app-secret";
  });

  it("treats a Retrieval API payment with status RECEIVED as verified", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token",
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 1,
            msg: "Found 1 payments",
            data: [
              {
                payment_id: 320025,
                order_id: "ORD-123",
                status: "RECEIVED",
                payhere_amount: "2440.00",
                payhere_currency: "LKR",
                payment_method: { method: "VISA" },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyPayment("ORD-123");

    expect(result).toMatchObject({
      verified: true,
      paymentId: "320025",
      amount: 2440,
      currency: "LKR",
      method: "VISA",
      statusText: "success",
    });
  });
});
