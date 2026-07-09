# Order Color Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save the selected database variant color/SKU on new order items and show those saved item snapshots in customer confirmation messages plus admin emails and order views.

**Architecture:** Treat the `OrderItem` row as the historical source of truth after checkout. Checkout loads the selected `ProductVariant`, validates product ownership, and snapshots `color`/`sku`; all notification and admin mappers preserve those nullable fields. Formatting stays split by audience: customer copy omits SKU, while admin copy and admin screens show color, size, SKU, quantity, unit price, and line total.

**Tech Stack:** Next.js 16 App Router, Server Actions, Prisma/PostgreSQL, Vitest, Playwright, Nodemailer JSON transport test seam, Notify.lk SMS wrapper test seam.

## Global Constraints

- No Prisma schema or database migration is required because `OrderItem.color` and `OrderItem.sku` already exist.
- Checkout must use the selected database `ProductVariant.color` and `ProductVariant.sku` as the source for new `OrderItem` snapshots.
- A product/variant ownership mismatch must fail validation before any order write or stock decrement.
- Existing nullable legacy `color` and `sku` values must not break views or notifications.
- Customer messages omit missing optional attributes and never show SKU.
- Admin screens and admin emails render missing color/SKU as an em dash.
- Existing notification idempotency claim/release fields and retry behavior must remain unchanged.
- Dispatch and cancellation customer messages remain status-only and do not list item colors.
- Validate implementation with `npm.cmd run build`, `npm.cmd run test`, and `npm.cmd run test:e2e`; report environment-only build/e2e failures explicitly.

---

## File structure

- Modify `app/checkout/actions.ts`
  - Load `productId`, `color`, and `sku` for selected variants.
  - Reject cart lines whose `productId` does not own the selected `variantId`.
  - Use the database variant snapshot when creating `OrderItem` rows and `OrderDetails.items`.
- Modify `app/_lib/mailer.ts`
  - Extend the shared `OrderItem` type with nullable `color` and `sku`.
  - Render customer confirmation item color while omitting SKU.
  - Render full admin item snapshots in dispatch, pending-payment, and failure-alert emails.
- Modify `app/_lib/sms.ts`
  - Add confirmation SMS item-summary formatting with at most two `Product (Color)` pairs, `+N more`, and a 160-character body budget.
- Modify `app/_lib/order-notifications.ts`
  - Pass order items into `sendOrderConfirmationSms` without changing idempotency.
- Modify `app/_lib/payments/order-finalization.ts`
  - Preserve `color` and `sku` when prepaid payment finalization builds `OrderDetails`.
- Modify `app/admin/orders/actions.ts`
  - Select and preserve `color`/`sku` in admin order-detail mappers used by resend, dispatch, and cancellation paths.
- Create `app/_lib/order-item-display.ts`
  - Pure helpers for admin order-list item summaries and em-dash fallback formatting.
- Modify `app/_lib/admin-orders.ts`
  - Select first two item snapshots for compact admin list rows while retaining `_count.items` for `+N more`.
  - Keep full order-detail item data available.
- Modify `app/_components/admin/orders/orders-table.tsx`
  - Replace the count-only item cell with compact product-color lines.
- Modify `app/_components/admin/orders/order-items-editor.tsx`
  - Show color and SKU as read-only historical fields next to name/size/quantity/line total.
- Modify `app/admin/orders/[id]/page.tsx`
  - Pass `color` and `sku` into `OrderItemsEditor`.
- Modify tests:
  - `app/checkout/__tests__/actions.test.ts`
  - `app/_lib/__tests__/mailer-confirmation.test.ts` (new)
  - `app/_lib/__tests__/mailer-dispatch.test.ts`
  - `app/_lib/__tests__/order-sms.test.ts`
  - `app/_lib/__tests__/order-notifications.test.ts`
  - `app/_lib/payments/__tests__/order-finalization.test.ts`
  - `app/admin/orders/__tests__/actions.test.ts`
  - `app/_lib/__tests__/order-item-display.test.ts` (new)
  - `app/_lib/__tests__/admin-orders-queries.test.ts`

---

### Task 1: Checkout snapshots database variant color/SKU

**Files:**
- Modify: `app/checkout/actions.ts`
- Modify: `app/checkout/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `prisma.productVariant.findMany({ select: { id, productId, color, sku, sizeStocks } })`
- Produces: `OrderDetails.items[]` entries with `{ name, color, sku, size, price, quantity }`
- Produces: `OrderItem.create[]` rows with `color` and `sku` copied from the database variant, not the cart payload

- [ ] **Step 1: Expose the productVariant mock so tests can override variant snapshots**

In `app/checkout/__tests__/actions.test.ts`, replace the current hoisted mock block:

```ts
const { txOrderCreate } = vi.hoisted(() => ({
  txOrderCreate: vi.fn(async () => ({})),
}));
```

with:

```ts
const { txOrderCreate, productVariantFindMany } = vi.hoisted(() => ({
  txOrderCreate: vi.fn(async () => ({})),
  productVariantFindMany: vi.fn(async () => [
    {
      id: "V1",
      productId: "P1",
      color: "White",
      sku: "DB-TEE-WHT-M",
      sizeStocks: [
        { size: "S", stock: 5 },
        { size: "M", stock: 5 },
        { size: "L", stock: 5 },
      ],
    },
  ]),
}));
```

Then replace the inline `productVariant.findMany` mock with:

```ts
productVariant: {
  findMany: productVariantFindMany,
},
```

Add this reset inside the existing `beforeEach`:

```ts
productVariantFindMany.mockReset();
productVariantFindMany.mockResolvedValue([
  {
    id: "V1",
    productId: "P1",
    color: "White",
    sku: "DB-TEE-WHT-M",
    sizeStocks: [
      { size: "S", stock: 5 },
      { size: "M", stock: 5 },
      { size: "L", stock: 5 },
    ],
  },
]);
```

- [ ] **Step 2: Add failing checkout snapshot tests**

Append these tests to `app/checkout/__tests__/actions.test.ts`:

```ts
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

    const createArg = txOrderCreate.mock.calls[0][0] as {
      data: { items: { create: Array<Record<string, unknown>> } };
    };
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
        id: "V1",
        productId: "OTHER-PRODUCT",
        color: "White",
        sku: "DB-TEE-WHT-M",
        sizeStocks: [{ size: "M", stock: 5 }],
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
```

- [ ] **Step 3: Run the checkout tests and confirm they fail**

Run:

```powershell
npm.cmd run test -- app/checkout/__tests__/actions.test.ts
```

Expected: FAIL. The first two new tests fail because `color` still comes from the cart payload and `sku`/`color` are not passed to notification details. The mismatch test fails because checkout does not yet compare `ProductVariant.productId` with the cart line's `productId`.

- [ ] **Step 4: Implement authoritative variant snapshots**

In `app/checkout/actions.ts`, replace:

```ts
  const dbVariants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, sku: true, sizeStocks: { select: { size: true, stock: true } } },
  });
  const variantMap = new Map<string, VariantStock & { sku: string | null }>(
    dbVariants.map((v) => [v.id, v]),
  );
```

with:

```ts
  const dbVariants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      productId: true,
      color: true,
      sku: true,
      sizeStocks: { select: { size: true, stock: true } },
    },
  });
  const variantMap = new Map<
    string,
    VariantStock & { productId: string; color: string; sku: string | null }
  >(dbVariants.map((v) => [v.id, v]));
```

Immediately after `variantMap` is created, add:

```ts
  for (const item of items) {
    const variant = variantMap.get(item.variantId);
    if (variant && variant.productId !== item.productId) {
      return { success: false, error: `Selected variant does not belong to "${item.name}"` };
    }
  }
```

In the `items.create` mapper, replace:

```ts
              color: item.color ?? null,
              sku: variantMap.get(item.variantId)?.sku ?? null,
```

with:

```ts
              color: variantMap.get(item.variantId)?.color ?? null,
              sku: variantMap.get(item.variantId)?.sku ?? null,
```

In the `orderItems` mapper, replace:

```ts
  const orderItems: OrderItem[] = items.map((item) => ({
    name: item.name,
    size: item.size ?? null,
    price: item.price,
    quantity: item.quantity,
  }));
```

with:

```ts
  const orderItems: OrderItem[] = items.map((item) => {
    const variant = variantMap.get(item.variantId);
    return {
      name: item.name,
      color: variant?.color ?? null,
      sku: variant?.sku ?? null,
      size: item.size ?? null,
      price: item.price,
      quantity: item.quantity,
    };
  });
```

- [ ] **Step 5: Run the checkout tests and confirm they pass**

Run:

```powershell
npm.cmd run test -- app/checkout/__tests__/actions.test.ts
```

Expected: PASS for all tests in `actions.test.ts`.

- [ ] **Step 6: Commit checkout snapshot work**

Run:

```powershell
git add app/checkout/actions.ts app/checkout/__tests__/actions.test.ts
git commit -m "feat(orders): snapshot variant color at checkout"
```

---

### Task 2: Preserve color/SKU in all order-detail mappers

**Files:**
- Modify: `app/_lib/mailer.ts`
- Modify: `app/_lib/payments/order-finalization.ts`
- Modify: `app/admin/orders/actions.ts`
- Modify: `app/_lib/payments/__tests__/order-finalization.test.ts`
- Modify: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Produces: `OrderItem` type with `color?: string | null` and `sku?: string | null`
- Produces: `paidDetails(order, items)` where each item preserves `color` and `sku`
- Produces: `toOrderDetails(order)` where admin resend/dispatch/cancellation details preserve `color` and `sku`

- [ ] **Step 1: Add failing mapper tests**

In `app/_lib/payments/__tests__/order-finalization.test.ts`, replace:

```ts
const ITEMS = [{ variantId: "V1", name: "Tee", size: "M", price: 1000, quantity: 2 }];
```

with:

```ts
const ITEMS = [
  {
    variantId: "V1",
    color: "White",
    sku: "DB-TEE-WHT-M",
    name: "Tee",
    size: "M",
    price: 1000,
    quantity: 2,
  },
];
```

Add this assertion to the `"marks paid and sends confirmation email"` test after `expect(notifyOrderConfirmed).toHaveBeenCalledOnce();`:

```ts
    expect(notifyOrderConfirmed.mock.calls[0][0].items[0]).toMatchObject({
      color: "White",
      sku: "DB-TEE-WHT-M",
    });
```

In `app/admin/orders/__tests__/actions.test.ts`, change `FULL_ORDER.items` from:

```ts
  items: [{ name: "Dress", size: "M", price: 6500, quantity: 1 }],
```

to:

```ts
  items: [{ name: "Dress", color: "Black", sku: "DB-DRESS-BLK-M", size: "M", price: 6500, quantity: 1 }],
```

Add these assertions inside the `"re-sends with the tracking code when dispatched"` test after `expect(arg.customerEmail).toBe("n@x.test");`:

```ts
    expect(arg.items[0]).toMatchObject({
      color: "Black",
      sku: "DB-DRESS-BLK-M",
    });
```

- [ ] **Step 2: Run mapper tests and confirm they fail**

Run:

```powershell
npm.cmd run test -- app/_lib/payments/__tests__/order-finalization.test.ts app/admin/orders/__tests__/actions.test.ts
```

Expected: FAIL. The new assertions fail because the mapper output drops `color` and `sku`.

- [ ] **Step 3: Extend the shared mailer item type**

In `app/_lib/mailer.ts`, replace:

```ts
export type OrderItem = {
  name: string;
  size?: string | null;
  price: number;
  quantity: number;
};
```

with:

```ts
export type OrderItem = {
  name: string;
  color?: string | null;
  sku?: string | null;
  size?: string | null;
  price: number;
  quantity: number;
};
```

- [ ] **Step 4: Preserve snapshots in prepaid payment finalization**

In `app/_lib/payments/order-finalization.ts`, replace the item mapper inside `paidDetails`:

```ts
    items: items.map((it) => ({
      name: it.name,
      size: it.size,
      price: it.price,
      quantity: it.quantity,
    })),
```

with:

```ts
    items: items.map((it) => ({
      name: it.name,
      color: it.color,
      sku: it.sku,
      size: it.size,
      price: it.price,
      quantity: it.quantity,
    })),
```

- [ ] **Step 5: Preserve snapshots in admin order mappers**

In `app/admin/orders/actions.ts`, replace `ORDER_INCLUDE` with:

```ts
const ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: { select: { name: true, color: true, sku: true, size: true, price: true, quantity: true } },
} satisfies Prisma.OrderInclude;
```

Replace the item mapper inside `toOrderDetails`:

```ts
    items: order.items.map((i) => ({ name: i.name, size: i.size, price: i.price, quantity: i.quantity })),
```

with:

```ts
    items: order.items.map((i) => ({
      name: i.name,
      color: i.color,
      sku: i.sku,
      size: i.size,
      price: i.price,
      quantity: i.quantity,
    })),
```

Replace `CANCEL_INCLUDE` with:

```ts
const CANCEL_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: { select: { variantId: true, name: true, color: true, sku: true, size: true, price: true, quantity: true } },
} satisfies Prisma.OrderInclude;
```

- [ ] **Step 6: Run mapper tests and confirm they pass**

Run:

```powershell
npm.cmd run test -- app/_lib/payments/__tests__/order-finalization.test.ts app/admin/orders/__tests__/actions.test.ts
```

Expected: PASS for both test files.

- [ ] **Step 7: Commit mapper propagation work**

Run:

```powershell
git add app/_lib/mailer.ts app/_lib/payments/order-finalization.ts app/admin/orders/actions.ts app/_lib/payments/__tests__/order-finalization.test.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(orders): preserve item color snapshots in mappers"
```

---

### Task 3: Show item color in customer confirmation email and SMS

**Files:**
- Modify: `app/_lib/mailer.ts`
- Modify: `app/_lib/sms.ts`
- Modify: `app/_lib/order-notifications.ts`
- Create: `app/_lib/__tests__/mailer-confirmation.test.ts`
- Modify: `app/_lib/__tests__/order-sms.test.ts`
- Modify: `app/_lib/__tests__/order-notifications.test.ts`

**Interfaces:**
- Consumes: `OrderDetails.items[]` with nullable `color`
- Produces: customer confirmation email item lines containing color and size, while omitting SKU
- Produces: `sendOrderConfirmationSms({ phone, ref, total, items })`
- Produces: confirmation SMS body length `<= 160` characters for formatter output

- [ ] **Step 1: Add failing confirmation email tests**

Create `app/_lib/__tests__/mailer-confirmation.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import {
  __setTestTransport,
  sendOrderConfirmationEmail,
  type OrderDetails,
} from "../mailer";

const originalEnv = { ...process.env };

const ORDER: OrderDetails = {
  orderId: "ORD-EMAIL-1",
  webNumber: "WEB1001",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+94770000000",
  items: [
    { name: "Cat Tee", color: "White", sku: "DB-CAT-WHT-M", size: "M", price: 2000, quantity: 2 },
    { name: "Bear Cap", color: null, sku: null, size: null, price: 1500, quantity: 1 },
  ],
  subtotal: 5500,
  shipping: 0,
  total: 5500,
  shippingAddress: { line1: "1 Walls Lane", city: "Colombo", country: "Sri Lanka" },
  paymentMethod: "COD",
  paymentMethodDisplay: "Cash on Delivery",
  paymentStatus: "COD_PENDING",
};

let transport: nodemailer.Transporter;
let sendMailSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  transport = nodemailer.createTransport({ jsonTransport: true });
  sendMailSpy = vi.fn(transport.sendMail.bind(transport)) as unknown as ReturnType<typeof vi.fn>;
  // @ts-expect-error patching for spy
  transport.sendMail = sendMailSpy;
  __setTestTransport(transport);

  process.env.SMTP_HOST = "smtp.test";
  process.env.SMTP_USER = "u";
  process.env.SMTP_PASS = "p";
  process.env.SMTP_FROM = "Dressing Bear <a9e490001@smtp-brevo.com>";
  process.env.BRAND_EMAIL = "dressingbear@gmail.com";
  process.env.BRAND_NAME = "Dressing Bear";
});

afterEach(() => {
  __setTestTransport(null);
  process.env = { ...originalEnv };
});

describe("sendOrderConfirmationEmail item snapshots", () => {
  it("renders color in text and HTML item lines and omits customer-facing SKU", async () => {
    await sendOrderConfirmationEmail(ORDER);

    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).toContain("Cat Tee (Color White, Size M) x2");
    expect(opts.html).toContain("Color White");
    expect(opts.html).toContain("Size M");
    expect(opts.text).not.toContain("DB-CAT-WHT-M");
    expect(opts.html).not.toContain("DB-CAT-WHT-M");
  });

  it("omits missing color and size attributes for legacy items", async () => {
    await sendOrderConfirmationEmail(ORDER);

    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).toContain("Bear Cap x1");
    expect(opts.text).not.toContain("Bear Cap ()");
  });
});
```

- [ ] **Step 2: Add failing SMS and notification tests**

In `app/_lib/__tests__/order-sms.test.ts`, update the confirmation test call to include items:

```ts
    await sendOrderConfirmationSms({
      phone: "+94771234567",
      ref: "WEB1001",
      total: 2440,
      items: [{ name: "Cat Tee", color: "White" }],
    });
```

Add these tests to the `"order SMS templates"` block:

```ts
  it("confirmation: includes up to two product-color pairs and counts omitted lines", async () => {
    await sendOrderConfirmationSms({
      phone: "+94771234567",
      ref: "WEB1001",
      total: 6240,
      items: [
        { name: "Cat Tee", color: "White" },
        { name: "Dino Tee", color: "Pink" },
        { name: "Bear Cap", color: "Blue" },
      ],
    });

    expect(captured[0].message).toContain("Cat Tee (White)");
    expect(captured[0].message).toContain("Dino Tee (Pink)");
    expect(captured[0].message).toContain("+1 more");
    expect(captured[0].message).not.toContain("Bear Cap");
  });

  it("confirmation: keeps the message within 160 characters while preserving included colors", async () => {
    await sendOrderConfirmationSms({
      phone: "+94771234567",
      ref: "WEB1001",
      total: 987654,
      items: [
        { name: "Very Long Premium Cotton Graphic Oversized Cat T-Shirt", color: "White" },
        { name: "Another Very Long Premium Cotton Graphic Oversized Dino T-Shirt", color: "Pink" },
        { name: "Bear Cap", color: "Blue" },
      ],
    });

    expect(captured[0].message.length).toBeLessThanOrEqual(160);
    expect(captured[0].message).toContain("(White)");
    expect(captured[0].message).toContain("(Pink)");
    expect(captured[0].message).toContain("+1 more");
  });
```

In `app/_lib/__tests__/order-notifications.test.ts`, change the `withEmail.items` row to:

```ts
  items: [{ name: "Tee", color: "White", sku: "DB-TEE-WHT-M", size: "M", price: 1000, quantity: 1 }],
```

Add this assertion inside the `"with email → sends both the confirmation email and SMS"` test:

```ts
      items: [{ name: "Tee", color: "White" }],
```

The full SMS expectation becomes:

```ts
    expect(sendOrderConfirmationSms.mock.calls[0][0]).toMatchObject({
      phone: "+94771234567",
      ref: "WEB1001",
      total: 1000,
      items: [{ name: "Tee", color: "White" }],
    });
```

- [ ] **Step 3: Run customer notification tests and confirm they fail**

Run:

```powershell
npm.cmd run test -- app/_lib/__tests__/mailer-confirmation.test.ts app/_lib/__tests__/order-sms.test.ts app/_lib/__tests__/order-notifications.test.ts
```

Expected: FAIL. Email tests fail because color is not rendered. SMS tests fail because `sendOrderConfirmationSms` does not accept or render items. Notification tests fail because items are not passed to the SMS function.

- [ ] **Step 4: Implement customer confirmation email formatting**

In `app/_lib/mailer.ts`, add these helpers above `sendOrderConfirmationEmail`:

```ts
function customerItemAttributes(item: OrderItem): string[] {
  return [
    item.color ? `Color ${item.color}` : null,
    item.size ? `Size ${item.size}` : null,
  ].filter((value): value is string => Boolean(value));
}

function formatCustomerItemText(item: OrderItem): string {
  const attrs = customerItemAttributes(item);
  const attrText = attrs.length > 0 ? ` (${attrs.join(", ")})` : "";
  return `${item.name}${attrText} x${item.quantity} - ${formatPrice(item.price * item.quantity)}`;
}

function formatCustomerItemHtml(item: OrderItem): string {
  const attrs = customerItemAttributes(item);
  const attrHtml =
    attrs.length > 0
      ? ` <span style="color:#666;font-size:0.9em;">(${attrs.map(escapeHtml).join(", ")})</span>`
      : "";
  return `
        <div class="item">
          <span>${escapeHtml(item.name)}${attrHtml} &times; ${item.quantity}</span>
          <span>${formatPrice(item.price * item.quantity)}</span>
        </div>`;
}
```

Inside `sendOrderConfirmationEmail`, replace `itemsListText` with:

```ts
  const itemsListText = order.items.map(formatCustomerItemText).join("\n");
```

Replace `itemsListHtml` with:

```ts
  const itemsListHtml = order.items.map(formatCustomerItemHtml).join("");
```

- [ ] **Step 5: Implement SMS item-summary formatting**

In `app/_lib/sms.ts`, add these types and helpers above `sendOrderConfirmationSms`:

```ts
export type SmsOrderItem = {
  name: string;
  color?: string | null;
};

const CONFIRMATION_SMS_LIMIT = 160;

function cleanPart(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return value.slice(0, Math.max(0, maxLength));
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatSmsItem(item: SmsOrderItem, maxLength: number): string {
  const name = cleanPart(item.name);
  const color = cleanPart(item.color);
  if (!color) return shorten(name, maxLength);

  const colorSuffix = ` (${color})`;
  if (colorSuffix.length >= maxLength) return shorten(`${name}${colorSuffix}`, maxLength);

  return `${shorten(name, maxLength - colorSuffix.length)}${colorSuffix}`;
}

export function buildConfirmationItemSummary(items: SmsOrderItem[] | undefined, maxLength: number): string {
  const visible = (items ?? []).slice(0, 2);
  if (visible.length === 0 || maxLength <= 0) return "";

  const omitted = Math.max(0, (items?.length ?? 0) - visible.length);
  const moreText = omitted > 0 ? ` +${omitted} more` : "";
  const separatorLength = visible.length > 1 ? 2 : 0;
  const availableForItems = Math.max(0, maxLength - moreText.length - separatorLength);
  const perItemBudget = Math.max(1, Math.floor(availableForItems / visible.length));
  const rendered = visible.map((item) => formatSmsItem(item, perItemBudget));
  const summary = `${rendered.join(", ")}${moreText}`;

  return shorten(summary, maxLength);
}
```

Replace `sendOrderConfirmationSms` with:

```ts
export function sendOrderConfirmationSms(p: {
  phone: string;
  ref: string;
  total: number;
  items?: SmsOrderItem[];
}): Promise<void> {
  const prefix = `Dressing Bear: order ${p.ref} confirmed.`;
  const suffix = `Total Rs ${Math.round(p.total)}. We'll text you when it ships.`;
  const fixed = `${prefix} ${suffix}`;
  const summaryBudget = Math.max(0, CONFIRMATION_SMS_LIMIT - fixed.length - 2);
  const summary = buildConfirmationItemSummary(p.items, summaryBudget);
  const message = summary ? `${prefix} ${summary}. ${suffix}` : fixed;

  return sendSms(p.phone, shorten(message, CONFIRMATION_SMS_LIMIT));
}
```

- [ ] **Step 6: Pass items into confirmation SMS notifications**

In `app/_lib/order-notifications.ts`, replace:

```ts
      await sendOrderConfirmationSms({
        phone: details.customerPhone,
        ref: orderReference(details),
        total: details.total,
      });
```

with:

```ts
      await sendOrderConfirmationSms({
        phone: details.customerPhone,
        ref: orderReference(details),
        total: details.total,
        items: details.items.map((item) => ({ name: item.name, color: item.color ?? null })),
      });
```

- [ ] **Step 7: Run customer notification tests and confirm they pass**

Run:

```powershell
npm.cmd run test -- app/_lib/__tests__/mailer-confirmation.test.ts app/_lib/__tests__/order-sms.test.ts app/_lib/__tests__/order-notifications.test.ts
```

Expected: PASS for all three test files.

- [ ] **Step 8: Commit customer notification formatting**

Run:

```powershell
git add app/_lib/mailer.ts app/_lib/sms.ts app/_lib/order-notifications.ts app/_lib/__tests__/mailer-confirmation.test.ts app/_lib/__tests__/order-sms.test.ts app/_lib/__tests__/order-notifications.test.ts
git commit -m "feat(notifications): include order item colors"
```

---

### Task 4: Show full item snapshots in admin emails

**Files:**
- Modify: `app/_lib/mailer.ts`
- Modify: `app/_lib/__tests__/mailer-dispatch.test.ts`

**Interfaces:**
- Consumes: `OrderDetails.items[]` with nullable `color`, `sku`, and `size`
- Produces: admin plain-text item lines with product, color, size, SKU, quantity, unit price, and line total
- Produces: admin HTML item rows with the same fields escaped

- [ ] **Step 1: Add failing admin email item snapshot tests**

In `app/_lib/__tests__/mailer-dispatch.test.ts`, replace `SAMPLE_ORDER.items` with:

```ts
  items: [{ name: "Cotton T-Shirt", color: "White", sku: "DB-TEE-WHT-M", size: "M", price: 1200, quantity: 2 }],
```

Add these assertions to the dispatch test after `expect(opts.text).toContain("Cotton T-Shirt");`:

```ts
    expect(opts.text).toContain("Color: White");
    expect(opts.text).toContain("Size: M");
    expect(opts.text).toContain("SKU: DB-TEE-WHT-M");
    expect(opts.text).toMatch(/Unit:.*1.?200/);
    expect(opts.text).toMatch(/Line:.*2.?400/);
    expect(opts.html).toContain("DB-TEE-WHT-M");
```

Add this test inside `describe("sendPendingPrepaidNotificationEmail", ...)`:

```ts
  it("includes full item color, size, SKU, quantity, unit price, and line total", async () => {
    await sendPendingPrepaidNotificationEmail({
      order: { ...SAMPLE_ORDER, paymentMethod: "PAYHERE", paymentMethodDisplay: "PayHere" },
    });

    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).toContain("Color: White");
    expect(opts.text).toContain("Size: M");
    expect(opts.text).toContain("SKU: DB-TEE-WHT-M");
    expect(opts.text).toMatch(/Qty: 2/);
    expect(opts.text).toMatch(/Unit:.*1.?200/);
    expect(opts.text).toMatch(/Line:.*2.?400/);
    expect(opts.html).toContain("DB-TEE-WHT-M");
  });
```

Add this test inside `describe("sendAdminFailureAlertEmail", ...)`:

```ts
  it("includes full item snapshots and em dashes for missing legacy color/SKU", async () => {
    await sendAdminFailureAlertEmail({
      orderId: "ORD-TEST-1",
      step: "curfox-create",
      reason: "HTTP 422",
      order: {
        ...SAMPLE_ORDER,
        items: [{ name: "Legacy Tee", color: null, sku: null, size: null, price: 1000, quantity: 1 }],
      },
    });

    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).toContain("Legacy Tee");
    expect(opts.text).toContain("Color: —");
    expect(opts.text).toContain("Size: —");
    expect(opts.text).toContain("SKU: —");
    expect(opts.html).toContain("Legacy Tee");
    expect(opts.html).toContain("—");
  });
```

- [ ] **Step 2: Run admin email tests and confirm they fail**

Run:

```powershell
npm.cmd run test -- app/_lib/__tests__/mailer-dispatch.test.ts
```

Expected: FAIL because admin item formatting still shows only product, size, and quantity.

- [ ] **Step 3: Implement shared admin email item formatting**

In `app/_lib/mailer.ts`, replace `formatItemsList` with:

```ts
function adminValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatItemsList(items: OrderItem[]): string {
  return items
    .map((it) => {
      const lineTotal = it.price * it.quantity;
      return [
        `  - ${it.name}`,
        `Color: ${adminValue(it.color)}`,
        `Size: ${adminValue(it.size)}`,
        `SKU: ${adminValue(it.sku)}`,
        `Qty: ${it.quantity}`,
        `Unit: ${formatPrice(it.price)}`,
        `Line: ${formatPrice(lineTotal)}`,
      ].join(" | ");
    })
    .join("\n");
}

function formatItemsListHtml(items: OrderItem[]): string {
  return items
    .map((it) => {
      const lineTotal = it.price * it.quantity;
      return `<tr>
        <td>${escapeHtml(it.name)}</td>
        <td>${escapeHtml(adminValue(it.color))}</td>
        <td>${escapeHtml(adminValue(it.size))}</td>
        <td>${escapeHtml(adminValue(it.sku))}</td>
        <td>${it.quantity}</td>
        <td>${formatPrice(it.price)}</td>
        <td>${formatPrice(lineTotal)}</td>
      </tr>`;
    })
    .join("");
}
```

In `sendDispatchNotificationEmail`, replace the current `itemsHtml` definition with:

```ts
  const itemsHtml = formatItemsListHtml(order.items);
```

Replace:

```html
      <ul>${itemsHtml}</ul>
```

with:

```html
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr><th align="left">Product</th><th align="left">Color</th><th align="left">Size</th><th align="left">SKU</th><th align="right">Qty</th><th align="right">Unit</th><th align="right">Line</th></tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
```

Apply the same `const itemsHtml = formatItemsListHtml(order.items);` and table markup replacement in `sendPendingPrepaidNotificationEmail` and `sendAdminFailureAlertEmail`.

- [ ] **Step 4: Run admin email tests and confirm they pass**

Run:

```powershell
npm.cmd run test -- app/_lib/__tests__/mailer-dispatch.test.ts
```

Expected: PASS for all tests in `mailer-dispatch.test.ts`.

- [ ] **Step 5: Commit admin email formatting**

Run:

```powershell
git add app/_lib/mailer.ts app/_lib/__tests__/mailer-dispatch.test.ts
git commit -m "feat(admin): show item snapshots in admin emails"
```

---

### Task 5: Show colors in admin order list and full item details

**Files:**
- Create: `app/_lib/order-item-display.ts`
- Create: `app/_lib/__tests__/order-item-display.test.ts`
- Modify: `app/_lib/admin-orders.ts`
- Modify: `app/_lib/__tests__/admin-orders-queries.test.ts`
- Modify: `app/_components/admin/orders/orders-table.tsx`
- Modify: `app/_components/admin/orders/order-items-editor.tsx`
- Modify: `app/admin/orders/[id]/page.tsx`

**Interfaces:**
- Produces: `formatAdminOrderItemSummary(items, totalCount)` returning up to two `Product - Color xquantity` lines plus `+N more`
- Produces: `listOrders()` rows with `items: { id, name, color, quantity }[]` and `_count.items`
- Produces: `OrderItemsEditor` item props with nullable `color` and `sku`

- [ ] **Step 1: Add failing admin display helper tests**

Create `app/_lib/__tests__/order-item-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { adminDisplayValue, formatAdminOrderItemSummary } from "../order-item-display";

describe("order item admin display helpers", () => {
  it("formats up to two compact product-color lines and appends omitted line count", () => {
    expect(
      formatAdminOrderItemSummary(
        [
          { name: "Dress", color: "Black", quantity: 1 },
          { name: "Scarf", color: null, quantity: 2 },
        ],
        3,
      ),
    ).toEqual(["Dress - Black x1", "Scarf - — x2", "+1 more"]);
  });

  it("renders an em dash for blank legacy values", () => {
    expect(adminDisplayValue(null)).toBe("—");
    expect(adminDisplayValue("")).toBe("—");
    expect(adminDisplayValue("  ")).toBe("—");
    expect(adminDisplayValue("White")).toBe("White");
  });
});
```

- [ ] **Step 2: Add failing admin query tests**

In `app/_lib/__tests__/admin-orders-queries.test.ts`, add these assertions inside the `"paginates with take/skip and returns rows + total"` test after `expect(arg.orderBy).toEqual({ createdAt: "desc" });`:

```ts
    expect(arg.include.items).toEqual({
      select: { id: true, name: true, color: true, quantity: true },
      take: 2,
      orderBy: { id: "asc" },
    });
    expect(arg.include._count).toEqual({ select: { items: true } });
```

In the `"includes items, variant size-stocks, user and notesLog"` detail test, add:

```ts
    expect(arg.include.items.include.variant.select.sizeStocks.select.size).toBe(true);
```

This assertion already exists; keep it. No extra detail-query assertion is needed because `include.items` returns scalar `color` and `sku` by default.

- [ ] **Step 3: Run admin display/query tests and confirm they fail**

Run:

```powershell
npm.cmd run test -- app/_lib/__tests__/order-item-display.test.ts app/_lib/__tests__/admin-orders-queries.test.ts
```

Expected: FAIL. The helper file does not exist, and `listOrders` does not select compact item snapshots.

- [ ] **Step 4: Create the admin item display helper**

Create `app/_lib/order-item-display.ts`:

```ts
export type CompactAdminOrderItem = {
  name: string;
  color?: string | null;
  quantity: number;
};

export function adminDisplayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

export function formatAdminOrderItemSummary(
  items: CompactAdminOrderItem[],
  totalCount: number,
): string[] {
  const lines = items
    .slice(0, 2)
    .map((item) => `${item.name} - ${adminDisplayValue(item.color)} x${item.quantity}`);

  const omitted = Math.max(0, totalCount - lines.length);
  if (omitted > 0) lines.push(`+${omitted} more`);

  return lines;
}
```

- [ ] **Step 5: Select compact item snapshots for the admin list**

In `app/_lib/admin-orders.ts`, replace the `include` block inside `listOrders` with:

```ts
      include: {
        user: { select: { name: true, email: true } },
        items: {
          select: { id: true, name: true, color: true, quantity: true },
          take: 2,
          orderBy: { id: "asc" },
        },
        _count: { select: { items: true } },
      },
```

- [ ] **Step 6: Render compact item summaries in the admin orders table**

In `app/_components/admin/orders/orders-table.tsx`, add this import:

```ts
import { formatAdminOrderItemSummary } from "@/app/_lib/order-item-display";
```

Update the `Row` type by replacing:

```ts
  _count: { items: number };
```

with:

```ts
  items: { id: string; name: string; color: string | null; quantity: number }[];
  _count: { items: number };
```

Replace the item-count cell:

```tsx
              <td className="p-2">{o._count.items}</td>
```

with:

```tsx
              <td className="p-2">
                <div className="space-y-0.5">
                  {formatAdminOrderItemSummary(o.items, o._count.items).map((line) => (
                    <div key={line} className="text-xs leading-snug">
                      {line}
                    </div>
                  ))}
                </div>
              </td>
```

- [ ] **Step 7: Render full item details in the admin order detail editor**

In `app/_components/admin/orders/order-items-editor.tsx`, add this import:

```ts
import { adminDisplayValue } from "@/app/_lib/order-item-display";
```

Replace the `Item` type with:

```ts
type Item = {
  id: string;
  name: string;
  color: string | null;
  sku: string | null;
  size: string | null;
  price: number;
  quantity: number;
  sizes: string;
};
```

Replace this display fragment:

```tsx
            <span>{it.name}{it.size ? ` · ${it.size}` : ""}</span>
```

with:

```tsx
            <span>
              <span className="font-medium">{it.name}</span>
              <span className="block text-xs text-muted-foreground">
                Color: {adminDisplayValue(it.color)} · Size: {adminDisplayValue(it.size)} · SKU: {adminDisplayValue(it.sku)}
              </span>
            </span>
```

In `app/admin/orders/[id]/page.tsx`, replace the `items={order.items.map(...)}` object with:

```tsx
              items={order.items.map((i) => ({
                id: i.id,
                name: i.name,
                color: i.color,
                sku: i.sku,
                size: i.size,
                price: i.price,
                quantity: i.quantity,
                sizes: i.variant ? i.variant.sizeStocks.map((s) => s.size).join(",") : (i.size ?? ""),
              }))}
```

- [ ] **Step 8: Run admin display/query tests and confirm they pass**

Run:

```powershell
npm.cmd run test -- app/_lib/__tests__/order-item-display.test.ts app/_lib/__tests__/admin-orders-queries.test.ts
```

Expected: PASS for both test files.

- [ ] **Step 9: Commit admin UI display work**

Run:

```powershell
git add app/_lib/order-item-display.ts app/_lib/__tests__/order-item-display.test.ts app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders-queries.test.ts app/_components/admin/orders/orders-table.tsx app/_components/admin/orders/order-items-editor.tsx 'app/admin/orders/[id]/page.tsx'
git commit -m "feat(admin): show order item colors in order views"
```

---

### Task 6: Full regression verification

**Files:**
- No source edits unless a verification failure identifies a concrete defect in the previous tasks.

**Interfaces:**
- Produces: a verified feature branch ready for OPSX apply/archive/sync steps
- Produces: clear notes for any environment-only failures

- [ ] **Step 1: Run the focused Vitest suite**

Run:

```powershell
npm.cmd run test -- app/checkout/__tests__/actions.test.ts app/_lib/__tests__/mailer-confirmation.test.ts app/_lib/__tests__/mailer-dispatch.test.ts app/_lib/__tests__/order-sms.test.ts app/_lib/__tests__/order-notifications.test.ts app/_lib/payments/__tests__/order-finalization.test.ts app/admin/orders/__tests__/actions.test.ts app/_lib/__tests__/order-item-display.test.ts app/_lib/__tests__/admin-orders-queries.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full unit test suite**

Run:

```powershell
npm.cmd run test
```

Expected: PASS.

- [ ] **Step 3: Run the production build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS. If the build fails because Next.js cannot reach `fonts.googleapis.com` in the restricted environment, rerun with network approval. If it compiles but hangs during final production checks, capture that exact behavior and report it instead of marking build as passed.

- [ ] **Step 4: Run relevant Playwright flows**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/order-confirmation.spec.ts tests/e2e/admin-orders.spec.ts
```

Expected: PASS. If local PostgreSQL, seeded admin credentials, or browser dependencies are unavailable, report the exact missing environment condition.

- [ ] **Step 5: Run repository hygiene checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` prints no whitespace errors. `git status --short` contains only intentional files for this feature branch and any pre-existing unrelated user files.

- [ ] **Step 6: Commit verification-only fixes if needed**

If Task 6 identifies a concrete defect, fix it in the smallest relevant file set and commit with one of:

```powershell
git commit -m "fix(orders): preserve item colors in notifications"
git commit -m "fix(admin): render legacy item snapshots safely"
git commit -m "test(orders): cover color snapshot notifications"
```

If no source changes are needed, do not create an empty commit.

---

## Plan self-review notes

- Spec coverage: Task 1 covers authoritative checkout snapshots and product/variant mismatch rejection. Task 2 covers COD, prepaid, admin resend, dispatch, cancellation, and payment-finalization mapper propagation. Task 3 covers customer confirmation email/SMS and keeps dispatch/cancellation status-only. Task 4 covers itemized admin emails. Task 5 covers compact admin list and full order detail display with legacy em-dash fallbacks. Task 6 covers build, unit, and e2e validation.
- Vague-work scan: this plan contains no banned filler tokens, deferred testing language, or undefined function names in implementation steps.
- Type consistency: item snapshot fields are consistently named `color` and `sku`; SMS receives `{ name, color }`; admin compact summaries receive `{ name, color, quantity }`.
