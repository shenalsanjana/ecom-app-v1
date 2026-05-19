# WEB#### Order Number & Curfox Payload Mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long internal order ID at Curfox and in the customer-facing email subject with a short, sequential `WEB####` reference, and fix the Curfox payload so every field (name, phone, address, notes, order_no) reflects exactly what the customer entered at checkout. Lock the mapping with regression tests.

**Architecture:** A new Postgres sequence `web_number_seq` and `Order.webNumber` column back a `nextWebNumber()` helper that mirrors the existing `nextRbNumber()` pattern. Display sites use a single `orderReference()` helper to render `webNumber ?? rbNumber ?? orderId`, so old orders keep their `RB####` display and new orders get `WEB0001`, `WEB0002`, … Curfox payload fixes are local edits in `app/checkout/book-courier.ts` with one extracted phone helper. Regression tests in `app/checkout/__tests__/curfox-mapping.test.ts` assert the payload field-by-field.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 + PostgreSQL, Vitest, Zod, nodemailer.

**Spec:** [`docs/spec/web-order-number-and-curfox-mapping.md`](../../spec/web-order-number-and-curfox-mapping.md)

---

## File Structure

**Create:**
- `prisma/migrations/20260519000000_add_web_number_column/migration.sql` — DB migration
- `app/_lib/web-number.ts` — `nextWebNumber()` helper
- `app/_lib/__tests__/web-number.test.ts` — generator tests
- `app/_lib/order-reference.ts` — `orderReference()` precedence helper
- `app/_lib/__tests__/order-reference.test.ts` — helper tests
- `app/checkout/__tests__/curfox-mapping.test.ts` — Curfox payload regression suite

**Modify:**
- `prisma/schema.prisma` — add `webNumber` column to `Order`
- `app/_lib/mailer.ts` — `OrderDetails` type + every order-reference render site + `logMailerError` signature
- `app/_lib/rb-number.ts` — add legacy comment
- `app/checkout/actions.ts` — generate `webNumber`, drop `"Customer"` fallback, thread `webNumber` through
- `app/checkout/book-courier.ts` — phone helper, address-with-city, `remark`, `order_no` via `orderReference`, `logMailerError` calls
- `app/account/orders/page.tsx` — display `webNumber`
- `app/checkout/__tests__/actions.test.ts` — RB → WEB regex, empty-name test, `$queryRaw` return tweak
- `app/_lib/__tests__/mailer-dispatch.test.ts` — WEB subject precedence + fixture updates
- `app/checkout/__tests__/book-courier.test.ts` — update fixture/assertions for new `order_no` source

---

## Task 1: Database migration — add `Order.webNumber` + `web_number_seq`

**Files:**
- Create: `prisma/migrations/20260519000000_add_web_number_column/migration.sql`
- Modify: `prisma/schema.prisma:106-130` (Order model — add field next to existing `rbNumber`)

- [ ] **Step 1: Write the migration SQL**

Create `prisma/migrations/20260519000000_add_web_number_column/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "webNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_webNumber_key" ON "Order"("webNumber");

-- CreateSequence
CREATE SEQUENCE "web_number_seq" START WITH 1 INCREMENT BY 1 MINVALUE 1 NO CYCLE;
```

- [ ] **Step 2: Update the Prisma schema**

In `prisma/schema.prisma`, find the `rbNumber` line in the `Order` model (line ~122) and add a sibling `webNumber` field directly above it:

```prisma
  webNumber             String?   @unique
  rbNumber              String?   @unique
```

- [ ] **Step 3: Apply the migration**

Run: `npm run db:migrate -- --name add_web_number_column`

Expected: Prisma confirms the migration applied and regenerates the client. If it offers to create a different migration name, accept the existing folder by hitting Enter (Prisma will skip rather than overwrite).

If `db:migrate` complains the migration directory already exists, run `npx prisma generate` instead to regenerate just the client.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors; the Prisma client now exposes `Order.webNumber`.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/20260519000000_add_web_number_column/migration.sql prisma/schema.prisma
git commit -m "feat(db): add Order.webNumber column and web_number_seq sequence"
```

---

## Task 2: `nextWebNumber` helper (TDD)

**Files:**
- Create: `app/_lib/web-number.ts`
- Create: `app/_lib/__tests__/web-number.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/web-number.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { nextWebNumber } from "../web-number";

function mkTx(nextValue: bigint): Prisma.TransactionClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ next: nextValue }]),
  } as unknown as Prisma.TransactionClient;
}

describe("nextWebNumber", () => {
  it("returns WEB0001 for the first sequence value", async () => {
    expect(await nextWebNumber(mkTx(1n))).toBe("WEB0001");
  });

  it("zero-pads to 4 digits", async () => {
    expect(await nextWebNumber(mkTx(42n))).toBe("WEB0042");
    expect(await nextWebNumber(mkTx(99n))).toBe("WEB0099");
    expect(await nextWebNumber(mkTx(9999n))).toBe("WEB9999");
  });

  it("grows naturally past 9999 (5-digit overflow)", async () => {
    expect(await nextWebNumber(mkTx(10000n))).toBe("WEB10000");
    expect(await nextWebNumber(mkTx(123456n))).toBe("WEB123456");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/_lib/__tests__/web-number.test.ts`
Expected: FAIL with `Cannot find module '../web-number'`.

- [ ] **Step 3: Implement the helper**

Create `app/_lib/web-number.ts`:

```ts
// app/_lib/web-number.ts
// Sequence-backed generator for the customer-facing order reference `WEB####`.
// Atomic, race-free, never resets.

import type { Prisma } from "@prisma/client";

/**
 * Returns the next WEB-prefixed order number, e.g. "WEB0042".
 *
 * Backed by the Postgres sequence `web_number_seq`. nextval() is atomic, so
 * concurrent inserts cannot collide. 4-digit zero-padded for values 1..9999;
 * naturally grows to 5+ digits past that (WEB10000, WEB10001, …).
 *
 * If the surrounding transaction rolls back, the consumed number is burned
 * (gap in sequence) — that's acceptable.
 *
 * Pass the transaction client (`tx`) when called inside `prisma.$transaction`
 * so the read participates in the same statement timeout / isolation.
 */
export async function nextWebNumber(
  client: Prisma.TransactionClient,
): Promise<string> {
  const rows = await client.$queryRaw<Array<{ next: bigint }>>`
    SELECT nextval('web_number_seq') AS next
  `;
  return `WEB${String(rows[0].next).padStart(4, "0")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/_lib/__tests__/web-number.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/web-number.ts app/_lib/__tests__/web-number.test.ts
git commit -m "feat(order): add nextWebNumber sequence-backed generator"
```

---

## Task 3: `orderReference` precedence helper (TDD)

**Files:**
- Create: `app/_lib/order-reference.ts`
- Create: `app/_lib/__tests__/order-reference.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/order-reference.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderReference } from "../order-reference";

describe("orderReference", () => {
  it("prefers webNumber when set", () => {
    expect(
      orderReference({ webNumber: "WEB0042", rbNumber: "RB1001", orderId: "ORD-X" }),
    ).toBe("WEB0042");
  });

  it("falls back to rbNumber when webNumber is null/undefined", () => {
    expect(orderReference({ webNumber: null, rbNumber: "RB1001", orderId: "ORD-X" })).toBe("RB1001");
    expect(orderReference({ rbNumber: "RB1001", orderId: "ORD-X" })).toBe("RB1001");
  });

  it("falls back to orderId when both web and rb are missing", () => {
    expect(orderReference({ orderId: "ORD-X" })).toBe("ORD-X");
    expect(orderReference({ webNumber: null, rbNumber: null, orderId: "ORD-X" })).toBe("ORD-X");
  });

  it("falls back to id when orderId is missing (e.g., raw Prisma row)", () => {
    expect(orderReference({ id: "ORD-X" })).toBe("ORD-X");
  });

  it("returns empty string when nothing is set", () => {
    expect(orderReference({})).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/_lib/__tests__/order-reference.test.ts`
Expected: FAIL with `Cannot find module '../order-reference'`.

- [ ] **Step 3: Implement the helper**

Create `app/_lib/order-reference.ts`:

```ts
// app/_lib/order-reference.ts
// Single source of truth for the customer-facing order reference.
// New orders carry `webNumber`. Pre-WEB-rollout orders carry `rbNumber`.
// Both fields may be absent on internal-only Prisma row shapes; fall back
// through `orderId` and `id` so this helper is safe to call anywhere.

export function orderReference(o: {
  webNumber?: string | null;
  rbNumber?: string | null;
  orderId?: string;
  id?: string;
}): string {
  return o.webNumber ?? o.rbNumber ?? o.orderId ?? o.id ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/_lib/__tests__/order-reference.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-reference.ts app/_lib/__tests__/order-reference.test.ts
git commit -m "feat(order): add orderReference precedence helper"
```

---

## Task 4: Add `webNumber` to `OrderDetails` type

**Files:**
- Modify: `app/_lib/mailer.ts:92-113` (OrderDetails type definition)

- [ ] **Step 1: Add the field**

In `app/_lib/mailer.ts`, find the `OrderDetails` type (around line 92). Add `webNumber` directly above `rbNumber`:

```ts
export type OrderDetails = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    country: string;
  };
  paymentMethod: "COD" | "PAYHERE" | "KOKO" | "MINITPAY";
  paymentMethodDisplay?: string;
  trackingCode?: string;
  notes?: string;
  webNumber?: string | null;      // Customer-facing order code (new); preferred when set
  rbNumber?: string | null;       // Legacy receipt book / invoice reference
  paymentStatus?: string | null;
};
```

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: build succeeds. No call sites read `webNumber` yet, so nothing else changes.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/mailer.ts
git commit -m "refactor(mailer): add webNumber to OrderDetails type"
```

---

## Task 5: Generate `webNumber` in `processOrder` (replace `rbNumber`)

**Files:**
- Modify: `app/checkout/actions.ts:19, 202-280` (replace rbNumber generation + thread webNumber)
- Modify: `app/checkout/__tests__/actions.test.ts:29, 88, 115` (update mock + assertions)

- [ ] **Step 1: Update the import and transaction in `actions.ts`**

In `app/checkout/actions.ts`:

Replace the existing import on line 19:
```ts
import { nextRbNumber } from "@/app/_lib/rb-number";
```
with:
```ts
import { nextWebNumber } from "@/app/_lib/web-number";
```

In the `prisma.$transaction(async (tx) => { ... })` block (around lines 202-250), change the type, the generator call, and the `create` data:

```ts
let created: { webNumber: string | null; paymentStatus: string | null };
try {
  created = await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const result = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (result.count === 0) {
        throw new Error(`Insufficient stock for "${item.name}"`);
      }
    }

    const webNumber = await nextWebNumber(tx);
    const paymentStatus = initialPaymentStatus(paymentMethod);

    return tx.order.create({
      data: {
        id: orderId,
        userId,
        guestName,
        guestEmail,
        customerPhone: contactPhone,
        shippingLine1: shippingAddress.line1,
        shippingLine2: shippingAddress.line2 ?? null,
        shippingCity: shippingAddress.city,
        shippingCountry: shippingAddress.country,
        subtotal,
        shippingCost,
        total,
        paymentMethod,
        paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
        status: "PENDING",
        paymentStatus,
        webNumber,
        idempotencyKey: idempotencyKey ?? null,
        notes: notes && notes.length > 0 ? notes : null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            name: item.name,
            size: item.size ?? null,
            price: item.price,
            quantity: item.quantity,
          })),
        },
      },
    });
  });
} catch (error) {
  const message = error instanceof Error ? error.message : "Failed to create order";
  return { success: false, error: message };
}
```

Then update the `OrderDetails` constructed below to use `webNumber` (around line 277):

```ts
const orderDetailsForEmail: OrderDetails = {
  orderId,
  customerName,
  customerEmail,
  customerPhone: contactPhone,
  items: orderItems,
  subtotal,
  shipping: shippingCost,
  total,
  shippingAddress,
  paymentMethod,
  paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
  notes: notes && notes.length > 0 ? notes : undefined,
  webNumber: created.webNumber,
  paymentStatus: created.paymentStatus,
};
```

Simplify both `logMailerError` calls in this file to use only `{ orderId }` for now — the function's current signature has `rbNumber` typed and TypeScript would reject `webNumber` as an excess property. Task 11 enriches these calls once the signature accepts `webNumber`.

Line ~96:
```ts
logMailerError("pending-prepaid", { orderId }, err);
```
Line ~297:
```ts
logMailerError("order-confirmation", { orderId }, error);
```

- [ ] **Step 2: Update the existing actions test**

In `app/checkout/__tests__/actions.test.ts`:

Line 29 — the mocked `$queryRaw` returns `1001n` (a value chosen for `nextRbNumber`'s "RB1001+" range). Replace the mock value to match `nextWebNumber`:
```ts
$queryRaw: vi.fn().mockResolvedValue([{ next: 42n }]),
```

Line 82-92 — update the RB regex and field name:
```ts
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
```

Line 107-120 — same update for the prepaid path:
```ts
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
```

Add a new test directly after the prepaid `it.each` block, asserting that `rbNumber` is no longer written:

```ts
it("does not write rbNumber for new orders", async () => {
  await processOrder({ ...baseInput, paymentMethod: "COD" });
  const call = vi.mocked(txOrderCreate).mock.calls[0]?.[0] as { data: Record<string, unknown> };
  expect(call.data).not.toHaveProperty("rbNumber");
});
```

- [ ] **Step 3: Run the actions tests**

Run: `npm test -- app/checkout/__tests__/actions.test.ts`
Expected: PASS — all existing tests still green, new "does not write rbNumber" assertion green.

- [ ] **Step 4: Run the full test suite to catch ripple effects**

Run: `npm test`
Expected: Some failures in `book-courier.test.ts` and `mailer-dispatch.test.ts` are acceptable here — they'll be fixed in later tasks. Make a note of which tests fail; they should all relate to `rbNumber`/`orderId` rendering. If anything unrelated breaks, stop and investigate.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/actions.ts app/checkout/__tests__/actions.test.ts
git commit -m "feat(order): generate webNumber instead of rbNumber for new orders"
```

---

## Task 6: Drop the `"Customer"` name fallback (TDD)

**Files:**
- Modify: `app/checkout/actions.ts:134-148` (auth branch)
- Modify: `app/checkout/__tests__/actions.test.ts` (add empty-name test)

- [ ] **Step 1: Write the failing test**

In `app/checkout/__tests__/actions.test.ts`, find the `vi.mock("@/app/_lib/auth", ...)` block at the top. We need this mock to be overridable per-test. Replace it:

```ts
vi.mock("@/app/_lib/auth", () => ({
  auth: vi.fn(async () => null),
}));
```

Then import `auth` and add a new `describe` block at the bottom of the file:

```ts
import { auth } from "@/app/_lib/auth";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/checkout/__tests__/actions.test.ts -t "customer name requirement"`
Expected: FAIL — the current code returns `success: true` and uses `"Customer"` as the name.

- [ ] **Step 3: Implement the fix**

In `app/checkout/actions.ts`, replace the logged-in branch (around lines 134-148):

```ts
if (session?.user?.id) {
  userId = session.user.id;
  const sessionName = session.user.name?.trim();
  if (!sessionName) {
    return {
      success: false,
      error: "Please add your name to your profile before checking out",
    };
  }
  customerName = sessionName;
  customerEmail = session.user.email ?? "";
} else if (guestInfo) {
  customerName = guestInfo.name;
  customerEmail = guestInfo.email;
  guestName = guestInfo.name;
  guestEmail = guestInfo.email;
} else {
  return {
    success: false,
    error: "Please sign in or provide your name and email to continue",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/checkout/__tests__/actions.test.ts`
Expected: PASS — the two new tests green, and all prior tests still pass (they use guest flow).

- [ ] **Step 5: Commit**

```bash
git add app/checkout/actions.ts app/checkout/__tests__/actions.test.ts
git commit -m "fix(checkout): require non-empty name for logged-in checkout"
```

---

## Task 7: Curfox phone normalization (TDD via new mapping test)

**Files:**
- Create: `app/checkout/__tests__/curfox-mapping.test.ts`
- Modify: `app/checkout/book-courier.ts` (add helper, use in payload)

- [ ] **Step 1: Create the new regression test file with the phone assertion**

Create `app/checkout/__tests__/curfox-mapping.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- app/checkout/__tests__/curfox-mapping.test.ts`
Expected: FAIL — the current code only strips `+`, leaving `94770000000` rather than `0770000000`.

- [ ] **Step 3: Add the phone helper in `book-courier.ts`**

In `app/checkout/book-courier.ts`, add a new helper function near the existing `buildAddressLine` / `buildDescription` helpers (around line 27-37):

```ts
/**
 * Normalises a phone number for the Curfox/Sri Lanka local format.
 * Couriers expect the leading `0` form (e.g., 0770000000), not the
 * international `+94` form. Inputs may include spaces, dashes, or a
 * leading `+`; output is digits-only with a leading `0`.
 */
function toLocalSriLankaPhone(phone: string | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return "0" + digits.slice(2);
  if (digits.startsWith("0")) return digits;
  return digits;
}
```

Then in the `orderItem` construction (around line 115), replace:

```ts
customer_phone: order.customerPhone?.replace(/\+/g, "") ?? "", // Remove + if present
```

with:

```ts
customer_phone: toLocalSriLankaPhone(order.customerPhone),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/checkout/__tests__/curfox-mapping.test.ts`
Expected: PASS — all four phone tests green.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/book-courier.ts app/checkout/__tests__/curfox-mapping.test.ts
git commit -m "fix(curfox): normalise customer phone to Sri Lankan local format"
```

---

## Task 8: Curfox address-line includes city (TDD)

**Files:**
- Modify: `app/checkout/__tests__/curfox-mapping.test.ts` (add address assertions)
- Modify: `app/checkout/book-courier.ts:27-31` (`buildAddressLine`)

- [ ] **Step 1: Add the failing assertions**

In `app/checkout/__tests__/curfox-mapping.test.ts`, add a new `describe("customer_address")` block under the top-level describe, after the `customer_phone` block:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/checkout/__tests__/curfox-mapping.test.ts -t "customer_address"`
Expected: FAIL — current `buildAddressLine` returns `"1 Walls Lane, Apt 4B"` (no city).

- [ ] **Step 3: Update `buildAddressLine`**

In `app/checkout/book-courier.ts`, replace the existing `buildAddressLine` (lines 27-31):

```ts
function buildAddressLine(addr: OrderDetails["shippingAddress"]): string {
  return [addr.line1, addr.line2, addr.city].filter(Boolean).join(", ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/checkout/__tests__/curfox-mapping.test.ts`
Expected: PASS — `customer_phone` and `customer_address` blocks all green.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/book-courier.ts app/checkout/__tests__/curfox-mapping.test.ts
git commit -m "fix(curfox): include city in customer_address line"
```

---

## Task 9: Forward delivery notes to Curfox `remark` (TDD)

**Files:**
- Modify: `app/checkout/__tests__/curfox-mapping.test.ts` (add remark assertions)
- Modify: `app/checkout/book-courier.ts:111-127` (orderItem construction)

- [ ] **Step 1: Add the failing assertions**

In `app/checkout/__tests__/curfox-mapping.test.ts`, add a new describe block after the `customer_address` block:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/checkout/__tests__/curfox-mapping.test.ts -t "remark"`
Expected: FAIL — current code does not set `remark` at all (so the trimmed-notes test fails; the undefined tests already pass).

- [ ] **Step 3: Add `remark` to the orderItem**

In `app/checkout/book-courier.ts`, find the `orderItem` construction (around lines 111-120). Update it:

```ts
const orderItem: any = {
  order_no: order.orderId,
  customer_name: order.customerName,
  customer_address: buildAddressLine(order.shippingAddress),
  customer_phone: toLocalSriLankaPhone(order.customerPhone),
  customer_email: order.customerEmail ?? null,
  weight: DEFAULT_WEIGHT(),
  cod: order.paymentMethod === "COD" ? order.total : 0,
  description: buildDescription(order.items),
  remark: order.notes?.trim() || undefined,
};
```

Note: the existing `any` cast is preserved for now — Curfox's optional fields (`destination_city_id` vs `destination_city_name`/`state_name`) require a discriminated union to type cleanly, which is out of scope for this change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/checkout/__tests__/curfox-mapping.test.ts`
Expected: PASS — phone, address, and remark blocks all green.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/book-courier.ts app/checkout/__tests__/curfox-mapping.test.ts
git commit -m "feat(curfox): forward delivery notes to remark field"
```

---

## Task 10: `order_no` uses `orderReference`; existing test fixture updated

**Files:**
- Modify: `app/checkout/__tests__/curfox-mapping.test.ts` (add order_no assertions)
- Modify: `app/checkout/book-courier.ts:111-112` (use orderReference for order_no)
- Modify: `app/checkout/__tests__/book-courier.test.ts:47-63` (update fixture)

- [ ] **Step 1: Add order_no assertions to the new mapping test**

In `app/checkout/__tests__/curfox-mapping.test.ts`, add a final describe block:

```ts
describe("order_no", () => {
  it("uses webNumber when set", async () => {
    const item = await callAndGetItem({ ...ORDER, webNumber: "WEB0042", rbNumber: null });
    expect(item.order_no).toBe("WEB0042");
  });

  it("falls back to rbNumber when webNumber is absent", async () => {
    const item = await callAndGetItem({
      ...ORDER,
      webNumber: null,
      rbNumber: "RB1001",
    });
    expect(item.order_no).toBe("RB1001");
  });

  it("falls back to orderId when both web and rb are absent", async () => {
    const item = await callAndGetItem({
      ...ORDER,
      webNumber: null,
      rbNumber: null,
    });
    expect(item.order_no).toBe("ORD-1734567890-AB12CD");
  });
});

describe("customer_name (no fallbacks at the Curfox boundary)", () => {
  it("passes the customer-entered name through unchanged", async () => {
    const item = await callAndGetItem({ ...ORDER, customerName: "Jane Doe" });
    expect(item.customer_name).toBe("Jane Doe");
  });
});

describe("customer_email", () => {
  it("forwards the customer-entered email", async () => {
    const item = await callAndGetItem();
    expect(item.customer_email).toBe("jane@example.com");
  });
});

describe("cod amount", () => {
  it("equals total for COD orders", async () => {
    const item = await callAndGetItem({ ...ORDER, paymentMethod: "COD", total: 2440 });
    expect(item.cod).toBe(2440);
  });

  it("equals 0 for prepaid orders", async () => {
    const item = await callAndGetItem({ ...ORDER, paymentMethod: "PAYHERE", total: 2440 });
    expect(item.cod).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify the new order_no tests fail**

Run: `npm test -- app/checkout/__tests__/curfox-mapping.test.ts -t "order_no"`
Expected: FAIL — current code uses `order.orderId` regardless of webNumber/rbNumber.

- [ ] **Step 3: Use `orderReference` in `book-courier.ts`**

In `app/checkout/book-courier.ts`, add an import at the top with the other lib imports:

```ts
import { orderReference } from "@/app/_lib/order-reference";
```

Then in the `orderItem` construction, replace `order_no: order.orderId,` with:

```ts
order_no: orderReference(order),
```

- [ ] **Step 4: Update the existing `book-courier.test.ts` fixture**

In `app/checkout/__tests__/book-courier.test.ts:47-63`, the fixture has `orderId: "ORD-TEST-1"` and no webNumber. The "happy path" test on line 87 currently doesn't assert on `order_no`, but later assertions implicitly expect it to be `"ORD-TEST-1"`. To keep the existing test stable, give the fixture an explicit webNumber:

```ts
const ORDER: OrderDetails = {
  orderId: "ORD-TEST-1",
  webNumber: "WEB0001",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+94770000000",
  // ... rest unchanged
};
```

- [ ] **Step 5: Run all book-courier and curfox-mapping tests**

Run: `npm test -- app/checkout/__tests__/book-courier.test.ts app/checkout/__tests__/curfox-mapping.test.ts`
Expected: PASS — all tests in both files green.

- [ ] **Step 6: Commit**

```bash
git add app/checkout/book-courier.ts app/checkout/__tests__/curfox-mapping.test.ts app/checkout/__tests__/book-courier.test.ts
git commit -m "fix(curfox): use orderReference for order_no (WEB then RB then orderId)"
```

---

## Task 11: Mailer surfaces use `orderReference`; `logMailerError` gains `webNumber`

**Files:**
- Modify: `app/_lib/mailer.ts` (every order-reference render site + logMailerError signature)
- Modify: `app/checkout/book-courier.ts:39-49, 60-72` (logMailerError calls)
- Modify: `app/checkout/actions.ts:96, 297` (logMailerError calls — enrich after Task 5 reduced them)

- [ ] **Step 1: Add the `orderReference` import to mailer.ts**

In `app/_lib/mailer.ts`, add to the existing imports at the top:

```ts
import { orderReference } from "@/app/_lib/order-reference";
```

- [ ] **Step 2: Update every `order.rbNumber ?? order.orderId` site to use `orderReference(order)`**

Replace each of these (line numbers approximate — search for the literal expression):

Line 146 — confirmation email text body:
```ts
Order: ${orderReference(order)}
```

Line 194 — confirmation email html body:
```ts
<p><strong>Order:</strong> ${escapeHtml(orderReference(order))}</p>
```

Line 233 — confirmation email subject (was `order.orderId`):
```ts
subject: `Order ${orderReference(order)} - ${BRAND_NAME}`,
```

Line 401 — dispatch email text body:
```ts
ORDER:        ${orderReference(order)}
```

Line 449 — dispatch email html body:
```ts
<p><span class="label">Order:</span> ${escapeHtml(orderReference(order))}</p>
```

Line 492 — dispatch email subject:
```ts
subject: `[Dispatch] ${orderReference(order)} — Waybill ${waybillNumber}`,
```

Line 510 — pending-prepaid text body:
```ts
const orderRef = orderReference(order);
```

Line 601 — pending-prepaid subject:
```ts
subject: `[Awaiting Payment] ${orderReference(order)} — ${gateway}`,
```

Line 640 — admin failure alert (`order.orderId` is the same value as the top-level `orderId` parameter, so the helper alone suffices):
```ts
const orderRef = orderReference(order);
```

Line 753 — admin failure alert subject:
```ts
subject: `${urgentPrefix}[Failure] ${orderReference(order)} — Curfox ${step} failed`,
```

- [ ] **Step 3: Update `logMailerError` to accept `webNumber`**

In `app/_lib/mailer.ts:351-378`, replace the function signature and body:

```ts
export function logMailerError(
  template:
    | "order-confirmation"
    | "dispatch"
    | "pending-prepaid"
    | "admin-failure-alert"
    | "contact"
    | "password-reset",
  orderRef: { orderId?: string; webNumber?: string | null; rbNumber?: string | null },
  err: unknown,
): void {
  const e = err as Partial<{
    code: string;
    command: string;
    response: string;
    responseCode: number;
    message: string;
  }>;
  // eslint-disable-next-line no-console
  console.error(`[mailer] ${template} FAILED`, {
    order: orderReference(orderRef) || "(none)",
    code: e.code,
    responseCode: e.responseCode,
    response: e.response,
    command: e.command,
    message: e.message,
  });
}
```

- [ ] **Step 4: Update `book-courier.ts` `logMailerError` calls**

In `app/checkout/book-courier.ts`, update both call sites:

Line ~45 (`tryAlert` helper):
```ts
logMailerError(
  "admin-failure-alert",
  { orderId: params.orderId, webNumber: params.order.webNumber, rbNumber: params.order.rbNumber },
  err,
);
```

Line ~69 (`tryDispatchEmail` helper):
```ts
logMailerError(
  "dispatch",
  { orderId: order.orderId, webNumber: order.webNumber, rbNumber: order.rbNumber },
  err,
);
```

- [ ] **Step 5: Enrich the `actions.ts` `logMailerError` calls now that the signature accepts `webNumber`**

In `app/checkout/actions.ts`, update both call sites (which Task 5 reduced to `{ orderId }`):

Line ~96 (pending-prepaid catch in `orchestrateCourierBooking`):
```ts
logMailerError(
  "pending-prepaid",
  { orderId, webNumber: details.webNumber, rbNumber: details.rbNumber },
  err,
);
```

Line ~297 (order-confirmation catch in `processOrder`):
```ts
logMailerError(
  "order-confirmation",
  { orderId, webNumber: created.webNumber },
  error,
);
```

- [ ] **Step 6: Build to catch any signature mismatches**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: All tests pass EXCEPT `mailer-dispatch.test.ts` may still fail on subject assertions that expect `RB1001` in the subject. That's fixed in Task 12.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/mailer.ts app/checkout/book-courier.ts app/checkout/actions.ts
git commit -m "refactor(mailer): use orderReference helper everywhere; pass webNumber to logMailerError"
```

---

## Task 12: Mailer dispatch tests — WEB subject precedence + fixture updates

**Files:**
- Modify: `app/_lib/__tests__/mailer-dispatch.test.ts:13-32, 57-149`

- [ ] **Step 1: Update the fixture to include `webNumber`**

In `app/_lib/__tests__/mailer-dispatch.test.ts:13-32`, update `SAMPLE_ORDER`:

```ts
const SAMPLE_ORDER: OrderDetails = {
  orderId: "ORD-TEST-1",
  webNumber: "WEB0042",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+94770000000",
  items: [{ name: "Cotton T-Shirt", size: "M", price: 1200, quantity: 2 }],
  subtotal: 2400,
  shipping: 40,
  total: 2440,
  shippingAddress: {
    line1: "1 Walls Lane",
    city: "Colombo",
    country: "Sri Lanka",
  },
  paymentMethod: "COD",
  paymentMethodDisplay: "Cash on Delivery",
  rbNumber: "RB1001",
  paymentStatus: "COD_PENDING",
  notes: "Please leave at the gate.",
};
```

- [ ] **Step 2: Update assertions that currently expect `"RB1001"` to expect `"WEB0042"`**

Search for `RB1001` in `app/_lib/__tests__/mailer-dispatch.test.ts` and change each occurrence to `WEB0042`. Specific sites:

- Line ~70: `expect(opts.subject).toContain("RB1001");` → `expect(opts.subject).toContain("WEB0042");`
- Line ~77: `expect(opts.text).toContain("RB1001");` → `expect(opts.text).toContain("WEB0042");`
- Line ~116: `expect(opts.subject).toContain("RB1001");` → `expect(opts.subject).toContain("WEB0042");`
- Line ~132: `expect(opts.subject).toContain("RB1001");` → `expect(opts.subject).toContain("WEB0042");`

- [ ] **Step 3: Add a precedence test — falls back to rbNumber when webNumber is null**

At the end of the `describe("sendDispatchNotificationEmail", ...)` block, add:

```ts
it("falls back to rbNumber in the subject when webNumber is null", async () => {
  await sendDispatchNotificationEmail({
    order: { ...SAMPLE_ORDER, webNumber: null },
    waybillNumber: "RA03870247",
  });
  const opts = sendMailSpy.mock.calls[0][0];
  expect(opts.subject).toContain("RB1001");
  expect(opts.subject).not.toContain("WEB0042");
});

it("falls back to orderId in the subject when both webNumber and rbNumber are null", async () => {
  await sendDispatchNotificationEmail({
    order: { ...SAMPLE_ORDER, webNumber: null, rbNumber: null },
    waybillNumber: "RA03870247",
  });
  const opts = sendMailSpy.mock.calls[0][0];
  expect(opts.subject).toContain("ORD-TEST-1");
});
```

- [ ] **Step 4: Add content assertions to the existing happy-path dispatch test**

In the first `it("sends to dressingbear@gmail.com ...")` test (around line 58), add additional assertions before the final `});`:

```ts
// Customer-entered details flow through unchanged in the email body
expect(opts.text).toContain("Jane Doe");
expect(opts.text).toContain("+94770000000");   // email shows the as-entered format
expect(opts.text).toContain("Colombo");        // city present in body
expect(opts.text).toContain("Cotton T-Shirt"); // itemized list
```

- [ ] **Step 5: Run the dispatch tests**

Run: `npm test -- app/_lib/__tests__/mailer-dispatch.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/__tests__/mailer-dispatch.test.ts
git commit -m "test(mailer): assert WEB subject precedence + customer-entered detail content"
```

---

## Task 13: Account orders page display + `rb-number.ts` legacy note

**Files:**
- Modify: `app/account/orders/page.tsx:64`
- Modify: `app/_lib/rb-number.ts:1-5`

- [ ] **Step 1: Update the account orders page to prefer `webNumber`**

In `app/account/orders/page.tsx:64`, replace:

```tsx
{o.rbNumber ?? `Order #${o.id.slice(-8)}`}
```

with:

```tsx
{o.webNumber ?? o.rbNumber ?? `Order #${o.id.slice(-8)}`}
```

(Inline rather than importing `orderReference` because the JSX context already has the `o` row; importing the helper for a single ternary is more noise than it saves. If the file gets a second order-reference site later, switch to the helper.)

- [ ] **Step 2: Add a legacy note to `rb-number.ts`**

In `app/_lib/rb-number.ts`, replace the file's top comment (lines 1-3) with:

```ts
// app/_lib/rb-number.ts
//
// Legacy sequence-backed generator. Superseded by `app/_lib/web-number.ts`
// for new orders (which produce `WEB####` references). This file is retained
// because old `Order` rows still carry `rbNumber` values; the helper itself
// is no longer called from `processOrder`.
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual verify (account orders page)**

Start the dev server (`npm run dev`), sign in as a user with at least one historical RB#### order, and visit `/account/orders`. Verify the old order still shows its `RB####` code (the `webNumber` is null, so the fallback fires).

If a new WEB#### order has been placed in this dev session, verify it shows as `WEB0001` (or whatever the sequence is at).

- [ ] **Step 5: Commit**

```bash
git add app/account/orders/page.tsx app/_lib/rb-number.ts
git commit -m "feat(account): display webNumber on orders page; mark rb-number as legacy"
```

---

## Task 14: Final verification (build + full test run)

No code changes. This task is the gate before declaring the work done.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL tests pass. Pay attention to the new files:
- `app/_lib/__tests__/web-number.test.ts` — 3 tests
- `app/_lib/__tests__/order-reference.test.ts` — 5 tests
- `app/checkout/__tests__/curfox-mapping.test.ts` — phone (4), address (2), remark (3), order_no (3), customer_name (1), customer_email (1), cod (2) = ~16 tests

If any test fails, stop and investigate before continuing.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors or warnings about unused exports.

- [ ] **Step 3: Manual smoke test — place an order**

Start `npm run dev`. Place a test COD order through the checkout (the Curfox env can be disabled by setting `ROYAL_EXPRESS_ENABLED=false` if you don't want a live booking; the WEB#### generation still happens).

Verify:
- The order in `prisma studio` (or via `npm run db:push -- --inspect`, or a direct DB query) has `webNumber` set (e.g., `WEB0001`) and `rbNumber` null.
- The customer confirmation email (or the SMTP log if testing with a fake transport) has `Order WEB0001 - Dressing Bear` as the subject.
- The dispatch email (if Curfox is enabled) has `[Dispatch] WEB0001 — Waybill RA…` as the subject.
- The account orders page shows `WEB0001`.

- [ ] **Step 4: Verify Curfox payload shape (only if `ROYAL_EXPRESS_ENABLED=true`)**

In the dev server logs, look for the Curfox request payload (the existing `curfox-client` should log it). Verify:
- `order_no` is `"WEB0001"` (or whatever the sequence value is)
- `customer_name` is exactly what was entered at checkout (no `"Customer"` literal)
- `customer_phone` starts with `"0"` (e.g., `"0770000000"`)
- `customer_address` ends with the city (e.g., `"1 Walls Lane, Kotte"`)
- `remark` reflects the checkout notes if any were entered

- [ ] **Step 5: No commit needed**

This task is verification-only. If everything green, the implementation is complete and ready for review/merge.

---

## Risk & rollback

- **Migration is purely additive.** `webNumber` is a nullable new column; no existing data is touched. Rollback is `ALTER TABLE "Order" DROP COLUMN "webNumber"; DROP SEQUENCE "web_number_seq";`.
- **No behavior change for historical orders.** They have `webNumber = NULL`, so `orderReference` falls back to their existing `rbNumber`.
- **Customer-name fix can reject orders.** If a logged-in user without a profile name attempts checkout, they now get an actionable error instead of a Curfox label saying "Customer". This is the desired behavior, but worth noting in case a customer reports being unable to check out.
- **Phone normalization is one-directional.** We send `0770000000` to Curfox but still display `+94770000000` in emails (the customer-entered value). If a customer's stored phone is already in `0…` format, it round-trips unchanged.
