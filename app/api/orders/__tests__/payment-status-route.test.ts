import { beforeEach, describe, expect, it, vi } from "vitest";

const { orderFindUnique } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: orderFindUnique,
    },
  },
}));

import { GET } from "../[id]/payment-status/route";

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/orders/[id]/payment-status", () => {
  beforeEach(() => {
    orderFindUnique.mockReset();
  });

  it("returns only paymentStatus and paymentMethod for a known order", async () => {
    orderFindUnique.mockResolvedValue({
      paymentStatus: "PAID",
      paymentMethod: "PAYHERE",
    });

    const res = await GET(
      new Request("https://shop.example.com/api/orders/ORD-1/payment-status"),
      makeContext("ORD-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ paymentStatus: "PAID", paymentMethod: "PAYHERE" });

    expect(orderFindUnique).toHaveBeenCalledWith({
      where: { id: "ORD-1" },
      select: { paymentStatus: true, paymentMethod: true },
    });
  });

  it("returns 404 when the order is not found", async () => {
    orderFindUnique.mockResolvedValue(null);

    const res = await GET(
      new Request("https://shop.example.com/api/orders/MISSING/payment-status"),
      makeContext("MISSING"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Order not found" });
  });

  it("does not leak customer or amount fields", async () => {
    orderFindUnique.mockResolvedValue({
      paymentStatus: "PENDING",
      paymentMethod: "PAYHERE",
    });

    const res = await GET(
      new Request("https://shop.example.com/api/orders/ORD-2/payment-status"),
      makeContext("ORD-2"),
    );

    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["paymentMethod", "paymentStatus"]);
  });
});
