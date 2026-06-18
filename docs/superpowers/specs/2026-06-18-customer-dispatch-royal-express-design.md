# Customer-facing dispatch flow — Royal Express

**Date:** 2026-06-18
**Status:** Design (approved direction; pending spec review)
**Branch:** `worktree-feat-dispatch-royal-express`

## Problem

When an order is dispatched, the customer should be emailed automatically and told
their order is on its way with **Royal Express**, including the tracking number.
Today none of that happens for the customer:

- There is **no `DISPATCHED` order status**. Orders go `PENDING → CONFIRMED → DELIVERED`;
  "dispatch" today just means a Curfox courier booking was made (`courierBookedAt` set
  while `status` stays `CONFIRMED`).
- The only dispatch email (`sendDispatchNotificationEmail`) goes to the **merchant**
  (the brand inbox), not the customer, and tells the merchant how to print the waybill.
- The admin cannot manually enter or edit a tracking number; it is only ever the
  Curfox-generated waybill.
- The customer order-history list shows `Tracking: <code>` but **no carrier name**.
- The carrier the customer should see is **Royal Express**. The platform behind it is
  Curfox, an internal/merchant detail the customer must never see.

## Goals (maps to the 6 requirements)

1. Marking an order **Dispatched** automatically emails the customer.
2. The dispatch email includes: order number, tracking number, delivery company
   **Royal Express**, and a clear "dispatched / track with this number" message.
3. Admin can enter/update the tracking number, and the delivery company is saved as
   **Royal Express** on the order when dispatched.
4. Customer-facing surfaces (order history, dispatch email, tracking info, delivery-status
   text) show **Royal Express**.
5. **Curfox** is never shown, saved as the visible carrier, or referenced in the customer
   view. The customer carrier label is always Royal Express.
6. The email is sent only **after** the order is successfully updated to Dispatched **and**
   a tracking number is available, and is **not** re-sent if the order is edited again
   after dispatch.

## Key decisions (from brainstorming)

- **`DISPATCHED` is a real status:** `PENDING → CONFIRMED → DISPATCHED → DELIVERED`.
- **Dispatch is Curfox-primary with a manual fallback.** Curfox booking stays the default
  trigger and auto-fills the tracking number. Because `ROYAL_EXPRESS_ENABLED="false"` in
  dev and the prod `CurfoxCity` table is unseeded (≈34/60 cities fail to book), a strictly
  Curfox-only trigger would make requirement #1 unreachable for many orders. So the
  editable tracking field **doubles as a fallback source**: when Curfox is disabled or its
  booking fails, the admin enters a Royal Express tracking number and marks the order
  Dispatched manually. Same status flip, same carrier, same customer email.
- **Customer view = enhance the existing `/account/orders` list.** No new per-order page.

## Definition of "dispatched"

An order is **Dispatched** when it has a tracking number. Reaching that state — by either
path — performs one atomic transition:

```
status        → "DISPATCHED"
deliveryCompany → "Royal Express"
trackingCode    → <waybill or admin-entered number>
```

…and then sends the customer dispatch email exactly once.

## Data model

Add to `Order` (one migration):

| Field | Type | Purpose |
|---|---|---|
| `deliveryCompany` | `String?` | Carrier saved on the order at dispatch. Set to `"Royal Express"`. (Req #3) |
| `customerDispatchEmailSentAt` | `DateTime?` | Idempotency guard for the **customer** dispatch email. Distinct from the existing `dispatchEmailSentAt`, which guards the **merchant** "print-the-waybill" email. (Req #6) |

- `status` is a free-form `String`, so the new `"DISPATCHED"` value needs no enum migration.
- `trackingCode` already exists and is already shown to customers — it is the tracking number.
- A single carrier constant `DELIVERY_COMPANY_NAME = "Royal Express"` lives in a small module
  (`app/_lib/carrier.ts`) and is the single source of truth for the customer-facing name.

## Components & flow

### 1. Dispatch action — `app/admin/orders/actions.ts`

- **`bookCourier(orderId)`** (Curfox primary): unchanged up to persisting the waybill. After
  the waybill persists (the existing "⑨ persist waybill" update in `book-courier.ts`), the
  same update also sets `status="DISPATCHED"` and `deliveryCompany="Royal Express"`. Then the
  customer dispatch email is sent (guarded by `customerDispatchEmailSentAt`), and that column
  is stamped on success. The existing merchant email and `dispatchEmailSentAt` are unchanged.
- **`dispatchManually(orderId, trackingNumber)`** (new — fallback): requires `status==="CONFIRMED"`
  and not already dispatched. Validates a non-empty tracking number. Sets
  `trackingCode`, `status="DISPATCHED"`, `deliveryCompany="Royal Express"`, then sends the
  customer email once. Used when Curfox is disabled or its booking failed. Does **not** call Curfox.
- **`updateTrackingNumber(orderId, trackingNumber)`** (new): updates `trackingCode` on an
  already-dispatched order. **Never** resends the customer email. (Req #3 "update", Req #6.)
- **`bulkDispatch`** already routes through `bookCourierAndNotify`, so it inherits the status
  flip + customer email for free.

### 2. Courier orchestration — `app/checkout/book-courier.ts`

`bookCourierAndNotify` is the shared path for `bookCourier` and `bulkDispatch`. The waybill-persist
update gains `status` + `deliveryCompany`. After it succeeds, a new
`trySendCustomerDispatchEmail(order)` helper sends `sendCustomerDispatchEmail`, guarded by and
stamping `customerDispatchEmailSentAt`, mirroring the existing `tryDispatchEmail` pattern
(never throws; failures logged via `logMailerError("dispatch", …)`). The merchant
`tryDispatchEmail` stays as-is.

### 3. State machine — `app/_lib/admin-orders.ts`

```
PENDING:    ["CONFIRMED"]
CONFIRMED:  ["DELIVERED"]      // manual-advance fallback only; DISPATCHED is NOT reachable via advanceStatus
DISPATCHED: ["DELIVERED"]      // new
DELIVERED:  []
CANCELLED:  []
```

`DISPATCHED` is reached only through the dispatch actions, never plain `advanceStatus`, so the
"Mark delivered" button can still appear for a `CONFIRMED` order that was never dispatched
(e.g. Curfox disabled and admin chose not to dispatch).

### 4. Mailer — `app/_lib/mailer.ts`

New `sendCustomerDispatchEmail(order: OrderDetails)`:
- **To** the customer (`order.customerEmail`), **bcc** the brand inbox, `replyTo` brand.
- Subject: `Your order <ref> has been dispatched — <BRAND_NAME>`.
- Body includes: order reference (`orderReference`), **Tracking number**, **Delivery company:
  Royal Express**, and a clear message that the order has been dispatched and can be tracked
  using the tracking number.
- **No Curfox portal link** and no "Curfox" text. (Req #5.) The portal link stays only in the
  merchant `sendDispatchNotificationEmail`.
- Reuses existing helpers (`escapeHtml`, `formatPrice`, item list) and the existing HTML shell
  style for consistency.

### 5. Admin UI

- `app/_components/admin/orders/order-actions.tsx` and `row-actions.tsx`: the "Mark delivered"
  control now keys off `status === "DISPATCHED"` (today it keys off `CONFIRMED && courierBooked`).
- Order detail (`app/admin/orders/[id]/page.tsx`): add a small **tracking number** editor in the
  "Status & dispatch" panel:
  - When `status==="CONFIRMED"` **and** Curfox is unavailable — `ROYAL_EXPRESS_ENABLED !== "true"`
    **or** a prior booking failed (`courierLastError` is set) → a tracking input + **Mark
    Dispatched** (calls `dispatchManually`). The detail page is a server component, so it reads
    both signals directly. (The primary Curfox **Dispatch** button still shows for a clean
    `CONFIRMED && !courierBooked` order.)
  - When `status==="DISPATCHED"` → the input shows the current `trackingCode` with **Save**
    (calls `updateTrackingNumber`; no email resent).
  - The existing Curfox **Dispatch / Book courier** button remains the primary action for
    `CONFIRMED && !courierBooked`.

### 6. Customer order history — `app/account/orders/page.tsx`

- `STATUS_LABEL`: add `DISPATCHED → "Dispatched"`; remove the dead `SHIPPED` entry.
- For dispatched orders, render the carrier name **Royal Express**
  (`order.deliveryCompany ?? DELIVERY_COMPANY_NAME`) alongside the existing `Tracking: <code>` line.
- The `DISPATCHED` badge uses the existing badge styling.

## Error handling

- Customer email send failures never block or roll back the dispatch — they are caught and logged
  (`logMailerError("dispatch", …)`), consistent with the existing merchant email. The order is
  still marked DISPATCHED and `customerDispatchEmailSentAt` stays null (so the guard never falsely
  reports "sent"). There is no automatic retry once an order is DISPATCHED; a dedicated
  resend-dispatch-email admin action is out of scope for this change.
- `dispatchManually` and `updateTrackingNumber` reject empty/whitespace tracking numbers and
  wrong-status orders with a clear `ActionResult` error.
- Idempotency: the customer email is gated on `customerDispatchEmailSentAt == null`; editing the
  tracking number afterward updates `trackingCode` only.

## Requirement #5 audit (Curfox in the customer view)

Current customer-facing surfaces do **not** reference Curfox:
- `/account/orders` — no carrier text today.
- `/checkout/success`, `sendOrderConfirmationEmail` — no carrier name.
- `components/ui/city-combobox.tsx` — "Curfox" appears only in a code comment, not visible text.

Remaining Curfox references are all merchant/admin-only and stay: the merchant dispatch email,
`PrintLabelLink` ("Print label (Curfox)"), and `app/_lib/curfox-portal.ts`. The change is purely
additive on the customer side: the new email and the new carrier label use **Royal Express**.

## Testing

- `app/_lib/__tests__/mailer-dispatch.test.ts` — new `sendCustomerDispatchEmail` cases: sent to the
  customer, contains order ref + tracking number + "Royal Express" + dispatched message, contains
  **no** "Curfox" and no portal link.
- `app/checkout/__tests__/book-courier.test.ts` — booking flips `status`/`deliveryCompany`, sends the
  customer email once, and stamps `customerDispatchEmailSentAt`.
- `app/_lib/__tests__/admin-orders.test.ts` — transitions include `DISPATCHED → DELIVERED` and
  exclude `CONFIRMED → DISPATCHED` via `advanceStatus`.
- `app/admin/orders/__tests__/actions.test.ts` — `dispatchManually` sets the new fields + emails;
  `updateTrackingNumber` changes `trackingCode` without resending; `bookCourier` sets the new fields.
- Gate: `npm run build` plus the affected suites.

## Migration / rollout note

This adds two nullable columns via one Prisma migration. Migrations in this repo are **decoupled
from the build** (applied via a separate GitHub Action / manual step), so the migration must be
**explicitly applied** to dev and prod; it will not run as part of `npm run build`. The new columns
are nullable and backward-compatible: pre-existing dispatched orders read `deliveryCompany` as null
and fall back to the `DELIVERY_COMPANY_NAME` constant for display.

## Out of scope

- No dedicated customer per-order detail page (`/account/orders/[id]`).
- No change to the merchant dispatch email, the Curfox booking client, or the checkout flow.
- No carrier other than Royal Express (single hard-coded carrier).
