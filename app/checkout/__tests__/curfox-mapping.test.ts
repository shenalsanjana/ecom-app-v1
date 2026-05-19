import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrderDetails } from "@/app/_lib/mailer";

vi.mock("@/app/_lib/courier/curfox-client", () => ({
  createCurfoxOrder: vi.fn(),
  CurfoxError: class CurfoxError extends Error {
    step: string;
    constructor(message: string, step: string) {
      super(message);
      this.name = "CurfoxError";
      this.step = step;
    }
  },
}));
vi.mock("@/app/_lib/mailer", () => ({
  sendDispatchNotificationEmail: vi.fn(),
  sendAdminFailureAlertEmail: vi.fn(),
  logMailerError: vi.fn(),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { update: vi.fn(async () => ({})) },
    curfoxCity: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
  },
}));

import { createCurfoxOrder } from "@/app/_lib/courier/curfox-client";
import { bookCourierAndNotify } from "../book-courier";

const ORDER: OrderDetails = {
  orderId: "ORD-1734567890-AB12CD",
  webNumber: "WEB0042",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+94770000000",
  items: [{ name: "T-Shirt", size: "M", price: 1200, quantity: 2 }],
  subtotal: 2400,
  shipping: 40,
  total: 2440,
  shippingAddress: {
    line1: "1 Walls Lane",
    line2: "Apt 4B",
    city: "Kotte",
    country: "Sri Lanka",
  },
  paymentMethod: "COD",
  paymentMethodDisplay: "Cash on Delivery",
  notes: "Leave at the gate",
};

beforeEach(() => {
  vi.mocked(createCurfoxOrder).mockReset();
  vi.mocked(createCurfoxOrder).mockResolvedValue("RA12345678");
});

async function callAndGetItem(order: OrderDetails = ORDER) {
  await bookCourierAndNotify({ order });
  expect(createCurfoxOrder).toHaveBeenCalledOnce();
  return vi.mocked(createCurfoxOrder).mock.calls[0][0].order_data[0];
}

describe("Curfox payload mirrors customer-entered details", () => {
  describe("customer_phone", () => {
    it("normalizes +94770000000 → 0770000000", async () => {
      const item = await callAndGetItem({ ...ORDER, customerPhone: "+94770000000" });
      expect(item.customer_phone).toBe("0770000000");
    });

    it("normalizes 94770000000 → 0770000000", async () => {
      const item = await callAndGetItem({ ...ORDER, customerPhone: "94770000000" });
      expect(item.customer_phone).toBe("0770000000");
    });

    it("leaves already-local 0770000000 unchanged", async () => {
      const item = await callAndGetItem({ ...ORDER, customerPhone: "0770000000" });
      expect(item.customer_phone).toBe("0770000000");
    });

    it("strips spaces and dashes from noisy inputs", async () => {
      const item = await callAndGetItem({ ...ORDER, customerPhone: "+94 77-000-0000" });
      expect(item.customer_phone).toBe("0770000000");
    });
  });

  describe("customer_address", () => {
    it("joins line1, line2, and city", async () => {
      const item = await callAndGetItem();
      expect(item.customer_address).toBe("1 Walls Lane, Apt 4B, Kotte");
    });

    it("omits line2 when not provided", async () => {
      const item = await callAndGetItem({
        ...ORDER,
        shippingAddress: { line1: "1 Walls Lane", city: "Kotte", country: "Sri Lanka" },
      });
      expect(item.customer_address).toBe("1 Walls Lane, Kotte");
    });
  });

  describe("remark (delivery notes)", () => {
    it("forwards trimmed notes to Curfox remark", async () => {
      const item = await callAndGetItem({ ...ORDER, notes: "  Leave at the gate  " });
      expect(item.remark).toBe("Leave at the gate");
    });

    it("omits remark entirely when notes are empty", async () => {
      const item = await callAndGetItem({ ...ORDER, notes: undefined });
      expect(item.remark).toBeUndefined();
    });

    it("omits remark when notes are whitespace-only", async () => {
      const item = await callAndGetItem({ ...ORDER, notes: "   " });
      expect(item.remark).toBeUndefined();
    });
  });
});
