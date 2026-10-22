vi.mock("@/app/_lib/stock-movements", () => ({ setStockMovementContext: vi.fn() }));
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  find: vi.fn(), claim: vi.fn(), update: vi.fn(), event: vi.fn(), previousEvent: vi.fn(), plain: vi.fn(), design: vi.fn(), notify: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => {
  const tx = {
    order: { findUnique: mock.find, updateMany: mock.claim, update: mock.update },
    paymentEvent: { upsert: mock.event, findFirst: mock.previousEvent },
    plainTshirtStock: { updateMany: mock.plain }, dtfDesign: { updateMany: mock.design },
  };
  return { prisma: { ...tx, $transaction: async (fn: (client: unknown) => unknown) => fn(tx) } };
});
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed: mock.notify }));
vi.mock("@/app/_lib/mailer", () => ({ logMailerError: vi.fn() }));

import { finalizeFailedPayment, finalizePaidPayment } from "../order-finalization";
import { OrderConflictError } from "@/app/_lib/order-concurrency";

beforeEach(() => {
  vi.clearAllMocks();
  mock.order = {
    id: "o1", version: 0, status: "PENDING", paymentStatus: "PENDING", paymentMethod: "KOKO",
    paymentStartedAt: new Date(), paymentReviewRequired: false, courierBookedAt: null,
    total: 2500, subtotal: 2150, shippingCost: 350, customerPhone: "+94770000000", user: null,
    items: [{ name: "Tee", quantity: 1, plainTshirtStockId: "blank", dtfDesignId: "print" }],
  };
  mock.find.mockReset().mockImplementation(async () => mock.order ? structuredClone(mock.order) : null);
  mock.claim.mockReset().mockImplementation(async ({ where }: { where: { version: number; status: string; paymentStatus: string } }) => {
    if (!mock.order || where.version !== mock.order.version || where.status !== mock.order.status || where.paymentStatus !== mock.order.paymentStatus) return { count: 0 };
    mock.order.version = Number(mock.order.version) + 1;
    return { count: 1 };
  });
  mock.update.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => Object.assign(mock.order!, data));
  mock.event.mockReset().mockResolvedValue({});
  mock.previousEvent.mockReset().mockResolvedValue(null);
  mock.plain.mockReset().mockResolvedValue({ count: 1 });
  mock.design.mockReset().mockResolvedValue({ count: 1 });
  mock.notify.mockReset().mockResolvedValue(undefined);
});

describe("verified payment transitions", () => {
  it("records payment and dispatches a confirmation without restoring stock", async () => {
    expect(await finalizePaidPayment("o1", "KOKO")).toEqual({ status: "success" });
    expect(mock.order?.paymentStatus).toBe("PAID");
    expect(mock.notify).toHaveBeenCalledOnce();
    expect(mock.plain).not.toHaveBeenCalled();
    expect(mock.event).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ outcome: "PAID", result: "success" }) }));
  });
  it("restores each pool once on repeated verified failure", async () => {
    expect((await finalizeFailedPayment("o1", "KOKO", "failed")).status).toBe("failed");
    expect((await finalizeFailedPayment("o1", "KOKO", "failed")).status).toBe("already_failed");
    expect(mock.plain).toHaveBeenCalledOnce();
    expect(mock.design).toHaveBeenCalledOnce();
    expect(mock.order?.status).toBe("CANCELLED");
  });
  it("does not restore stock after payment has succeeded", async () => {
    await finalizePaidPayment("o1", "KOKO");
    expect((await finalizeFailedPayment("o1", "KOKO", "failed")).status).toBe("already_paid");
    expect(mock.plain).not.toHaveBeenCalled();
    expect(mock.order?.status).toBe("PENDING");
  });
  it("flags a second captured payment reference instead of treating it as a callback retry", async () => {
    await finalizePaidPayment("o1", "KOKO", { reference: "payment-1" });
    mock.previousEvent.mockResolvedValue({ providerReference: "payment-1" });
    expect((await finalizePaidPayment("o1", "KOKO", { reference: "payment-2" })).status).toBe("review_required");
    expect(mock.order).toMatchObject({ paymentStatus: "PAID", paymentReviewRequired: true });
    expect(mock.plain).not.toHaveBeenCalled();
  });
  it("records late payment for review without reviving a closed order", async () => {
    await finalizeFailedPayment("o1", "KOKO", "failed");
    expect((await finalizePaidPayment("o1", "KOKO")).status).toBe("review_required");
    expect(mock.order).toMatchObject({ status: "CANCELLED", paymentStatus: "PAYMENT_FAILED", paymentReviewRequired: true });
    expect(mock.plain).toHaveBeenCalledOnce();
    expect(mock.notify).not.toHaveBeenCalled();
  });
  it("rechecks a cancellation that wins between lookup and the payment claim", async () => {
    mock.claim.mockImplementationOnce(async () => {
      Object.assign(mock.order!, { version: 1, status: "CANCELLED", paymentStatus: "PAYMENT_FAILED" });
      return { count: 0 };
    });
    expect((await finalizePaidPayment("o1", "KOKO")).status).toBe("review_required");
    expect(mock.order?.paymentStatus).toBe("PAYMENT_FAILED");
    expect(mock.plain).not.toHaveBeenCalled();
  });
  it("keeps prepared stock held when a failure arrives after confirmation", async () => {
    mock.order!.status = "CONFIRMED";
    expect((await finalizeFailedPayment("o1", "KOKO", "failed")).status).toBe("review_required");
    expect(mock.plain).not.toHaveBeenCalled();
  });
  it("does not expire a hold if initiation won the race", async () => {
    expect((await finalizeFailedPayment("o1", "KOKO", "expired", { uninitiatedOnly: true })).status).toBe("not_expired");
    expect(mock.plain).not.toHaveBeenCalled();
  });
  it("rejects mismatched gateway amounts and currencies", async () => {
    expect((await finalizePaidPayment("o1", "KOKO", { amount: 1, currency: "LKR" })).status).toBe("review_required");
    expect(mock.order?.paymentStatus).toBe("PENDING");
    expect(mock.notify).not.toHaveBeenCalled();
  });
  it("returns an error after repeated conflicts so callers can retry", async () => {
    mock.claim.mockResolvedValue({ count: 0 });
    await expect(finalizePaidPayment("o1", "KOKO")).rejects.toBeInstanceOf(OrderConflictError);
    expect(mock.event).not.toHaveBeenCalled();
  });
  it("retries notification delivery on a duplicate verified success", async () => {
    mock.order!.paymentStatus = "PAID";
    expect((await finalizePaidPayment("o1", "KOKO")).status).toBe("already_processed");
    expect(mock.notify).toHaveBeenCalledOnce();
  });
  it("does not send a confirmation when a paid order was subsequently cancelled", async () => {
    Object.assign(mock.order!, { paymentStatus: "PAID", status: "CANCELLED" });
    expect((await finalizePaidPayment("o1", "KOKO")).status).toBe("already_processed");
    expect(mock.notify).not.toHaveBeenCalled();
  });
  it("ignores missing orders and mismatched providers", async () => {
    expect((await finalizePaidPayment("o1", "PAYHERE")).status).toBe("payment_method_mismatch");
    mock.order = null;
    expect((await finalizePaidPayment("missing", "KOKO")).status).toBe("order_not_found");
  });
});


describe("promotion payment notifications", () => {
  it("preserves saved coupon savings in the paid confirmation", async () => {
    mock.order!.adjustments = [{ id: "adj", label: "Coupon SAVE", amount: -100, promotion: true }];
    await finalizePaidPayment("o1", "KOKO");
    expect(mock.notify).toHaveBeenCalledWith(expect.objectContaining({ adjustments: [expect.objectContaining({ label: "Coupon SAVE", amount: -100 })], total: 2500 }));
  });
});
