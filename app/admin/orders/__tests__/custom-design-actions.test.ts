import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), order: vi.fn(), claim: vi.fn(), item: vi.fn(), note: vi.fn() }));
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: mock.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({ prisma: { $transaction: mock.transaction } }));
import { setCustomDesignReceived } from "../custom-design-actions";

const order = (received: Date | null = null) => ({ id: "order", version: 2, status: "CONFIRMED", paymentStatus: "PAID", deletedAt: null,
  items: [{ id: "item", name: "Custom Tote", isCustomizedDesign: true, designReceivedAt: received }] });
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({ user: { email: "admin@example.test" } });
  mock.order.mockResolvedValue(order());
  mock.claim.mockResolvedValue({ count: 1 });
  mock.transaction.mockImplementation(async fn => fn({ order: { findUnique: mock.order, updateMany: mock.claim }, orderItem: { update: mock.item }, orderNote: { create: mock.note } }));
});
describe("admin custom design receipt", () => {
  it("requires admin authorization before accessing an order", async () => {
    mock.auth.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(setCustomDesignReceived("order", "item", true)).rejects.toThrow("NEXT_REDIRECT");
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("marks the order-scoped item received and records an admin audit note", async () => {
    expect(await setCustomDesignReceived("order", "item", true)).toEqual({ success: true });
    expect(mock.order).toHaveBeenCalledWith({ where: { id: "order" }, include: { items: { where: { id: "item" } } } });
    expect(mock.claim).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "order", version: 2 }) }));
    expect(mock.item).toHaveBeenCalledWith({ where: { id: "item" }, data: { designReceivedAt: expect.any(Date) } });
    expect(mock.note).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: "order", authorEmail: "admin@example.test", body: expect.stringContaining("Custom Tote") }) });
  });
  it("can reset receipt and bring the reminder back", async () => {
    mock.order.mockResolvedValue(order(new Date()));
    expect(await setCustomDesignReceived("order", "item", false)).toEqual({ success: true });
    expect(mock.item).toHaveBeenCalledWith({ where: { id: "item" }, data: { designReceivedAt: null } });
  });
  it("does not duplicate notes or mutate the version when the state is unchanged", async () => {
    mock.order.mockResolvedValue(order(new Date()));
    expect(await setCustomDesignReceived("order", "item", true)).toEqual({ success: true });
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.item).not.toHaveBeenCalled();
    expect(mock.note).not.toHaveBeenCalled();
  });
  it.each([null, { ...order(), items: [] }, { ...order(), status: "CANCELLED" }, { ...order(), deletedAt: new Date() },
    { ...order(), items: [{ ...order().items[0], isCustomizedDesign: false }] }])("rejects an unavailable or unrelated item", async snapshot => {
    mock.order.mockResolvedValue(snapshot);
    expect(await setCustomDesignReceived("order", "other-item", true)).toMatchObject({ success: false });
    expect(mock.item).not.toHaveBeenCalled();
  });
  it("rejects a concurrent order mutation before updating receipt", async () => {
    mock.claim.mockResolvedValue({ count: 0 });
    expect(await setCustomDesignReceived("order", "item", true)).toMatchObject({ success: false, error: expect.stringContaining("changed") });
    expect(mock.item).not.toHaveBeenCalled();
  });
  it("does not expose database errors", async () => {
    mock.order.mockRejectedValue(new Error("private database detail"));
    expect(await setCustomDesignReceived("order", "item", true)).toEqual({ success: false, error: "Could not update design receipt. Please refresh and try again." });
  });
});
