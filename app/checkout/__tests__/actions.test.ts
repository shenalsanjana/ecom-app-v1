import { describe, it, expect, vi, beforeEach } from "vitest";

const { txOrderCreate } = vi.hoisted(() => ({
  txOrderCreate: vi.fn(async () => ({})),
}));

vi.mock("@/app/_lib/auth", () => ({
  auth: vi.fn(async () => null),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(),
      update: vi.fn(async () => ({})),
    },
    product: {
      findMany: vi.fn(async () => [{ id: "P1", sizes: "S,M,L" }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        product: {
          updateMany: async () => ({ count: 1 }),
        },
        order: {
          create: txOrderCreate,
        },
        $queryRaw: vi.fn().mockResolvedValue([{ next: 42n }]),
      }),
    ),
  },
}));
vi.mock("@/app/checkout/book-courier", () => ({
  bookCourierAndNotify: vi.fn(async () => undefined),
}));
vi.mock("@/app/_lib/mailer", async (orig) => {
  const actual = await orig<typeof import("@/app/_lib/mailer")>();
  return {
    ...actual,
    sendOrderConfirmationEmail: vi.fn(async () => undefined),
    sendPendingPrepaidNotificationEmail: vi.fn(async () => undefined),
  };
});

import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import {
  sendOrderConfirmationEmail,
  sendPendingPrepaidNotificationEmail,
} from "@/app/_lib/mailer";
import { processOrder, type ProcessOrderInput } from "../actions";

const baseInput: Omit<ProcessOrderInput, "paymentMethod"> = {
  items: [{ productId: "P1", name: "T-Shirt", price: 1200, quantity: 2, size: "M" }],
  shippingAddress: {
    line1: "1 Walls Lane",
    line2: "Apt 5",
    city: "Colombo",
    country: "Sri Lanka",
  },
  contactPhone: "+94770000000",
  guestInfo: { name: "Jane Doe", email: "jane@example.com", phone: "+94770000000" },
};

beforeEach(() => {
  vi.mocked(bookCourierAndNotify).mockClear();
  vi.mocked(sendOrderConfirmationEmail).mockClear();
  vi.mocked(sendPendingPrepaidNotificationEmail).mockClear();
  txOrderCreate.mockClear();
});

describe("processOrder — COD path", () => {
  it("calls bookCourierAndNotify and sends customer confirmation; returns success", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "true";
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
    expect(bookCourierAndNotify).toHaveBeenCalledOnce();
    expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
    expect(sendPendingPrepaidNotificationEmail).not.toHaveBeenCalled();
  });

  it("persists COD_PENDING paymentStatus and a WEB-prefixed webNumber", async () => {
    await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: "COD_PENDING",
          webNumber: expect.stringMatching(/^WEB\d{4,}$/),
        }),
      }),
    );
  });
});

describe("processOrder — prepaid paths", () => {
  it.each(["PAYHERE", "KOKO", "MINITPAY"] as const)(
    "%s: skips courier, sends pending-prepaid email + customer confirmation",
    async (paymentMethod) => {
      const result = await processOrder({ ...baseInput, paymentMethod });
      expect(result.success).toBe(true);
      expect(bookCourierAndNotify).not.toHaveBeenCalled();
      expect(sendPendingPrepaidNotificationEmail).toHaveBeenCalledOnce();
      expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
    },
  );

  it.each(["PAYHERE", "KOKO", "MINITPAY"] as const)(
    "%s: persists PENDING paymentStatus and a WEB-prefixed webNumber",
    async (paymentMethod) => {
      await processOrder({ ...baseInput, paymentMethod });
      expect(txOrderCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentStatus: "PENDING",
            webNumber: expect.stringMatching(/^WEB\d{4,}$/),
          }),
        }),
      );
    },
  );

  it("does not write rbNumber for new orders", async () => {
    await processOrder({ ...baseInput, paymentMethod: "COD" });
    const call = vi.mocked(txOrderCreate).mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(call.data).not.toHaveProperty("rbNumber");
  });
});

describe("processOrder — never throws downstream failures back to the customer", () => {
  it("returns success even if bookCourierAndNotify somehow throws", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "true";
    vi.mocked(bookCourierAndNotify).mockRejectedValueOnce(new Error("contract broken"));
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
  });

  it("returns success even if customer-confirmation email fails", async () => {
    vi.mocked(sendOrderConfirmationEmail).mockRejectedValueOnce(new Error("smtp down"));
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
  });
});
