vi.mock("@/app/_lib/stock-movements", () => ({ setStockMovementContext: vi.fn() }));
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DiscountRule } from "@/app/_lib/discounts";
const { discountFindMany, discountClaim } = vi.hoisted(() => ({
  discountFindMany: vi.fn<() => Promise<DiscountRule[]>>().mockResolvedValue([]),
  discountClaim: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("@/app/_lib/product-publication", async importOriginal => ({ ...await importOriginal<typeof import("@/app/_lib/product-publication")>(), assertProductsPublished: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const { txOrderCreate, productVariantFindMany, plainStockFindMany, designFindMany } = vi.hoisted(() => ({
  txOrderCreate: vi.fn(async () => ({})),
  productVariantFindMany: vi.fn(async () => [
    {
      id: "V1",
      productId: "P1",
      color: "White",
      colorSlug: "white",
      sku: "DB-TEE-WHT-M",
      sizeStocks: [{ size: "S" }, { size: "M" }, { size: "L" }],
      price: null, archived: false, product: { dtfDesignId: "D1", name: "T-Shirt", price: 1200, status: "PUBLISHED", archived: false },
    },
  ]),
  plainStockFindMany: vi.fn(async () => [
    { id: "PS1", colorSlug: "white", size: "S", quantity: 5 },
    { id: "PS2", colorSlug: "white", size: "M", quantity: 5 },
    { id: "PS3", colorSlug: "white", size: "L", quantity: 5 },
  ]),
  designFindMany: vi.fn(async () => [{ id: "D1", quantity: 5 }]),
}));

vi.mock("@/app/_lib/session-user", () => ({
  getVerifiedSessionUser: vi.fn(async () => null),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(),
      update: vi.fn(async () => ({})),
    },
    productVariant: {
      findMany: productVariantFindMany,
    },
    plainTshirtStock: { findMany: plainStockFindMany },
    dtfDesign: { findMany: designFindMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        discount: { findMany: discountFindMany, updateMany: discountClaim, fields: { usageLimit: "usageLimit" } },
        plainTshirtStock: {
          updateMany: async () => ({ count: 1 }),
        },
        dtfDesign: {
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
import { getVerifiedSessionUser } from "@/app/_lib/session-user";
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
  discountFindMany.mockReset().mockResolvedValue([]);
  discountClaim.mockReset().mockResolvedValue({ count: 1 });
  vi.mocked(getVerifiedSessionUser).mockResolvedValue(null);
  vi.mocked(bookCourierAndNotify).mockClear();
  vi.mocked(sendOrderConfirmationEmail).mockClear();
  vi.mocked(sendPendingPrepaidNotificationEmail).mockClear();
  vi.mocked(notifyOrderConfirmed).mockClear();
  txOrderCreate.mockClear();
  productVariantFindMany.mockReset();
  productVariantFindMany.mockResolvedValue([
    {
      id: "V1", productId: "P1", color: "White", colorSlug: "white", sku: "DB-TEE-WHT-M",
      sizeStocks: [{ size: "S" }, { size: "M" }, { size: "L" }],
      price: null, archived: false, product: { dtfDesignId: "D1", name: "T-Shirt", price: 1200, status: "PUBLISHED", archived: false },
    },
  ]);
  plainStockFindMany.mockReset().mockResolvedValue([
    { id: "PS1", colorSlug: "white", size: "S", quantity: 5 },
    { id: "PS2", colorSlug: "white", size: "M", quantity: 5 },
    { id: "PS3", colorSlug: "white", size: "L", quantity: 5 },
  ]);
  designFindMany.mockReset().mockResolvedValue([{ id: "D1", quantity: 5 }]);
});

describe("processOrder — COD path", () => {
  it("requires review of a changed catalog price before creating an order", async () => {
    const result = await processOrder({ ...baseInput, items: [{ ...baseInput.items[0], price: 1 }], paymentMethod: "COD" });
    expect(result).toMatchObject({ success: false, priceChanges: [{ variantId: "V1", price: 1200 }] });
    expect(txOrderCreate).not.toHaveBeenCalled();
  });

  it("rejects an archived catalog variant even if it remains in a cart", async () => {
    const rows = await productVariantFindMany();
    productVariantFindMany.mockResolvedValueOnce(rows.map((row) => ({ ...row, archived: true })));
    expect((await processOrder({ ...baseInput, paymentMethod: "COD" })).success).toBe(false);
    expect(txOrderCreate).not.toHaveBeenCalled();
  });

  it("snapshots the database name rather than a submitted product name", async () => {
    await processOrder({ ...baseInput, items: [{ ...baseInput.items[0], name: "Altered name" }], paymentMethod: "COD" });
    expect(txOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ items: { create: [expect.objectContaining({ name: "T-Shirt", price: 1200 })] } }) }));
  });
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
    vi.mocked(getVerifiedSessionUser).mockResolvedValueOnce({
      id: "U1", name: "Phone Customer", email: null,
    } as never);
    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(true);
    expect(notifyOrderConfirmed).toHaveBeenCalledOnce();
  });
});

describe("processOrder — customer name requirement", () => {
  it("rejects logged-in checkout when session.user.name is empty", async () => {
    vi.mocked(getVerifiedSessionUser).mockResolvedValueOnce({
      id: "U1", name: "", email: "user@example.com",
    } as never);

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/name/i);
    }
  });

  it("rejects logged-in checkout when session.user.name is whitespace-only", async () => {
    vi.mocked(getVerifiedSessionUser).mockResolvedValueOnce({
      id: "U1", name: "   ", email: "user@example.com",
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

describe("processOrder — variant color snapshots", () => {
  it("stores database variant color/SKU instead of the cart color and passes them to COD notifications", async () => {
    await processOrder({
      ...baseInput,
      items: [
        {
          ...baseInput.items[0],
          color: "Spoofed Client Color",
        },
      ],
      paymentMethod: "COD",
    });

    const createCalls = vi.mocked(txOrderCreate).mock.calls as unknown as [
      [{ data: { items: { create: Array<Record<string, unknown>> } } }],
      ...[{ data: { items: { create: Array<Record<string, unknown>> } } }][],
    ];
    const createArg = createCalls[0][0];
    expect(createArg.data.items.create[0]).toMatchObject({
      color: "White",
      sku: "DB-TEE-WHT-M",
    });

    const notifyArg = vi.mocked(notifyOrderConfirmed).mock.calls[0][0];
    expect(notifyArg.items[0]).toMatchObject({
      color: "White",
      sku: "DB-TEE-WHT-M",
    });
  });

  it("snapshots the exact raw-material pool rows the line drew from", async () => {
    await processOrder({ ...baseInput, paymentMethod: "COD" });

    const createCalls = vi.mocked(txOrderCreate).mock.calls as unknown as [
      [{ data: { items: { create: Array<Record<string, unknown>> } } }],
      ...[{ data: { items: { create: Array<Record<string, unknown>> } } }][],
    ];
    const createArg = createCalls[0][0];
    expect(createArg.data.items.create[0]).toMatchObject({
      plainTshirtStockId: "PS2",
      dtfDesignId: "D1",
    });
  });

  it("passes database variant color/SKU to pending prepaid admin notification details", async () => {
    await processOrder({
      ...baseInput,
      items: [
        {
          ...baseInput.items[0],
          color: "Spoofed Client Color",
        },
      ],
      paymentMethod: "PAYHERE",
    });

    const pendingArg = vi.mocked(sendPendingPrepaidNotificationEmail).mock.calls[0][0];
    expect(pendingArg.order.items[0]).toMatchObject({
      color: "White",
      sku: "DB-TEE-WHT-M",
    });
  });

  it("rejects a cart line when the selected variant belongs to another product", async () => {
    productVariantFindMany.mockResolvedValueOnce([
      {
        id: "V1", productId: "OTHER-PRODUCT", color: "White", colorSlug: "white", sku: "DB-TEE-WHT-M",
        sizeStocks: [{ size: "M" }],
        price: null, archived: false, product: { dtfDesignId: "D1", name: "T-Shirt", price: 1200, status: "PUBLISHED", archived: false },
      },
    ]);

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/variant/i);
    }
    expect(txOrderCreate).not.toHaveBeenCalled();
    expect(notifyOrderConfirmed).not.toHaveBeenCalled();
  });
});

describe("processOrder — stale session (User row no longer exists)", () => {
  // Sessions are JWTs (auth.config.ts: strategy "jwt", maxAge 30 days). `token.uid`
  // is written once at login and never revalidated, so the cookie can outlive — or
  // predate — the User row it names (a restored/replaced database, a removed
  // account). Passing that id straight into order.create violates
  // `Order_userId_fkey` and the raw Prisma error was surfaced to the shopper.
  //
  // The checkout PAGE already tolerates this: resolveCheckoutPrefill(null, …)
  // returns null, so the guest form renders and the client submits guestInfo.
  // The action must use it rather than trusting the stale id.
  it("does not pass a non-existent userId to order.create", async () => {
    vi.mocked(getVerifiedSessionUser).mockResolvedValueOnce(null);

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });

    expect(result.success).toBe(true);
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: null }) }),
    );
  });

  it("falls back to the guest identity so the sale is not lost", async () => {
    vi.mocked(getVerifiedSessionUser).mockResolvedValueOnce(null);

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.isGuest).toBe(true);
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guestName: "Jane Doe", guestEmail: "jane@example.com" }),
      }),
    );
  });

  it("still links the order to the user when the row DOES exist", async () => {
    vi.mocked(getVerifiedSessionUser).mockResolvedValueOnce({
      id: "U1", name: "Real Customer", email: "real@example.com",
    } as never);

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });

    expect(result.success).toBe(true);
    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "U1" }) }),
    );
  });
});

describe("processOrder — error surface", () => {
  // The catch around the order transaction returned `error.message` verbatim to
  // the browser, so shoppers saw raw Prisma internals ("Invalid
  // prisma.order.create() invocation: Foreign key constraint violated on the
  // constraint: `Order_userId_fkey`"), and nothing was logged server-side.
  // Stock messages ARE meant for the shopper; internals are not.
  it("still shows the insufficient-stock message to the shopper", async () => {
    plainStockFindMany.mockResolvedValue([
      { id: "PS2", colorSlug: "white", size: "M", quantity: 0 },
    ]);

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/stock/i);
  });

  it("does not leak internal database errors to the shopper", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    txOrderCreate.mockRejectedValueOnce(
      new Error(
        "Invalid `prisma.order.create()` invocation: Foreign key constraint violated on the constraint: `Order_userId_fkey`",
      ),
    );

    const result = await processOrder({ ...baseInput, paymentMethod: "COD" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toMatch(/prisma|constraint|fkey/i);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("logs the real error server-side so it is diagnosable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    txOrderCreate.mockRejectedValueOnce(new Error("connection terminated unexpectedly"));

    await processOrder({ ...baseInput, paymentMethod: "COD" });

    expect(spy).toHaveBeenCalled();
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toMatch(/connection terminated/);
  });
});

describe("processOrder — free delivery excluded for Koko/Mintpay", () => {
  // The server action decides what the customer is actually charged, so the
  // exclusion has to hold here regardless of what any client preview showed.
  // baseInput is 2 x 1200 = 2400, below the 5000 threshold, so bump the price
  // to clear it.
  beforeEach(() => { productVariantFindMany.mockResolvedValue([{ id: "V1", productId: "P1", color: "White", colorSlug: "white", sku: "DB-TEE-WHT-M", price: null, archived: false, sizeStocks: [{ size: "M" }], product: { dtfDesignId: "D1", name: "T-Shirt", price: 4000, status: "PUBLISHED", archived: false } }]); });
  const qualifyingCart = {
    ...baseInput,
    items: [{ ...baseInput.items[0], price: 4000, quantity: 2 }], // 8000 subtotal
  };

  it.each(["KOKO", "MINTPAY"] as const)(
    "%s is charged delivery even on a cart that clears the free-delivery threshold",
    async (paymentMethod) => {
      await processOrder({ ...qualifyingCart, paymentMethod });

      expect(txOrderCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ subtotal: 8000, shippingCost: 350, total: 8350 }),
        }),
      );
    },
  );

  it.each(["COD", "PAYHERE"] as const)("%s still gets free delivery on the same cart", async (paymentMethod) => {
    await processOrder({ ...qualifyingCart, paymentMethod });

    expect(txOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotal: 8000, shippingCost: 0, total: 8000 }),
      }),
    );
  });
});


describe("size SKU snapshots", () => {
  it("records the selected size SKU rather than the legacy colour SKU", async () => {
    const [variant] = await productVariantFindMany();
    productVariantFindMany.mockResolvedValue([{ ...variant, sizeStocks: variant.sizeStocks.map(cell => ({ ...cell, sku: cell.size === "M" ? "DBV-000002" : "DBV-000001" })) }]);
    await processOrder({ ...baseInput, paymentMethod: "COD" });
    expect(txOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ items: { create: [expect.objectContaining({ size: "M", sku: "DBV-000002" })] } }) }));
    expect(productVariantFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ select: expect.objectContaining({ sizeStocks: expect.objectContaining({ where: { archived: false } }) }) }));
  });
});

const coupon: DiscountRule = { id: "coupon1", name: "Save ten", code: "SAVE10", type: "PERCENTAGE", scope: "STORE", value: 1000, active: true,
  startsAt: null, expiresAt: null, usageLimit: 5, usedCount: 0, minimumOrder: 0, maximumDiscount: null, version: 2, products: [], categories: [] };
describe("checkout promotions", () => {
  it("persists the authoritative saving, redemption and protected adjustment with the order", async () => {
    discountFindMany.mockResolvedValue([coupon]);
    const result = await processOrder({ ...baseInput, paymentMethod: "COD", couponCode: " save10 ", discountExpectation: { id: coupon.id, amount: 24000 } });
    expect(result.success).toBe(true);
    expect(discountClaim).toHaveBeenCalledOnce();
    expect(txOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      subtotal: 2400, shippingCost: 350, total: 2510,
      discountRedemption: { create: { discountId: "coupon1", name: "Save ten", code: "SAVE10", amount: 24000 } },
      adjustments: { create: expect.objectContaining({ amount: -240, promotion: true }) },
    }) }));
    expect(notifyOrderConfirmed).toHaveBeenCalledWith(expect.objectContaining({ total: 2510, adjustments: [expect.objectContaining({ amount: -240 })] }));
  });
  it("rejects invalid and expired codes before creating an order", async () => {
    expect(await processOrder({ ...baseInput, paymentMethod: "COD", couponCode: "BAD" })).toMatchObject({ success: false, error: expect.stringContaining("Invalid coupon") });
    discountFindMany.mockResolvedValue([{ ...coupon, expiresAt: new Date(0) }]);
    expect(await processOrder({ ...baseInput, paymentMethod: "COD", couponCode: "SAVE10" })).toMatchObject({ success: false, error: expect.stringContaining("expired") });
    expect(txOrderCreate).not.toHaveBeenCalled(); expect(discountClaim).not.toHaveBeenCalled();
  });
  it("rejects an edited quote rather than silently charging a different amount", async () => {
    discountFindMany.mockResolvedValue([coupon]);
    expect(await processOrder({ ...baseInput, paymentMethod: "COD", couponCode: "SAVE10", discountExpectation: { id: coupon.id, amount: 1 } })).toMatchObject({ success: false, error: expect.stringContaining("offer changed") });
    expect(txOrderCreate).not.toHaveBeenCalled(); expect(discountClaim).not.toHaveBeenCalled();
  });
  it("rejects a lost usage claim without creating an order", async () => {
    discountFindMany.mockResolvedValue([coupon]); discountClaim.mockResolvedValue({ count: 0 });
    expect(await processOrder({ ...baseInput, paymentMethod: "COD", couponCode: "SAVE10" })).toMatchObject({ success: false, error: expect.stringContaining("usage limit") });
    expect(txOrderCreate).not.toHaveBeenCalled();
  });
  it("applies an automatic offer once and caps it to merchandise", async () => {
    discountFindMany.mockResolvedValue([{ ...coupon, code: null, type: "FIXED", value: 999999 }]);
    expect((await processOrder({ ...baseInput, paymentMethod: "PAYHERE" })).success).toBe(true);
    expect(txOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ total: 350, subtotal: 2400, adjustments: { create: expect.objectContaining({ amount: -2400 }) } }) }));
  });
});


describe("zero-total promotions", () => {
  it("requires a zero-total order to bypass the online payment gateway", async () => {
    const [variant] = await productVariantFindMany();
    productVariantFindMany.mockResolvedValue([{ ...variant, product: { ...variant.product, price: 4000 } }]);
    discountFindMany.mockResolvedValue([{ ...coupon, code: null, value: 10000 }]);
    const result = await processOrder({ ...baseInput, items: [{ ...baseInput.items[0], price: 4000 }], paymentMethod: "PAYHERE" });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("total is zero") });
    expect(txOrderCreate).not.toHaveBeenCalled(); expect(discountClaim).not.toHaveBeenCalled();
  });
  it("allows a zero-total COD order with no negative balance", async () => {
    const [variant] = await productVariantFindMany();
    productVariantFindMany.mockResolvedValue([{ ...variant, product: { ...variant.product, price: 4000 } }]);
    discountFindMany.mockResolvedValue([{ ...coupon, code: null, value: 10000 }]);
    expect((await processOrder({ ...baseInput, items: [{ ...baseInput.items[0], price: 4000 }], paymentMethod: "COD" })).success).toBe(true);
    expect(txOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ subtotal: 8000, shippingCost: 0, total: 0 }) }));
  });
});


it("snapshots the server custom-design requirement and returns it for COD confirmation", async () => {
  const variants = await productVariantFindMany();
  Object.assign(variants[0].product, { isCustomizedDesign: true });
  productVariantFindMany.mockResolvedValueOnce(variants);
  const result = await processOrder({ ...baseInput, paymentMethod: "COD" });
  expect(result).toMatchObject({ success: true, customizedProducts: [{ productId: "P1", name: "T-Shirt" }] });
  expect(txOrderCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    items: { create: [expect.objectContaining({ isCustomizedDesign: true })] },
  }) }));
});
