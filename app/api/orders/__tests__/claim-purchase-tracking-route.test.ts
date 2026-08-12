import { beforeEach, describe, expect, it, vi } from "vitest";

const { orderUpdateMany } = vi.hoisted(() => ({
  orderUpdateMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      updateMany: orderUpdateMany,
    },
  },
}));

import { POST } from "../[id]/claim-purchase-tracking/route";

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/orders/[id]/claim-purchase-tracking", () => {
  beforeEach(() => {
    orderUpdateMany.mockReset();
  });

  it("claims the order when purchaseTrackedAt is still unset", async () => {
    orderUpdateMany.mockResolvedValue({ count: 1 });

    const res = await POST(
      new Request("https://shop.example.com/api/orders/ORD-1/claim-purchase-tracking", { method: "POST" }),
      makeContext("ORD-1"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: true });
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "ORD-1", purchaseTrackedAt: null },
      data: { purchaseTrackedAt: expect.any(Date) },
    });
  });

  it("does not claim when purchaseTrackedAt is already set (duplicate call)", async () => {
    orderUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      new Request("https://shop.example.com/api/orders/ORD-1/claim-purchase-tracking", { method: "POST" }),
      makeContext("ORD-1"),
    );

    expect(await res.json()).toEqual({ claimed: false });
  });

  it("does not claim for a non-existent order", async () => {
    orderUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      new Request("https://shop.example.com/api/orders/MISSING/claim-purchase-tracking", { method: "POST" }),
      makeContext("MISSING"),
    );

    expect(await res.json()).toEqual({ claimed: false });
  });
});
