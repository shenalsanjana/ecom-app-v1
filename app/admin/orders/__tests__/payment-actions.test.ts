import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), claim: vi.fn(), update: vi.fn(), note: vi.fn() }));
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: mock.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/payments/reconcile-unpaid", () => ({ reconcileUnpaidOrder: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const tx = { order: { findUnique: mock.find, updateMany: mock.claim, update: mock.update }, orderNote: { create: mock.note } };
  return { prisma: { ...tx, $transaction: async (fn: (client: unknown) => unknown) => fn(tx) } };
});
import { resolvePaymentReview } from "../payment-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ user: { id: "admin", email: "admin@example.test" } });
  mock.find.mockResolvedValue({ id: "o1", version: 1, status: "CANCELLED", paymentStatus: "PAYMENT_FAILED", paymentReviewRequired: true });
  mock.claim.mockResolvedValue({ count: 1 });
});
describe("manual payment review resolution", () => {
  it("requires a written outcome and current admin authorization", async () => {
    expect((await resolvePaymentReview("o1", "")).success).toBe(false);
    expect(mock.auth).toHaveBeenCalled();
    expect(mock.note).not.toHaveBeenCalled();
  });
  it("does not clear an unresolved active unpaid hold", async () => {
    mock.find.mockResolvedValue({ id: "o1", status: "PENDING", paymentStatus: "PENDING", paymentReviewRequired: true });
    expect((await resolvePaymentReview("o1", "Checked the provider portal")).success).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("records who resolved a cancelled payment review without changing payment amounts", async () => {
    expect((await resolvePaymentReview("o1", "Provider confirmed refund R123")).success).toBe(true);
    expect(mock.note).toHaveBeenCalledWith({ data: { orderId: "o1", authorEmail: "admin@example.test", body: "Payment review resolved: Provider confirmed refund R123" } });
    expect(mock.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { paymentReviewRequired: false, paymentReviewReason: null } });
  });
  it("does not resolve a review if a callback changed the order", async () => {
    mock.claim.mockResolvedValue({ count: 0 });
    expect((await resolvePaymentReview("o1", "Provider confirmed refund R123")).success).toBe(false);
    expect(mock.note).not.toHaveBeenCalled();
  });
});
