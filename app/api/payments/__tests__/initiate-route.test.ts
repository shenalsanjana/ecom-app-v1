import { beforeEach, describe, expect, it, vi } from "vitest";

const { orderFindUnique, initiate, claim } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  initiate: vi.fn(),
  claim: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { order: { findUnique: orderFindUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ order: {
      updateMany: claim, update: async () => ({}),
    } }),
  },
}));

vi.mock("@/app/_lib/payments/registry", async (orig) => {
  const actual = await orig<typeof import("@/app/_lib/payments/registry")>();
  return {
    ...actual,
    getPaymentProvider: () => ({ method: "KOKO", displayName: "Koko", initiate }),
  };
});

import { POST } from "../initiate/route";

const ORDER = {
  id: "ORD-1",
  paymentMethod: "KOKO",
  paymentStatus: "PENDING",
  user: null,
  items: [],
};

describe("POST /api/payments/initiate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claim.mockResolvedValue({ count: 1 });
    process.env.APP_URL = "https://shop.example.com";
    initiate.mockResolvedValue({
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: "https://qaapi.paykoko.com/api/merchants/orderCreate",
      fields: { _orderId: "ORD-1" },
    });
  });

  it("initiates the order's online provider", async () => {
    orderFindUnique.mockResolvedValue(ORDER);

    const res = await POST(new Request("https://shop.example.com/api/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ orderId: "ORD-1" }),
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      provider: "KOKO",
      gatewayUrl: "https://qaapi.paykoko.com/api/merchants/orderCreate",
    });
  });

  it("rejects COD orders", async () => {
    orderFindUnique.mockResolvedValue({ ...ORDER, paymentMethod: "COD" });

    const res = await POST(new Request("https://shop.example.com/api/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ orderId: "ORD-1" }),
    }));

    expect(res.status).toBe(409);
  });
  it("does not issue a gateway session if cancellation or expiry wins the claim", async () => {
    orderFindUnique.mockResolvedValue(ORDER);
    claim.mockResolvedValue({ count: 0 });
    const result = await POST(new Request("https://example.test/api/payments/initiate", { method: "POST", body: JSON.stringify({ orderId: "ORD-1" }) }));
    expect(result.status).toBe(409);
    expect(initiate).not.toHaveBeenCalled();
  });
  it("rejects closed orders and orders requiring payment review", async () => {
    orderFindUnique.mockResolvedValue({ ...ORDER, paymentReviewRequired: true });
    expect((await POST(new Request("https://example.test/api/payments/initiate", { method: "POST", body: JSON.stringify({ orderId: "ORD-1" }) }))).status).toBe(409);
    expect(initiate).not.toHaveBeenCalled();
  });

  it("returns 404 when the order does not exist", async () => {
    orderFindUnique.mockResolvedValue(null);

    const res = await POST(new Request("https://shop.example.com/api/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ orderId: "ORD-1" }),
    }));

    expect(res.status).toBe(404);
  });

  it("rejects an already-paid order with 409", async () => {
    orderFindUnique.mockResolvedValue({ ...ORDER, paymentStatus: "PAID" });

    const res = await POST(new Request("https://shop.example.com/api/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ orderId: "ORD-1" }),
    }));

    expect(res.status).toBe(409);
  });

  it("returns 500 when the provider reports a config error", async () => {
    orderFindUnique.mockResolvedValue(ORDER);
    initiate.mockRejectedValueOnce(new Error("KOKO_API_KEY must be set"));

    const res = await POST(new Request("https://shop.example.com/api/payments/initiate", {
      method: "POST",
      body: JSON.stringify({ orderId: "ORD-1" }),
    }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Payment gateway is not configured" });
  });
});
