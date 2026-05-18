# Payment Status and RB Number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two columns to `Order` — `paymentStatus` (nullable enum-style String, values `PENDING | PAID | COD_PENDING | COD_COLLECTED`) and `rbNumber` (nullable unique String, format `RB####` from a PostgreSQL sequence) — populate both on every new order, and surface them on the customer order list.

**Architecture:** Two new helper modules in `app/_lib/` (one for the payment-status enum and labels, one for the RB-number generator). A schema migration adds the two columns plus the `rb_number_seq` PostgreSQL sequence (start 1001, no cycle). `processOrder` inside a transaction calls both helpers and writes both fields. `app/account/orders/page.tsx` reads the new fields, falls back gracefully when null (legacy rows), and renders a payment-status Badge alongside the existing order-status Badge.

**Tech Stack:** Next.js 16 App Router (React 19), Prisma 6 + PostgreSQL, Zod 4, Vitest 4, Playwright 1.60, TypeScript 5.

---

## File Structure

### Create
- `app/_lib/order-status.ts` — payment-status type, label resolver, `initialPaymentStatus(method)` helper.
- `app/_lib/rb-number.ts` — `nextRbNumber(tx)` helper using the PostgreSQL sequence.
- `app/_lib/__tests__/order-status.test.ts` — Vitest unit tests.
- `app/_lib/__tests__/rb-number.test.ts` — Vitest unit tests with a mocked transaction client.
- `prisma/migrations/<timestamp>_add_payment_status_and_rb_number/migration.sql` — auto-generated, then hand-edited to add the `CREATE SEQUENCE` statement.

### Modify
- `prisma/schema.prisma` — add `paymentStatus String?` and `rbNumber String? @unique` to `Order`.
- `app/checkout/actions.ts` — call both helpers inside the existing `prisma.$transaction`, add both fields to the `tx.order.create` `data` block.
- `app/checkout/__tests__/actions.test.ts` — assert the new fields are populated on the create call.
- `app/account/orders/page.tsx` — render RB-number headline + payment-status badge; fall back to existing layout when fields are NULL.
- `tests/e2e/delivery-zone-pricing.spec.ts` (extend) OR `tests/e2e/order-confirmation.spec.ts` (new) — assert RB number and badge appear after a COD order.

---

## Task 1: New `order-status.ts` module + tests

**Files:**
- Create: `app/_lib/order-status.ts`
- Create: `app/_lib/__tests__/order-status.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/order-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PAYMENT_STATUSES,
  initialPaymentStatus,
  paymentStatusLabel,
  type PaymentStatus,
} from "@/app/_lib/order-status";

describe("PAYMENT_STATUSES", () => {
  it("lists the four canonical values", () => {
    expect([...PAYMENT_STATUSES]).toEqual([
      "PENDING",
      "PAID",
      "COD_PENDING",
      "COD_COLLECTED",
    ]);
  });
});

describe("initialPaymentStatus", () => {
  it("returns COD_PENDING for COD", () => {
    expect(initialPaymentStatus("COD")).toBe<PaymentStatus>("COD_PENDING");
  });

  it("returns PENDING for each online provider", () => {
    expect(initialPaymentStatus("PAYHERE")).toBe<PaymentStatus>("PENDING");
    expect(initialPaymentStatus("KOKO")).toBe<PaymentStatus>("PENDING");
    expect(initialPaymentStatus("MINITPAY")).toBe<PaymentStatus>("PENDING");
  });

  it("defaults to PENDING for an unknown method", () => {
    expect(initialPaymentStatus("UNKNOWN_PROVIDER")).toBe<PaymentStatus>("PENDING");
  });
});

describe("paymentStatusLabel", () => {
  it("returns the customer-facing label for each status", () => {
    expect(paymentStatusLabel("PENDING")).toBe("Awaiting payment");
    expect(paymentStatusLabel("PAID")).toBe("Paid");
    expect(paymentStatusLabel("COD_PENDING")).toBe("Cash on delivery");
    expect(paymentStatusLabel("COD_COLLECTED")).toBe("Paid");
  });

  it("returns null for null, undefined, and unknown values", () => {
    expect(paymentStatusLabel(null)).toBeNull();
    expect(paymentStatusLabel(undefined)).toBeNull();
    expect(paymentStatusLabel("WHATEVER")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/order-status.test.ts`
Expected: all fail with `Cannot find module '@/app/_lib/order-status'`.

- [ ] **Step 3: Implement the module**

Create `app/_lib/order-status.ts`:

```ts
// app/_lib/order-status.ts
// Payment-lifecycle enum and customer-facing labels for Order.paymentStatus.

export const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "COD_PENDING",
  "COD_COLLECTED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Returns the initial payment status for a new order based on payment method.
 * COD orders are awaiting cash collection at delivery; everything else is
 * awaiting online payment confirmation.
 */
export function initialPaymentStatus(paymentMethod: string): PaymentStatus {
  return paymentMethod === "COD" ? "COD_PENDING" : "PENDING";
}

/** Customer-facing label for a payment status. Returns null for null / unknown. */
export function paymentStatusLabel(
  status: PaymentStatus | string | null | undefined,
): string | null {
  if (!status) return null;
  switch (status) {
    case "PENDING":
      return "Awaiting payment";
    case "PAID":
    case "COD_COLLECTED":
      return "Paid";
    case "COD_PENDING":
      return "Cash on delivery";
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/order-status.test.ts`
Expected: `Tests 7 passed (7)` (3 describe blocks: 1 + 3 + 3 = 7 it-blocks; double-check).

Actually count: 1 + 3 + 2 = 6 it-blocks. Expected output: `Tests 6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-status.ts app/_lib/__tests__/order-status.test.ts
git commit -m "feat(order): add paymentStatus type, label resolver, and initial-status helper"
```

---

## Task 2: New `rb-number.ts` module + tests

**Files:**
- Create: `app/_lib/rb-number.ts`
- Create: `app/_lib/__tests__/rb-number.test.ts`

- [ ] **Step 1: Write the failing tests**

The helper uses Prisma's `$queryRaw` against a sequence — the test mocks the transaction client and verifies the helper passes the SQL through and formats the result.

Create `app/_lib/__tests__/rb-number.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { nextRbNumber } from "@/app/_lib/rb-number";
import type { Prisma } from "@prisma/client";

function makeMockTx(nextValue: bigint): Prisma.TransactionClient {
  const queryRaw = vi.fn().mockResolvedValue([{ next: nextValue }]);
  return { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
}

describe("nextRbNumber", () => {
  it("formats the sequence value with the RB prefix", async () => {
    const tx = makeMockTx(1001n);
    const result = await nextRbNumber(tx);
    expect(result).toBe("RB1001");
  });

  it("handles arbitrary sequence values", async () => {
    const tx = makeMockTx(1042n);
    expect(await nextRbNumber(tx)).toBe("RB1042");
  });

  it("handles values beyond 9999", async () => {
    const tx = makeMockTx(10001n);
    expect(await nextRbNumber(tx)).toBe("RB10001");
  });

  it("calls $queryRaw on the provided client", async () => {
    const tx = makeMockTx(1001n);
    await nextRbNumber(tx);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/rb-number.test.ts`
Expected: all 4 tests fail with `Cannot find module '@/app/_lib/rb-number'`.

- [ ] **Step 3: Implement the module**

Create `app/_lib/rb-number.ts`:

```ts
// app/_lib/rb-number.ts
// Sequence-backed generator for the customer-facing order reference
// `RB####`. Atomic, race-free, never resets.

import type { Prisma } from "@prisma/client";

/**
 * Returns the next RB-prefixed order number, e.g. "RB1001".
 *
 * Backed by the Postgres sequence `rb_number_seq` (created in the migration
 * that introduces Order.rbNumber). nextval() is atomic, so concurrent inserts
 * cannot collide.
 *
 * If the surrounding transaction rolls back, the consumed number is burned
 * (gap in sequence) — that's acceptable.
 *
 * Pass the transaction client (`tx`) when called inside `prisma.$transaction`
 * so the read participates in the same statement timeout / isolation.
 */
export async function nextRbNumber(
  client: Prisma.TransactionClient,
): Promise<string> {
  const rows = await client.$queryRaw<Array<{ next: bigint }>>`
    SELECT nextval('rb_number_seq') AS next
  `;
  return `RB${rows[0].next}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/rb-number.test.ts`
Expected: `Tests 4 passed (4)`.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/rb-number.ts app/_lib/__tests__/rb-number.test.ts
git commit -m "feat(order): add nextRbNumber helper (sequence-backed)"
```

---

## Task 3: Schema migration — add paymentStatus, rbNumber, and the sequence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_payment_status_and_rb_number/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In `model Order`, add two fields adjacent to the existing `paymentMethod` / `status` block:

```prisma
paymentStatus         String?
rbNumber              String?   @unique
```

Place them in a sensible spot — near `paymentMethod` makes logical sense (payment-lifecycle next to payment-method).

- [ ] **Step 2: Generate the migration (without applying)**

Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > /tmp/migration.sql`

(The above generates the SQL diff. On Windows shell, redirect to a temp file you can read.)

Alternative — if `prisma migrate dev` works non-interactively in your environment:

```bash
npx prisma migrate dev --name add_payment_status_and_rb_number --create-only
```

`--create-only` writes the migration file but does not apply it. You can then hand-edit it to add the sequence.

Either way, you need to end up with a migration folder like:
`prisma/migrations/<timestamp>_add_payment_status_and_rb_number/migration.sql`

- [ ] **Step 3: Hand-edit the migration to add the sequence**

The auto-generated SQL will have the ALTER TABLE + CREATE UNIQUE INDEX statements. You must also add the `CREATE SEQUENCE`. The complete `migration.sql` should be:

```sql
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "rbNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_rbNumber_key" ON "Order"("rbNumber");

-- CreateSequence
CREATE SEQUENCE "rb_number_seq" START WITH 1001 INCREMENT BY 1 MINVALUE 1001 NO CYCLE;
```

If the auto-generated migration includes anything else (it shouldn't, but verify), drop unrelated statements.

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy`

Expected: "Applied 1 migration." Then run `npx prisma generate` to refresh the Prisma client types.

If `prisma migrate dev` is your usual path and it works non-interactively, you can run `npx prisma migrate dev` instead (without `--create-only`). It will apply the file you edited.

- [ ] **Step 5: Verify the columns and sequence**

Run a quick check via `npx tsx`:

```bash
npx tsx -e "import('./app/_lib/prisma').then(m => m.prisma.\$queryRaw\`SELECT nextval('rb_number_seq') AS next\`.then(r => { console.log(r); return m.prisma.\$disconnect(); }))"
```

Expected: `[ { next: 1001n } ]` on first call, `[ { next: 1002n } ]` on second call, etc. Each invocation increments. (If you run this once for verification, the next real order will get `1002` instead of `1001`. Acceptable — gaps in the sequence are fine.)

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0. Prisma client regeneration adds the two optional fields; nothing currently writes them, so no callers complain.

- [ ] **Step 7: Run the unit suite**

Run: `npm test`
Expected: all tests pass (Task 1 and Task 2 helpers, plus the existing 42 tests, plus the new helper tests = 51 or so).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(order): add paymentStatus, rbNumber, and rb_number_seq sequence"
```

---

## Task 4: Update `processOrder` to write the two new fields

**Files:**
- Modify: `app/checkout/actions.ts`
- Modify: `app/checkout/__tests__/actions.test.ts`

- [ ] **Step 1: Add imports**

In `app/checkout/actions.ts`, add at the top alongside the other `_lib` imports:

```ts
import { initialPaymentStatus } from "@/app/_lib/order-status";
import { nextRbNumber } from "@/app/_lib/rb-number";
```

- [ ] **Step 2: Compute the values inside the existing transaction**

Find the `prisma.$transaction(async (tx) => { ... })` block (or `prisma.$transaction([...])` if the file uses the array form — read the file to confirm; the slice-A diff used the callback form).

Just before `tx.order.create`:

```ts
const rbNumber = await nextRbNumber(tx);
const paymentStatus = initialPaymentStatus(parsed.data.paymentMethod);
```

Where `parsed.data.paymentMethod` is the existing payment-method value already in scope. Match whichever local variable name the code uses (it may be `paymentMethod` or `parsed.paymentMethod` or `parsed.data.paymentMethod` — read first).

- [ ] **Step 3: Add both fields to `tx.order.create`'s `data` block**

```ts
await tx.order.create({
  data: {
    // ... existing fields ...
    paymentStatus,
    rbNumber,
  },
});
```

- [ ] **Step 4: Update the existing checkout-action test fixtures**

Read `app/checkout/__tests__/actions.test.ts`. The existing tests likely assert on `mockCreate.mock.calls[0][0].data` shape. Find every such assertion and add the two new fields to the expected shape:

```ts
expect(mockCreate).toHaveBeenCalledWith({
  data: expect.objectContaining({
    // ... existing fields ...
    paymentStatus: "COD_PENDING",          // or "PENDING" for online providers
    rbNumber: expect.stringMatching(/^RB\d+$/),
  }),
});
```

If the test uses a partial-match style (`expect.objectContaining`), just add the two new keys. If it uses an exact-match comparator, add both keys with `expect.stringMatching` for `rbNumber` and the literal status string for `paymentStatus`.

For the `nextRbNumber` mock: the test will need to mock the transaction client's `$queryRaw` so the helper resolves to a deterministic value (e.g., `[{ next: 1001n }]`). If the existing test already has a Prisma mock factory, extend it; otherwise add a `$queryRaw` mock. Pattern:

```ts
const tx = {
  // ... existing mocks ...
  $queryRaw: vi.fn().mockResolvedValue([{ next: 1001n }]),
  order: { create: mockCreate, /* ... */ },
} as unknown as Prisma.TransactionClient;
```

- [ ] **Step 5: Run the action tests**

Run: `npx vitest run app/checkout/__tests__/actions.test.ts`
Expected: all tests pass.

If tests fail because the fixture's payment method differs (e.g., the fixture is `PAYHERE` but you asserted `COD_PENDING`), adjust the assertion to match what the fixture's `paymentMethod` is.

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

- [ ] **Step 7: Run full unit suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/checkout/actions.ts app/checkout/__tests__/actions.test.ts
git commit -m "feat(order): processOrder populates paymentStatus and rbNumber"
```

---

## Task 5: Customer order list UI — show RB number and payment-status badge

**Files:**
- Modify: `app/account/orders/page.tsx`

- [ ] **Step 1: Read the file**

Use Read on `app/account/orders/page.tsx`. Note:
- How each order row is rendered.
- How the existing `status` badge is rendered (color/variant pattern).
- Whether `Badge` is imported from `components/ui/badge` and what variants it supports.

- [ ] **Step 2: Add imports**

```ts
import { paymentStatusLabel, type PaymentStatus } from "@/app/_lib/order-status";
```

- [ ] **Step 3: Render the RB number as the order headline**

For each order, if `order.rbNumber` is truthy, show it where the existing CUID-based headline appears. Otherwise show the existing layout unchanged.

If the current layout is something like:
```tsx
<div>Order #{order.id.slice(-8)}</div>
```
Change to:
```tsx
<div>{order.rbNumber ?? `Order #${order.id.slice(-8)}`}</div>
```

Adapt to the actual structure — the goal is "RB number first, CUID fallback for legacy".

- [ ] **Step 4: Render the payment-status badge**

Next to the existing order-status badge, render a payment-status badge when `order.paymentStatus` is truthy. Use the existing `Badge` component (probably `@/components/ui/badge`).

Color/variant mapping:

```tsx
function paymentBadgeVariant(status: string | null | undefined): string {
  switch (status) {
    case "PENDING":
      return "warning";      // amber
    case "COD_PENDING":
      return "info";         // blue
    case "PAID":
    case "COD_COLLECTED":
      return "success";      // green
    default:
      return "secondary";    // fallback
  }
}
```

If the project's Badge component doesn't have those exact variants, use the closest existing ones (e.g., `default`, `secondary`, `destructive`). The plan does not require extending the Badge component — pick the closest match and add a comment.

Rendered:

```tsx
{order.paymentStatus ? (
  <Badge variant={paymentBadgeVariant(order.paymentStatus)}>
    {paymentStatusLabel(order.paymentStatus)}
  </Badge>
) : null}
```

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean exit 0.

- [ ] **Step 6: Run unit tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Smoke-test in browser (optional)**

```bash
npm run dev
```

Sign in (the test user from auth-state.spec.ts works — `authtest@example.com` / `TestPass123!`), place a COD order, navigate to `/account/orders`. Verify:
- Most-recent order shows `RB1001` (or whatever the next sequence value is) as the headline.
- A blue "Cash on delivery" badge appears next to the order-status badge.

Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add app/account/orders/page.tsx
git commit -m "feat(order): show RB number and payment status badge on order list"
```

---

## Task 6: Playwright e2e — RB number and badge appear after a COD order

**Files:**
- Modify: `tests/e2e/delivery-zone-pricing.spec.ts` (preferred — extend existing) OR create a new spec.

The simpler path is to extend the existing delivery-zone spec since it already places an order; we just add assertions on `/account/orders` after submit. If preferring isolation, create a new spec file with its own setup.

- [ ] **Step 1: Read the existing spec**

Read `tests/e2e/delivery-zone-pricing.spec.ts`. The current test stops at toggling city. To extend, submit the order with a chosen payment method, then navigate to `/account/orders`.

- [ ] **Step 2: Decide: extend or new file**

Extending is cheaper but couples two concerns in one test. A separate file is cleaner. Pick one:

**Option A — extend `tests/e2e/delivery-zone-pricing.spec.ts`:** at the end of the existing test, after the Kandy assertion, switch back to Colombo, select COD payment, submit, then navigate to `/account/orders` and assert.

**Option B — new file `tests/e2e/order-confirmation.spec.ts`:** copy the setup from delivery-zone-pricing, add to cart + checkout + submit + navigate to /account/orders. Self-contained.

If extending: keep the test name accurate or rename to something like "checkout delivery cost flips between zones and order shows RB number + badge".

If new file: follow the same beforeAll/afterAll pattern with a different test user email (e.g., `rbtest@example.com`).

- [ ] **Step 3: Write the new assertions**

Inside the test, after submitting the order (the submit button in the checkout has text like "Place Order"):

```ts
// Submit the COD order
await page.locator("#city").selectOption("Colombo");
await page.getByRole("radio", { name: /Cash on Delivery/i }).check();
await page.getByRole("button", { name: /^Place Order/i }).click();

// Wait for navigation to the order confirmation / orders page.
// Adapt the destination based on what processOrder redirects to.
await page.waitForURL(/\/(checkout\/success|account\/orders)/, { timeout: 10_000 });

await page.goto("/account/orders");

// The most recent order's RB number is visible.
await expect(page.getByText(/RB\d{4,}/)).toBeVisible();
// The COD-pending badge is visible.
await expect(page.getByText(/Cash on delivery/i)).toBeVisible();
```

If the actual button text or payment-method labels differ, adapt to whatever `checkout-client.tsx` actually renders.

- [ ] **Step 4: Run the test**

Run: `npm run test:e2e`
Expected: all e2e tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/   # whichever spec file you touched / created
git commit -m "test(e2e): assert RB number and payment-status badge after COD order"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: all tests pass (existing 42 + at least 6 from order-status + 4 from rb-number + any new processOrder assertions = ~52).

- [ ] **Step 2: Run all e2e tests**

Run: `npm run test:e2e`
Expected: both/all e2e specs pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: build succeeds, all 26 routes generated, no TS errors.

- [ ] **Step 4: Verify the sequence state**

Run a quick check:

```bash
npx tsx -e "import('./app/_lib/prisma').then(m => m.prisma.\$queryRaw\`SELECT last_value, is_called FROM rb_number_seq\`.then(r => { console.log(r); return m.prisma.\$disconnect(); }))"
```

Expected output: `[ { last_value: <N>n, is_called: true } ]` where `<N>` is at least `1001` (or higher if the e2e tests have placed orders). The sequence is active.

- [ ] **Step 5: Manual smoke**

```bash
npm run dev
```

1. Place a COD order through `/checkout`.
2. `/account/orders` shows the new order with `RB####` as the headline.
3. A blue "Cash on delivery" badge appears next to the order-status badge.
4. Legacy orders (if visible) still render with the CUID-based headline and no payment badge.

Stop the dev server.

- [ ] **Step 6: Final commit (only if tweaks were made during smoke)**

```bash
git add <touched files>
git commit -m "chore(order): smoke-test tweaks"
```

---

## Wrap-up

After Task 7 passes:

1. Push the feature branch (`feat/payment-status-and-rb-number` or similar).
2. Merge fast-forward into `develop`, push.
3. Merge `develop` into `main` with `--no-ff`, push.
4. Delete the feature branch local + remote.
