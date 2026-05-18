# Payment Status and RB Number — Spec

**Status:** Approved · 2026-05-18
**Slice:** B (of a larger checkout/payment/courier overhaul — see "Out of scope" below)

## Goal

Add two columns to the `Order` model — a payment-lifecycle enum (`paymentStatus`) and a sequence-backed internal reference (`rbNumber`, format `RB####`) — and populate both on every new order. Surface them on the customer order list. This is foundation work that unblocks the courier swap (slice C) and the payment-provider integrations (slice D).

## Why

- The current `Order.status` field tracks the order lifecycle (PENDING / CONFIRMED / SHIPPED / DELIVERED / CANCELLED). It does not represent whether the customer has actually paid. With three online payment providers (PayHere / Koko / MintPay) about to land, a separate payment-lifecycle field is needed so the courier-booking flow (slice C) and the payment webhooks (slice D) have an unambiguous signal to act on.
- The merchant wants a short, customer-friendly order reference (`RB1001`, `RB1002`, …) distinct from the opaque CUID `Order.id`. This is the identifier the merchant will use when speaking with the courier and the customer, and that we will send as the courier-side `order_no` once slice C lands.

## Scope

### In

- New `Order.paymentStatus: String?` (nullable). Values: `PENDING`, `PAID`, `COD_PENDING`, `COD_COLLECTED`. Set on every newly-created order: COD → `COD_PENDING`, any online provider → `PENDING`.
- New `Order.rbNumber: String? @unique` (nullable). Format: `RB` + integer from a PostgreSQL sequence starting at `1001`. Generated atomically inside the order-creation transaction.
- New helper module `app/_lib/rb-number.ts` — exports `nextRbNumber(client)`.
- New helper module `app/_lib/order-status.ts` — exports `PAYMENT_STATUSES`, the `PaymentStatus` type, `initialPaymentStatus(method)`, and `paymentStatusLabel(status)`.
- `processOrder` in `app/checkout/actions.ts` writes both fields on order create.
- Customer order list (`app/account/orders/page.tsx`) shows the RB number as the order headline (falling back to the existing CUID for legacy rows) and a colour-coded payment-status badge.
- Vitest coverage for both helper modules and the new `processOrder` writes. Playwright e2e extending the existing suite — submit a COD order, navigate to `/account/orders`, assert the RB number and the "Cash on delivery" badge are present.

### Out (deferred to later slices)

- RoyalExpress API wiring (slice C). The booking call will read `rbNumber` and `paymentStatus`, but the actual courier swap is separate.
- PayHere / Koko / MintPay integrations (slice D). The `PENDING → PAID` transition for online payments arrives with the first provider's webhook handler.
- A `codAmount` column. Per design discussion, the COD amount is derived at booking time from `paymentMethod === "COD" ? total : 0` — no schema change needed.
- Backfilling the 21 existing orders. Both new columns are nullable; legacy rows stay NULL. The merchant will audit later if needed.
- Admin email changes (RB number in the dispatch / confirmation emails). Deferred to slice E along with the broader email overhaul.
- Restructuring `trackingCode` / `courierWaybillNumber`. Both stay as-is; slice C decides whether to consolidate.

## Architecture

### New module — `app/_lib/order-status.ts`

```ts
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

/** Customer-facing label for a payment status. Returns null for null/unknown. */
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

### New module — `app/_lib/rb-number.ts`

```ts
import type { Prisma } from "@prisma/client";

/**
 * Returns the next RB-prefixed order number, e.g. "RB1001".
 *
 * Backed by the Postgres sequence `rb_number_seq` (starts at 1001, increments
 * by 1, never cycles). nextval() is atomic, so concurrent inserts cannot
 * collide. If the surrounding transaction rolls back, the consumed number is
 * "burned" — small gaps in the sequence are acceptable.
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

### Schema migration

Migration name: `add_payment_status_and_rb_number`.

```sql
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "rbNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_rbNumber_key" ON "Order"("rbNumber");

-- CreateSequence
CREATE SEQUENCE "rb_number_seq" START WITH 1001 INCREMENT BY 1 MINVALUE 1001 NO CYCLE;
```

`schema.prisma` `Order` model gains two fields:

```prisma
paymentStatus   String?
rbNumber        String?   @unique
```

The sequence is **not** declared in `schema.prisma` (Prisma doesn't model bare sequences). It is created in the migration SQL only. `prisma generate` doesn't need to know about it — the helper accesses it via raw SQL.

### `processOrder` change (`app/checkout/actions.ts`)

Inside the existing `prisma.$transaction((tx) => …)` callback, before `tx.order.create`:

```ts
const rbNumber = await nextRbNumber(tx);
const paymentStatus = initialPaymentStatus(parsed.data.paymentMethod);
```

Add both fields to the `data` block of `tx.order.create`. No other behaviour changes.

### Customer order list (`app/account/orders/page.tsx`)

Per existing rendering shape, each order row gets two additions:

1. **Headline:** if `order.rbNumber` is truthy, render it as the headline (`RB1001 · placed {date}`). Otherwise fall back to the existing CUID-based label for legacy orders.
2. **Payment-status badge:** when `order.paymentStatus` is truthy, render a Badge next to the existing order-status badge with the colour mapping below. When null, no badge.

| `paymentStatus` | Badge variant | Label (from `paymentStatusLabel`) |
| --- | --- | --- |
| `PENDING` | `warning` (amber) | "Awaiting payment" |
| `PAID` | `success` (green) | "Paid" |
| `COD_PENDING` | `info` (blue) | "Cash on delivery" |
| `COD_COLLECTED` | `success` (green) | "Paid" |
| `null` / unknown | (no badge) | (—) |

If the project's Badge component doesn't have variants matching the four above, use the closest existing variant or extend the component minimally. Match the existing pattern from how the order-status badge is rendered.

## Testing

### Unit (Vitest)

- `initialPaymentStatus`: COD → `COD_PENDING`; PAYHERE / KOKO / MINITPAY → `PENDING`; arbitrary string → `PENDING` (defensive default for unknown providers).
- `paymentStatusLabel`: each of the four valid statuses returns its label; null / undefined / unknown string returns `null`.
- `nextRbNumber`: mocked transaction client returns `[{ next: 1001n }]`, helper returns `"RB1001"`. Repeat with `1042n` → `"RB1042"`. Test that the helper passes the raw SQL through verbatim.
- `processOrder` test (`app/checkout/__tests__/actions.test.ts`): existing tests already construct a Prisma mock — extend to assert the `tx.order.create({ data })` call receives `rbNumber: expect.stringMatching(/^RB\d+$/)` and `paymentStatus: "COD_PENDING"` (or `"PENDING"` for online).

### Integration (Playwright)

Extend `tests/e2e/delivery-zone-pricing.spec.ts` OR add a new spec `tests/e2e/order-confirmation.spec.ts`. Either way:
- Place a COD order through the existing checkout flow.
- Navigate to `/account/orders`.
- Assert the page contains a substring matching `/RB\d{4,}/`.
- Assert the page contains the text "Cash on delivery".

## Edge cases

1. **Legacy orders (the 21 existing rows)** — both new columns are NULL. The order-list UI shows the existing CUID-based headline and no payment-status badge. Confirmed acceptable.
2. **Transaction rollback after `nextval`** — the consumed sequence value is burned; the next successful insert gets a number with a gap. Acceptable; document but do not mitigate.
3. **Concurrent order creation** — `nextval()` is atomic, isolation-safe. No race possible.
4. **Sequence overflow** — Postgres `nextval` on a default `bigint`-backed sequence will not overflow in any realistic e-commerce scenario; no mitigation.
5. **SQLite local dev** — CLAUDE.md mentions SQLite as a local option. The current dev DB is Postgres (confirmed by recent migrations and exploration). Switching to SQLite would require rewriting the sequence as a `Counter` table. **Not addressed in this slice.** Production and dev are Postgres; SQLite is a hypothetical future option.

## Risks

- **No backfill for the 21 existing rows.** UI must tolerate NULL on both columns. Reports that filter by `paymentStatus` must explicitly handle NULL or be aware they exclude legacy.
- **Sequence reset is manual.** If the merchant ever wants to restart RB numbering (e.g., for a new year or a fresh store launch), it requires manual SQL: `ALTER SEQUENCE rb_number_seq RESTART WITH <n>;`. Document but do not automate.
- **Type stays `String`** rather than a Prisma enum, matching the existing convention. TypeScript-level safety comes from the `PaymentStatus` type alias in `order-status.ts`. Anyone bypassing the helpers and writing raw strings into `paymentStatus` will not be caught at compile time.

## References

- Existing Order model: `prisma/schema.prisma:108-147`.
- Existing `processOrder`: `app/checkout/actions.ts:115` (post-delivery-zone-pricing).
- Order list UI: `app/account/orders/page.tsx`.
- Existing `status` and `paymentMethod` fields treated as strings (no Prisma enums) — `prisma/schema.prisma:123-125`. This spec follows the same convention.
