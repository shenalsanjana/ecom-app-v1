import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { orderFindUnique, orderUpdate, noteCreate, productUpdateMany, txn } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  noteCreate: vi.fn(),
  productUpdateMany: vi.fn(),
  txn: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const client = {
    order: { findUnique: orderFindUnique, update: orderUpdate },
    orderNote: { create: noteCreate },
    product: { updateMany: productUpdateMany },
    orderItem: { update: vi.fn(), delete: vi.fn() },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: any) => fn(client)) } };
});

import { addNote, markCodCollected } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  orderFindUnique.mockReset();
  orderUpdate.mockReset();
  noteCreate.mockReset();
  productUpdateMany.mockReset();
  txn.mockReset().mockImplementation(async (fn: any) => {
    const client = {
      order: { findUnique: orderFindUnique, update: orderUpdate },
      orderNote: { create: noteCreate },
      product: { updateMany: productUpdateMany },
      orderItem: { update: vi.fn(), delete: vi.fn() },
    };
    return fn(client);
  });
});

describe("addNote", () => {
  it("requires admin and rejects empty body", async () => {
    const res = await addNote("o1", "   ");
    expect(requireAdmin).toHaveBeenCalled();
    expect(res).toEqual({ success: false, error: "Note cannot be empty" });
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("creates a note attributed to the admin", async () => {
    noteCreate.mockResolvedValueOnce({});
    const res = await addNote("o1", "Deliver after 5pm");
    expect(noteCreate).toHaveBeenCalledWith({
      data: { orderId: "o1", authorEmail: "admin@x.test", body: "Deliver after 5pm" },
    });
    expect(res).toEqual({ success: true });
  });
});

describe("markCodCollected", () => {
  it("only works for COD orders pending collection", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", paymentMethod: "PAYHERE", paymentStatus: "PAID" });
    const res = await markCodCollected("o1");
    expect(res).toEqual({ success: false, error: "Not a COD order awaiting collection" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("sets paymentStatus to COD_COLLECTED", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", paymentMethod: "COD", paymentStatus: "COD_PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await markCodCollected("o1");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { paymentStatus: "COD_COLLECTED" } });
    expect(res).toEqual({ success: true });
  });
});

import { advanceStatus } from "../actions";

describe("advanceStatus", () => {
  it("rejects an illegal transition", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING" });
    const res = await advanceStatus("o1", "DELIVERED");
    expect(res).toEqual({ success: false, error: "Cannot move order from PENDING to DELIVERED" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("allows PENDING→CONFIRMED", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await advanceStatus("o1", "CONFIRMED");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res).toEqual({ success: true });
  });
});

import { cancelOrder } from "../actions";

describe("cancelOrder", () => {
  it("is idempotent — rejects an already-cancelled order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CANCELLED", items: [] });
    const res = await cancelOrder("o1");
    expect(res).toEqual({ success: false, error: "Order is already cancelled" });
  });

  it("rejects cancelling a delivered order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "DELIVERED", items: [] });
    const res = await cancelOrder("o1");
    expect(res).toEqual({ success: false, error: "Delivered orders cannot be cancelled" });
  });

  it("restores stock and warns when the order was paid", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "PAID",
      items: [{ productId: "p1", quantity: 2 }],
    });
    const res = await cancelOrder("o1");
    expect(productUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1" }, data: { stock: { increment: 2 } },
    });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res).toEqual({ success: true, warning: "Order was paid — refund must be handled manually." });
  });
});
