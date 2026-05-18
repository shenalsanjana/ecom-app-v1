# Admin Email Overhaul — Spec

**Status:** Approved · 2026-05-18
**Slice:** E (of a larger checkout/payment/courier overhaul — see "Out of scope" below)

## Goal

Update all four admin (brand-facing) email templates — dispatch, pending-prepaid, order-confirmation BCC, and admin failure alert — to include the new fields landed in slices A and B (`rbNumber`, `paymentStatus`, the corrected COD amount, and delivery notes), and document the production `BRAND_EMAIL` value.

## Why

- After slices A and B, every new order has an `rbNumber` and `paymentStatus`. The admin emails currently don't surface either field, so the merchant has to cross-reference the customer list to find the RB reference and infer payment status from the payment-method line.
- The current dispatch email reports `COD AMOUNT: ${formatPrice(order.total)}` regardless of payment method — for online (PAYHERE / KOKO / MINITPAY) orders that have been (or will be) paid online, the courier collects nothing and the "COD amount" line lies. Correcting this prevents a downstream operational error when slice C ships and we start sending the same value to RoyalExpress as `cod`.
- The original request specifies that the dispatch notification go to `dressingbear@gmail.com`. Today the recipient is `BRAND_EMAIL` from `.env.local`; this slice updates documentation and confirms env-driven configuration. Anyone wanting to test against a personal mailbox in dev can override.

## Scope

### In

- `OrderDetails` (in `app/_lib/mailer.ts`) gains two optional fields: `rbNumber?: string | null` and `paymentStatus?: string | null`. Both nullable because the 21 legacy orders have NULL values for those columns.
- New tiny helper (in `mailer.ts` or adjacent): `codAmountFor(order)` returning `order.paymentMethod === "COD" ? order.total : 0`. Used by every template that previously rendered `order.total` as a "COD amount".
- All four admin email templates updated:
  - `sendDispatchNotificationEmail`
  - `sendPendingPrepaidNotificationEmail`
  - `sendOrderConfirmationEmail` (brand BCC body — same template body that the customer also sees)
  - `sendAdminFailureAlertEmail`
- Common additions per template (text + HTML bodies, where applicable to the email's purpose):
  - Headline / "Order:" identifier: prefer `RB Number` over the opaque CUID when present.
  - Payment status line: rendered via `paymentStatusLabel(order.paymentStatus)` from `app/_lib/order-status.ts`. Skipped when null.
  - COD amount line: `formatPrice(codAmountFor(order))` — replaces any stale `formatPrice(order.total)` in COD-amount positions.
  - Delivery notes section: shown when `order.notes` is truthy. Already present on the customer-confirmation template; verify on the others.
- Subject-line updates where they add signal:
  - Dispatch: `[Dispatch] {rbNumber ?? "Order " + orderId} — Waybill {waybill}`
  - Pending prepaid: `[Awaiting Payment] {rbNumber ?? "Order " + orderId} — {paymentMethod}`
  - Failure alert: `[Failure] {rbNumber ?? "Order " + orderId}`
  - Order confirmation: subject unchanged (customer-facing; copy already updated in slice A's review fixup). RB number is added to the body only.
- Caller pass-through:
  - `app/checkout/actions.ts` — wherever it builds an `OrderDetails` literal for the mailer calls (after `tx.order.create`), include `rbNumber` and `paymentStatus` from the persisted order.
  - `app/checkout/book-courier.ts` — same, if it constructs an `OrderDetails` for `sendDispatchNotificationEmail` and `sendAdminFailureAlertEmail`.
- `.env.local.example` updated with a comment noting the production value of `BRAND_EMAIL` is `dressingbear@gmail.com`.
- Existing tests updated: `app/_lib/__tests__/mailer-dispatch.test.ts` (and `app/checkout/__tests__/book-courier.test.ts` if it constructs `OrderDetails`) — fixtures carry `rbNumber: "RB1001"` and `paymentStatus: "COD_PENDING"`, assertions verify the new strings appear in the rendered email.

### Out (deferred to later slices)

- RoyalExpress courier integration (slice C) — when it lands, the booking call also reads `rbNumber` / `paymentStatus` and sends `cod = codAmountFor(order)` to RoyalExpress. Slice E does NOT touch that path; it only updates emails.
- PayHere / Koko / MintPay payment integrations (slice D).
- Hardcoded recipient. The recipient stays env-driven (`BRAND_EMAIL`); only documentation changes.
- New email templates. No new emails are added in this slice.
- New `sendPendingPrepaidNotificationEmail` / `sendOrderConfirmationEmail` / `sendAdminFailureAlertEmail` unit test files. The existing dispatch-email test is the regression net; the other three are template-only string-substitution edits and would not benefit from net-new vitest files in this slice. (If the merchant later wants more email-template coverage, that's a separate slice.)

## Architecture

### `OrderDetails` type extension — `app/_lib/mailer.ts`

```ts
export type OrderDetails = {
  // ... existing fields ...
  rbNumber?: string | null;
  paymentStatus?: string | null;
  // notes?: string  ← already exists
};
```

Both optional + nullable. Templates handle null gracefully (skip the line / fall back to the CUID-based label).

### COD amount helper — `app/_lib/mailer.ts`

```ts
/** Amount the courier should collect at delivery. Zero for any
 *  prepaid method; the order total for COD. */
function codAmountFor(
  order: Pick<OrderDetails, "paymentMethod" | "total">,
): number {
  return order.paymentMethod === "COD" ? order.total : 0;
}
```

Module-private (not exported). Used wherever a template currently renders `formatPrice(order.total)` as a "COD amount" line.

### Template change summary

Each template touches both the plain-text body and the HTML body. Below is the common content. Each template inherits whichever subset is relevant to its purpose.

```
Order Identifier (preferred RB, fallback CUID):
  text:  ORDER:        ${order.rbNumber ?? order.orderId}
  html:  <p><span class="label">Order:</span> ${escapeHtml(order.rbNumber ?? order.orderId)}</p>

Payment status (when not null):
  text:  PAYMENT:      ${paymentStatusLabel(order.paymentStatus)}
  html:  <p><span class="label">Payment:</span> ${escapeHtml(paymentStatusLabel(order.paymentStatus) ?? "")}</p>

COD amount (replaces formatPrice(order.total) in COD-amount lines):
  text:  COD AMOUNT:   ${formatPrice(codAmountFor(order))}
  html:  <p><span class="label">COD Amount:</span> <strong>${formatPrice(codAmountFor(order))}</strong></p>

Delivery notes (when order.notes is truthy):
  text:  NOTES:
         ${order.notes}
  html:  <div class="section"><h3>Delivery Notes</h3><p>${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p></div>
```

Per-template adaptation:
- `sendDispatchNotificationEmail` — gains all four (RB headline, payment status, corrected COD, notes).
- `sendPendingPrepaidNotificationEmail` — gains RB headline + payment status + notes. COD amount is irrelevant for prepaid pending; skip it.
- `sendOrderConfirmationEmail` — gains RB headline + payment status. Already has notes. COD amount irrelevant in the customer email; skip.
- `sendAdminFailureAlertEmail` — gains RB headline + payment status. COD amount irrelevant for a failure email; skip. Notes optional.

### Subject lines

```
sendDispatchNotificationEmail:
  before: `[Dispatch] Order ${order.orderId} — Waybill ${waybillNumber}`
  after:  `[Dispatch] ${order.rbNumber ?? "Order " + order.orderId} — Waybill ${waybillNumber}`

sendPendingPrepaidNotificationEmail:
  before: `[New Order] ${order.orderId} — ${order.paymentMethodDisplay ?? order.paymentMethod}`  (or similar; verify exact current text)
  after:  `[Awaiting Payment] ${order.rbNumber ?? "Order " + order.orderId} — ${order.paymentMethodDisplay ?? order.paymentMethod}`

sendAdminFailureAlertEmail:
  before: (whatever the current subject is — read first)
  after:  `[Failure] ${order.rbNumber ?? "Order " + order.orderId} — ${failureSummary}`

sendOrderConfirmationEmail:
  unchanged. (Customer-facing; copy already updated in slice A.)
```

### Caller changes

**`app/checkout/actions.ts`** — find every site that builds an `OrderDetails` literal and calls a mailer function. Most likely there are two: one for `sendOrderConfirmationEmail` and one for `sendPendingPrepaidNotificationEmail`. Add to each literal:

```ts
rbNumber: created.rbNumber,
paymentStatus: created.paymentStatus,
```

where `created` is the order row returned by `tx.order.create`.

**`app/checkout/book-courier.ts`** — find where `OrderDetails` is constructed for `sendDispatchNotificationEmail` and (if separate) `sendAdminFailureAlertEmail`. Add the same two fields, pulled from the `order` parameter passed in by `processOrder`.

If `book-courier.ts` receives a partial `OrderDetails`-shaped object built in `actions.ts`, the change is in `actions.ts` only. Read first.

### Documentation — `.env.local.example`

Add or update a comment on the `BRAND_EMAIL` line:

```
# Brand-side email address. Receives dispatch notifications, pending-prepaid
# alerts, order-confirmation BCCs, and failure alerts.
# Production value: dressingbear@gmail.com
BRAND_EMAIL=
```

## Testing

### Unit (Vitest)

- **`app/_lib/__tests__/mailer-dispatch.test.ts`** — extend the existing test fixture's `order` object to include `rbNumber: "RB1001"` and `paymentStatus: "COD_PENDING"`. Add assertions on the captured `sendMail` payload:
  - Subject contains `"RB1001"` and `"Waybill"`.
  - Plain-text body contains `"RB1001"`, `"Cash on delivery"`, `"LKR 2440"` (or whatever the fixture's total is — match exactly).
  - For a parallel "online" scenario (if the test has one or one is easy to add): COD amount is `"LKR 0"`, not the order total.
- **`app/checkout/__tests__/book-courier.test.ts`** — if the test constructs `OrderDetails`, add the two new fields to the fixture so the test still compiles after the type change.

### No new test files

Per scope decision: `sendPendingPrepaidNotificationEmail`, `sendOrderConfirmationEmail`, and `sendAdminFailureAlertEmail` get no dedicated test files in this slice. Their template edits are mechanical string substitutions and the type system catches missing field references.

### Manual smoke

A manual end-to-end of one COD order via the dev server should produce a dispatch email (visible in the dev SMTP capture / logs) containing the new fields. Not automated.

## Edge cases

1. **Legacy orders (21 rows) — `rbNumber` and `paymentStatus` are NULL.** Templates render `Order ${order.orderId}` in the headline (CUID fallback) and skip the payment-status line entirely. No "RB Number: null" appears anywhere.
2. **Order with empty `notes`.** Templates that render notes conditionally already do so (`order.notes && order.notes.trim()` is the existing pattern in `sendOrderConfirmationEmail`). Reuse that pattern in any template that currently doesn't have it.
3. **Unknown `paymentStatus` value (legacy or future).** `paymentStatusLabel` returns `null` for unrecognised values; the line is skipped.
4. **`paymentMethod` outside the known set** (e.g., a future provider). `codAmountFor` returns `0` for anything that isn't literally `"COD"` — which is the safe default (no false COD collection request to the courier).
5. **SMTP transport unset in dev / CI** — handled by existing `getTransport()` logic; not slice E's concern.

## Risks

- **Subject-line changes affect downstream filters.** If the merchant has a Gmail filter on the current subject string (e.g., "Order abcd1234"), the change to `RB1001` will break that filter. The merchant should re-create filters on the new subject pattern. Mention in PR description.
- **No new test coverage for three of the four templates.** Mechanical edits are caught by TypeScript; subtler issues (e.g., HTML escaping of a new field, broken conditional render) would only surface in production. Spec accepts this trade-off in exchange for slice E being a small slice. The merchant can request follow-up email-template tests in a separate slice.

## References

- Existing mailer module: `app/_lib/mailer.ts:114` (`sendOrderConfirmationEmail`), L327 (`sendDispatchNotificationEmail`), L432 (`sendPendingPrepaidNotificationEmail`), and `sendAdminFailureAlertEmail` further down.
- `paymentStatusLabel` helper landed in slice B: `app/_lib/order-status.ts`.
- `Order.rbNumber` and `Order.paymentStatus` landed in slice B's migration.
- Customer-facing email rename ("Shipping" → "Delivery") already landed in slice A's review fixup commit `7add080`.
