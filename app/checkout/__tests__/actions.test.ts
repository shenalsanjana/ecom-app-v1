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
    productVariant: {
      findMany: vi.fn(async () => [
        {
          id: "V1",
          sku: null,
          sizeStocks: [
            { size: "S", stock: 5 },
            { size: "M", stock: 5 },
            { size: "L", stock: 5 },
          ],
        },
      ]),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        variantSizeStock: {
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
vi.mock("@/app/_lib/store-settings", () => ({
  getDeliveryConfig: vi.fn().mockResolvedValue({ colombo: 350, other: 450, freeThreshold: 5000 }),
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
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderConfirmed: vi.fn(async () => undefined) }));

import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import {
  sendOrderConfirmationEmail,
  sendPendingPrepaidNotificationEmail,
} from "@/app/_lib/mailer";
import { notifyOrderConfirmed } from "@/app/_lib/order-notifications";
import { auth } from "@/app/_lib/auth";
import { processOrder, type ProcessOrderInput } from "../actions";

const baseInput: Omit<ProcessOrderInput, "paymentMethod"> = {
  items: [{ productId: "P1", variantId: "V1", color: "White", name: "T-Shirt", price: 1200, quantity: 2, size: "M" }],
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
  vi.mocked(notifyOrderConfirmed).mockClear();
  txOrderCreate.mockClear();
});

describe("processOrder — COD path", () => {
  it("does not book the courier at checkout; still sends customer confirmation; returns success", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "true";
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
    expect(bookCourierAndNotify).not.toHaveBeenCalled();
    expect(notifyOrderConfirmed).toHaveBeenCalledOnce();
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
  it.each(["PAYHERE", "KOKO", "MINTPAY"] as const)(
    "%s: skips courier, sends pending-prepaid email; no customer confirmation until payment verified",
    async (paymentMethod) => {
      const result = await processOrder({ ...baseInput, paymentMethod });
      expect(result.success).toBe(true);
      expect(bookCourierAndNotify).not.toHaveBeenCalled();
      expect(sendPendingPrepaidNotificationEmail).toHaveBeenCalledOnce();
      // Customer confirmation email must NOT be sent here — it is sent by the
      // webhook handler only after payment is successfully verified.
      expect(notifyOrderConfirmed).not.toHaveBeenCalled();
    },
  );

  it.each(["PAYHERE", "KOKO", "MINTPAY"] as const)(
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

  it("persists the Mintpay display name", async () => {
    await processOrder({ ...baseInput, paymentMethod: "MINTPAY" });
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentMethodDisplay: "Mintpay",
        }),
      }),
    );
  });

  it("does not write rbNumber for new orders", async () => {
    await processOrder({ ...baseInput, paymentMethod: "COD" });
    const calls = vi.mocked(txOrderCreate).mock.calls as unknown as [
      [{ data: Record<string, unknown> }],
      ...[{ data: Record<string, unknown> }][],
    ];
    const call = calls[0][0];
    expect(call.data).not.toHaveProperty("rbNumber");
  });
});

describe("processOrder — never throws downstream failures back to the customer", () => {
  it("returns success even if customer-confirmation email fails", async () => {
    vi.mocked(notifyOrderConfirmed).mockRejectedValueOnce(new Error("dispatcher down"));
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
  });
});

describe("processOrder — size is required", () => {
  it("rejects a sized product checked out without a size", async () => {
    const result = await processOrder({
      ...baseInput,
      items: [{ productId: "P1", variantId: "V1", color: "White", name: "T-Shirt", price: 1200, quantity: 2, size: null }],
      paymentMethod: "COD",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/select a size/i);
    }
  });

  it("still rejects a size the product does not offer", async () => {
    const result = await processOrder({
      ...baseInput,
      items: [{ productId: "P1", variantId: "V1", color: "White", name: "T-Shirt", price: 1200, quantity: 2, size: "XXL" }],
      paymentMethod: "COD",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not available/i);
    }
  });
});

describe("processOrder — phone-only customer (no email)", () => {
  it("COD checkout with no customer email: order succeeds and confirmation is dispatched", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "U1", name: "Phone Customer", email: null },
    } as never);
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
    expect(notifyOrderConfirmed).toHaveBeenCalledOnce();
  });
});

describe("processOrder — customer name requirement", () => {
  it("rejects logged-in checkout when session.user.name is empty", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "U1", name: "", email: "user@example.com" },
    } as never);

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/name/i);
    }
  });

  it("rejects logged-in checkout when session.user.name is whitespace-only", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "U1", name: "   ", email: "user@example.com" },
    } as never);

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(false);
  });
});

describe("processOrder — contact details", () => {
  it("guest checkout without an email succeeds (email now optional)", async () => {
    const result = await processOrder({
      ...baseInput,
      guestInfo: { name: "Jane Doe", phone: "+94770000000" },
      paymentMethod: "COD",
    });
    expect(result.success).toBe(true);
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ guestEmail: null }) }),
    );
  });

  it("stores the primary contact number in canonical +94 form", async () => {
    await processOrder({ ...baseInput, contactPhone: "0770000000", paymentMethod: "COD" });
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerPhone: "+94770000000" }),
      }),
    );
  });

  it("rejects a landline primary number (the SMS target must be mobile)", async () => {
    const result = await processOrder({ ...baseInput, contactPhone: "0112345678", paymentMethod: "COD" });
    expect(result.success).toBe(false);
  });

  it("persists the alternate phone on the order (courier-only; profile untouched)", async () => {
    await processOrder({ ...baseInput, alternatePhone: "0712223333", paymentMethod: "COD" });
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ alternatePhone: "0712223333" }),
      }),
    );
  });
});
