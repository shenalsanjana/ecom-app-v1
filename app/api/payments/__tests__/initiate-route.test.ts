import { beforeEach, describe, expect, it, vi } from "vitest";

const { orderFindUnique, initiate } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  initiate: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { order: { findUnique: orderFindUnique } },
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
});
