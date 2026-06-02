import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { orderFindUnique, orderUpdate, noteCreate } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  noteCreate: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { findUnique: orderFindUnique, update: orderUpdate },
    orderNote: { create: noteCreate },
  },
}));

import { addNote, markCodCollected } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  orderFindUnique.mockReset();
  orderUpdate.mockReset();
  noteCreate.mockReset();
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
