# Spec: WEB#### Order Number & Curfox Payload Mapping

**Date:** 2026-05-19
**Status:** Draft — awaiting implementation plan
**Related work:** [`payment-status-and-rb-number.md`](./payment-status-and-rb-number.md) (RB#### precedent),
[`admin-email-overhaul.md`](./admin-email-overhaul.md) (dispatch email + Curfox portal link rationale)

## Why

Two distinct problems surfaced together:

1. **The customer-facing order reference is too long.** Curfox currently receives the
   internal `ORD-${Date.now()}-${random}` identifier (e.g., `ORD-1734567890-AB12CD`)
   as `order_no`. That string appears on the printed waybill, in the Curfox merchant
   portal, and is what the rider sees. A short, sequential code (`WEB0001`,
   `WEB0002`, …) is easier to communicate by phone, easier to read on a label,
   and easier to type when looking the order up. The existing `RB####` code is
   used internally but never made it to Curfox.

2. **Some Curfox fields don't faithfully reflect what the customer entered.**
   Audit of `app/checkout/book-courier.ts`:
   - **Phone:** `+94770000000` is sent as `94770000000` (only `+` stripped). Sri
     Lankan couriers expect the local format `0770000000`. Misformatted phones
     have caused failed delivery contacts.
   - **Address:** `customer_address` contains only `line1` + `line2`. The city
     goes into `destination_city_id` separately, so the printed waybill label
     reads as an incomplete address.
   - **Notes:** Customer delivery notes are persisted to the DB and shown in the
     dispatch email, but never forwarded to Curfox's `remark` field, where the
     rider would see them.
   - **Customer name:** For logged-in users without a name on their session,
     the fallback literal `"Customer"` is sent to Curfox. The courier label
     reads "Customer" instead of the person's actual name.

3. **No regression tests lock the mapping.** Future edits to `book-courier.ts`
   can silently drift away from what the customer entered.

## What

Introduce a new customer-facing order reference `WEB####`, replace `rbNumber`
in all new orders, and fix the Curfox payload so every field reflects exactly
what the customer entered at checkout. Add tests that lock the mapping.

### Out of scope

- Touching historical orders. Old rows retain `rbNumber` (RB####) and display
  it correctly.
- Changing the Curfox `description` field. Per the user decision, the rider
  only needs to know a parcel is being delivered; the admin uses the dispatch
  email to know what's inside.
- Changing the hard-coded `weight = 1 kg` default.
- Sending items list to Curfox (admin arranges the parcel from the email).

## Architecture

### 1. Data model

New Prisma migration `add_web_number_column`:

- `Order.webNumber String? @unique` — nullable so existing rows stay valid.
- Postgres sequence `web_number_seq` starting at `1`.
- `rbNumber` column is **untouched**. It is no longer written by new orders,
  but old rows still display from it.

### 2. WEB code generator

New file `app/_lib/web-number.ts`:

```ts
import type { Prisma } from "@prisma/client";

export async function nextWebNumber(
  client: Prisma.TransactionClient,
): Promise<string> {
  const rows = await client.$queryRaw<Array<{ next: bigint }>>`
    SELECT nextval('web_number_seq') AS next
  `;
  return `WEB${String(rows[0].next).padStart(4, "0")}`;
}
```

- Atomic via `nextval` — same race-safe pattern as `nextRbNumber`.
- 4-digit zero-padded; naturally grows to 5 digits when the sequence crosses
  9999 (e.g., `WEB10000`). This matches the "Fixed 4 digits" decision with
  graceful overflow.
- Must be called inside `prisma.$transaction` so it participates in the same
  isolation/timeout as the order INSERT.

### 3. Reference precedence helper

New file `app/_lib/order-reference.ts`:

```ts
export function orderReference(o: {
  webNumber?: string | null;
  rbNumber?: string | null;
  orderId?: string;
  id?: string;
}): string {
  return o.webNumber ?? o.rbNumber ?? o.orderId ?? o.id ?? "";
}
```

Single source of truth for the precedence rule. Used everywhere `rbNumber ??`
appears today.

### 4. Curfox payload fixes (`app/checkout/book-courier.ts`)

**Phone normalization** — new local helper:

```ts
function toLocalSriLankaPhone(phone: string | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return "0" + digits.slice(2);
  if (digits.startsWith("0")) return digits;
  return digits;
}
```

- Handles `+94770000000`, `94770000000`, `0770000000`, and noisy inputs with
  spaces or dashes.
- Replaces the current `phone.replace(/\+/g, "")` call.

**Address line includes city** — extend `buildAddressLine`:

```ts
function buildAddressLine(addr: OrderDetails["shippingAddress"]): string {
  return [addr.line1, addr.line2, addr.city].filter(Boolean).join(", ");
}
```

- Result: `"1 Walls Lane, Apt 4B, Kotte"`.
- City is still also sent via `destination_city_id` / `destination_city_name`;
  this addition is for the printed waybill label only.

**Forward notes → `remark`:**

```ts
const orderItem: CurfoxOrderDataItem = {
  // ...
  remark: order.notes?.trim() || undefined,
};
```

- The `CurfoxOrderDataItemSchema` already declares `remark` as optional —
  no schema change needed.
- Only sent when non-empty.

**Order number to Curfox:**

```ts
order_no: orderReference(order),
```

- New orders → `WEB0042`.
- Old orders, if ever re-booked manually → still get their `RB####`.

### 5. Customer-name fix (`app/checkout/actions.ts`)

Remove the `?? "Customer"` fallback:

```ts
// Before:
customerName = session.user.name ?? "Customer";

// After:
if (!session.user.name?.trim()) {
  return {
    success: false,
    error: "Please add your name to your profile before checking out",
  };
}
customerName = session.user.name.trim();
```

- Guests already enforce a non-empty name via `GuestInfoSchema`.
- This only affects logged-in users with an empty session name — a rare
  edge case from accounts created without setting a name.

### 6. Display surface updates

All call sites that render the order reference today use
`order.rbNumber ?? order.orderId`. Replace with `orderReference(order)`.

| File | Lines | Purpose |
|---|---|---|
| `app/_lib/mailer.ts` | 111 | Add `webNumber?: string \| null` to `OrderDetails` |
| `app/_lib/mailer.ts` | 146, 194 | Confirmation email body |
| `app/_lib/mailer.ts` | 233 | **Customer confirmation subject** — currently shows the long `orderId`; switch to `orderReference()` |
| `app/_lib/mailer.ts` | 359–377 | `logMailerError` accepts `webNumber`, prefers it for the log line |
| `app/_lib/mailer.ts` | 401, 449, 492 | Dispatch email body + subject |
| `app/_lib/mailer.ts` | 510, 601 | Pending-prepaid email body + subject |
| `app/_lib/mailer.ts` | 640, 753 | Admin failure alert body + subject |
| `app/account/orders/page.tsx` | 64 | Account orders list |
| `app/checkout/book-courier.ts` | 45, 69 | `logMailerError` calls include `webNumber` |
| `app/checkout/actions.ts` | 96, 215, 236, 277, 297 | Generate and persist `webNumber`; stop writing `rbNumber`; pass `webNumber` into `OrderDetails` and log helpers |

### 7. Legacy code retention

`app/_lib/rb-number.ts` is kept in the repo with a comment noting it is no
longer called by new orders. Removing it is deferred until all historical
`rbNumber`-only rows have aged out of active customer reference (years).

Rationale: the existing `rbNumber` column is the only customer-facing
reference for historical orders. Deleting the helper would not break
anything immediately, but the comment makes the legacy status explicit.

## Testing

### New file: `app/checkout/__tests__/curfox-mapping.test.ts`

One fixture `OrderDetails` with every customer-entered field populated. One
`it` block per assertion, so a future failure points to the exact field:

- `order_no === "WEB0042"` (when `webNumber` is set)
- `order_no === "RB1001"` (when only `rbNumber` is set — legacy path)
- `customer_name === "Jane Doe"` (literal customer-entered name)
- `customer_phone === "0770000000"` (normalized from `+94770000000`)
- `customer_address === "1 Walls Lane, Apt 4B, Kotte"`
- `customer_email === "jane@example.com"`
- `cod === total` for COD, `cod === 0` for prepaid
- `remark === "Leave at the gate"` when notes present
- `remark` is omitted entirely when notes are empty/whitespace
- `destination_city_id` resolved for known city
- `destination_city_name` + `destination_state_name` for fallback path

### New file: `app/_lib/__tests__/web-number.test.ts`

- `nextWebNumber` returns `WEB0001`, `WEB0002`, … with 4-digit padding
- Returns `WEB10000` (5-digit) when the sequence crosses 9999

### Updated: `app/_lib/__tests__/mailer-dispatch.test.ts`

Add `it` blocks asserting the dispatch email text + html contains:

- `customerName` (as entered, not the Curfox-normalized version)
- `customerPhone` (display the original `+94…` format in the email)
- `shippingAddress.city`
- Full itemized list via `formatItemsList`
- `notes` block when notes are present
- Subject contains `WEB0042` when `webNumber` is set; falls back through
  `rbNumber`, then `orderId`
- COD amount line: `total` for COD orders, `0` for prepaid

### Updated: `app/checkout/__tests__/actions.test.ts`

- Change `expect.stringMatching(/^RB\d+$/)` → `expect.stringMatching(/^WEB\d{4,}$/)`
- Assert that `rbNumber` is `null` for new orders
- New test: logged-in user with empty `session.user.name` → `{ success: false }` with the expected error message

## Migration & rollout

1. Create the Prisma migration. Verify `npm run build` passes.
2. Apply the migration to dev DB. Verify a new order writes `webNumber` and
   leaves `rbNumber` NULL.
3. Verify the account orders page renders both old (RB####) and new (WEB####)
   orders correctly.
4. Verify a test order at Curfox shows `WEB####` as `order_no`.
5. Run the regression test suite to confirm the mapping is locked.

No data backfill. No deletion. Fully reversible by rolling the column back
(no production rows depend on `webNumber` outside of new orders).

## Open questions

None — all decisions confirmed in brainstorming:

- 4-digit fixed padding with graceful overflow
- WEB replaces rbNumber everywhere customer-facing for new orders
- Old orders keep their RB#### display
- Phone normalized to local format
- Address line includes city
- Notes forwarded to Curfox `remark`
- Customer name pulled from checkout form (no "Customer" fallback)
- Itemized list NOT sent to Curfox (admin uses email for parcel prep)
- Regression tests included
