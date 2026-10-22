import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ find: vi.fn(), list: vi.fn(), claim: vi.fn(), update: vi.fn(), event: vi.fn(), paid: vi.fn(), failed: vi.fn(), koko: vi.fn(), payhere: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const tx = { order: { findUnique: mock.find, findMany: mock.list, updateMany: mock.claim, update: mock.update }, paymentEvent: { upsert: mock.event } };
  return { prisma: { ...tx, $transaction: async (fn: (client: unknown) => unknown) => fn(tx) } };
});
vi.mock("@/app/_lib/payhere-api", () => ({ verifyPayment: mock.payhere }));
vi.mock("../koko", () => ({ fetchKokoOrderStatus: mock.koko }));
vi.mock("../registry", () => ({ ONLINE_PAYMENT_METHODS: ["PAYHERE", "KOKO", "MINTPAY"] }));
vi.mock("../order-finalization", () => ({ finalizePaidPayment: mock.paid, finalizeFailedPayment: mock.failed }));

import { reconcileUnpaidOrder, reconcileUnpaidOrders } from "../reconcile-unpaid";

const now = new Date("2026-10-15T10:00:00Z");
const order = { id: "o1", version: 0, status: "PENDING", paymentStatus: "PENDING", paymentMethod: "KOKO", createdAt: new Date("2026-10-15T07:00:00Z"), paymentStartedAt: new Date("2026-10-15T07:00:01Z") };
beforeEach(() => {
  vi.clearAllMocks();
  mock.find.mockReset().mockResolvedValue(order);
  mock.list.mockReset().mockResolvedValue([]);
  mock.claim.mockReset().mockResolvedValue({ count: 1 });
  mock.koko.mockReset().mockResolvedValue("PENDING");
  mock.payhere.mockReset().mockResolvedValue({ verified: false, error: "No payment found" });
  mock.paid.mockReset().mockResolvedValue({ status: "success" });
  mock.failed.mockReset().mockResolvedValue({ status: "failed" });
});

describe("unpaid reconciliation policy", () => {
  it("does not expire COD or recent orders", async () => {
    mock.find.mockResolvedValueOnce({ ...order, paymentMethod: "COD" });
    expect((await reconcileUnpaidOrder("o1", now)).status).toBe("not_eligible");
    mock.find.mockResolvedValueOnce({ ...order, createdAt: now });
    expect((await reconcileUnpaidOrder("o1", now)).status).toBe("not_due");
    expect(mock.failed).not.toHaveBeenCalled();
  });
  it("expires only an uninitiated online order with an atomic initiation guard", async () => {
    mock.find.mockResolvedValue({ ...order, paymentStartedAt: null });
    expect((await reconcileUnpaidOrder("o1", now)).status).toBe("failed");
    expect(mock.failed).toHaveBeenCalledWith("o1", "KOKO", expect.any(String), { uninitiatedOnly: true });
  });
  it("honors a server-verified Koko success", async () => {
    mock.koko.mockResolvedValue("SUCCESS");
    expect((await reconcileUnpaidOrder("o1", now)).status).toBe("success");
    expect(mock.paid).toHaveBeenCalledWith("o1", "KOKO");
    expect(mock.failed).not.toHaveBeenCalled();
  });
  it("releases a verified Koko failure through the common finalizer", async () => {
    mock.koko.mockResolvedValue("FAILED");
    await reconcileUnpaidOrder("o1", now);
    expect(mock.failed).toHaveBeenCalledWith("o1", "KOKO", "Verified by reconciliation");
  });
  it("keeps an unresolved payment's stock held and flags review", async () => {
    expect((await reconcileUnpaidOrder("o1", now)).status).toBe("review_required");
    expect(mock.failed).not.toHaveBeenCalled();
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentReviewRequired: true }) }));
  });
  it("does not treat PayHere no-records as proof of non-payment", async () => {
    mock.find.mockResolvedValue({ ...order, paymentMethod: "PAYHERE" });
    expect((await reconcileUnpaidOrder("o1", now)).status).toBe("review_required");
    expect(mock.failed).not.toHaveBeenCalled();
  });
  it("passes verified amount and currency through for an exact order comparison", async () => {
    mock.find.mockResolvedValue({ ...order, paymentMethod: "PAYHERE" });
    mock.payhere.mockResolvedValue({ verified: true, paymentId: "p1", amount: 2500, currency: "LKR" });
    await reconcileUnpaidOrder("o1", now);
    expect(mock.paid).toHaveBeenCalledWith("o1", "PAYHERE", { reference: "p1", amount: 2500, currency: "LKR" });
  });
  it("requires staff review when Mintpay cannot be queried", async () => {
    mock.find.mockResolvedValue({ ...order, paymentMethod: "MINTPAY" });
    expect((await reconcileUnpaidOrder("o1", now)).status).toBe("review_required");
    expect(mock.failed).not.toHaveBeenCalled();
  });
  it("does not overwrite payment that changes during a provider lookup", async () => {
    mock.claim.mockResolvedValue({ count: 0 });
    expect((await reconcileUnpaidOrder("o1", now)).status).toBe("changed");
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("bounds the scheduled batch and excludes already flagged review orders", async () => {
    expect(await reconcileUnpaidOrders(now)).toEqual([]);
    expect(mock.list).toHaveBeenCalledWith(expect.objectContaining({ take: 5, where: expect.objectContaining({ paymentReviewRequired: false, paymentStatus: "PENDING" }) }));
  });
});
