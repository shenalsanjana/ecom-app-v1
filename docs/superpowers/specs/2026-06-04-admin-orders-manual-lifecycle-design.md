# Admin Orders — Manual Lifecycle & Actionable List

**Date:** 2026-06-04
**Status:** Approved design — ready for implementation plan
**Area:** Admin · Orders (`/admin/orders`)

## Problem

From the admin Orders **list** page, an admin cannot manage or dispatch orders. Two
separable issues are tangled together:

1. **The list is read-only.** Every management action (Confirm, Dispatch, Cancel,
   Mark delivered, Mark COD collected) lives only on the order **detail** page
   (`/admin/orders/[id]`). The list rows only link to the detail page.
2. **Orders never become dispatchable.** Every order is created `PENDING`. The only
   thing that advances `status` to `CONFIRMED` is the admin clicking "Mark confirmed"
   on the detail page. The Dispatch button renders only when
   `status === "CONFIRMED" && !courierBookedAt`, so it almost never appears — hence the
   `—` in every Dispatch cell and the **"Needs dispatch 0"** tab.

A third, underlying inconsistency: on a successful **online** payment,
`finalizePaidPayment` already auto-books the courier (sets `courierBookedAt`/waybill)
**while leaving `status` at `PENDING`**. So paid online orders are effectively
dispatched-but-never-confirmed, and the manual Dispatch button is really only a
COD / manual-fulfilment path.

## Goal

Make the full confirm → dispatch → deliver workflow work end-to-end, manageable
directly from the orders list, with one consistent manual lifecycle for every order.

## Decisions (from brainstorming)

- **Confirmation is manual for every order** (online and COD). Maximum admin control.
- **Dispatch is always manual.** Courier auto-booking is **removed** from payment
  finalization so it does not conflict with the manual flow.
- **List rows get a smart next-action button + a `⋯` menu** for secondary actions.
- **Bulk actions are in scope** (select rows → Confirm/Dispatch selected).
- **Unpaid online orders cannot be confirmed/dispatched** (payment guardrail). COD is
  exempt.

## Order lifecycle

One consistent, fully-manual flow:

```
PENDING ──Confirm──▶ CONFIRMED ──Dispatch──▶ CONFIRMED+booked ──Mark delivered──▶ DELIVERED
   │                     │
   └──────── Cancel ◀─────┘   (restores stock; CANCELLED is terminal)
```

- All orders are created `PENDING` (unchanged).
- **Confirm** = `advanceStatus(PENDING → CONFIRMED)` — exists, reused.
- **Dispatch** = `bookCourier` — exists, requires `CONFIRMED && !courierBookedAt`. Books
  Curfox, persists waybill, sends the dispatch email. COD amount already handled in
  `bookCourierAndNotify`.
- **Mark delivered** = `advanceStatus(CONFIRMED → DELIVERED)` — exists, reused.
- **Cancel** (`cancelOrder`, restores stock) / **Mark COD collected**
  (`markCodCollected`) — exist, reused.

No new status values. `nextStatuses` transitions stay as-is
(`PENDING→CONFIRMED→DELIVERED`). The backend action logic largely already exists; this
change wires it to the list, adds bulk variants, and removes one automation.

## Behavioural change — payment finalization

In `app/_lib/payments/order-finalization.ts`, `finalizePaidPayment` currently auto-books
the courier on successful online payment (the `ROYAL_EXPRESS_ENABLED` block calling
`bookCourierAndNotify`). **Remove that block.**

After the change, a paid online order:

- marks `paymentStatus: "PAID"` (unchanged, via the atomic claim),
- sends the **confirmation** email (kept, unchanged),
- stays `PENDING`, awaiting manual confirm + dispatch.

The **dispatch** email (sent inside `bookCourierAndNotify`) now fires only when the admin
dispatches.

Notes:

- Existing already-booked production orders are untouched; only future payments change.
- Koko is live in production, so this alters the live online flow — the implementation
  plan must include a verification step for the payment callback path.
- The `failed-payment` path (`finalizeFailedPayment`) is unchanged.

## Payment guardrail

An **online** order (`paymentMethod ∈ {PAYHERE, KOKO, MINTPAY}`) cannot be confirmed or
dispatched unless `paymentStatus === "PAID"`. **COD is exempt** (`COD_PENDING` is its
normal pre-delivery state).

- Enforced in the **server actions** (source of truth) — both single and bulk paths.
  A helper such as `canConfirm(order)` centralises the rule.
- In the UI, the smart button on an unpaid online row is disabled with an
  "Awaiting payment" tooltip.
- This stops shipping goods for online orders that have not been paid.

## List row UI — smart next-action + `⋯` menu

A client `RowActions` cell renders, per row, the single next action for the order's
state plus a `⋯` menu for secondary actions:

| State                   | Primary button   | `⋯` menu                                   |
| ----------------------- | ---------------- | ------------------------------------------ |
| PENDING                 | **Confirm**      | Cancel · Mark COD collected †              |
| CONFIRMED, not booked   | **Dispatch**     | Mark delivered · Cancel · Mark COD collected † |
| CONFIRMED, booked       | **Mark delivered** | Cancel · Mark COD collected †            |
| DELIVERED / CANCELLED   | — (waybill text) | (none)                                     |

† **Mark COD collected** appears only when `paymentMethod === "COD"` and
`paymentStatus === "COD_PENDING"` (matches the existing `markCodCollected` guard).

- Unpaid online PENDING rows: **Confirm** disabled with "Awaiting payment" tooltip.
- Actions call the existing server actions, then `router.refresh()`. Reuse the
  alert/confirm pattern from `app/_components/admin/orders/order-actions.tsx`
  (a small shared `runAction` helper can be extracted).
- The detail-page action panel (`OrderActions`) is unchanged.

## Bulk actions

- The orders table becomes a client component to hold selection state. Per-row
  checkboxes + a "select all on page" header checkbox.
- A sticky bulk bar appears when ≥1 row is selected, with **Confirm selected** and
  **Dispatch selected**.
- Two new server actions:
  - `bulkConfirm(ids: string[])`
  - `bulkDispatch(ids: string[])`
- Each loops server-side, applies the **same per-order rules and payment guardrail** as
  the single actions, and returns a per-order result array:
  `{ id, ok: boolean, error?: string }`.
- Invalid-state rows (wrong status, unpaid online, already booked) are **skipped**, not
  hard-failed. The bulk bar reports a summary, e.g.
  *"7 confirmed, 2 skipped (awaiting payment)."*
- `revalidatePath("/admin/orders")` after the batch.

**Chosen approach:** dedicated bulk server actions (above) rather than client-side
looping over single-order actions — fewer round-trips, atomic per-order reporting, and a
single place to enforce rules.

## Errors & validation

- Server actions remain the source of truth for state validation. A stale list cannot
  force an illegal transition: the action re-reads the order and returns a structured
  error / skip.
- Bulk actions never throw on a single bad item; they collect per-item results.
- `requireAdmin()` guards every action (existing pattern).

## Testing

- Unit tests (extend `app/admin/orders/__tests__/actions.test.ts` and
  `app/_lib/payments/__tests__/order-finalization.test.ts`):
  - `bulkConfirm` / `bulkDispatch`: mixed valid/invalid sets, payment guardrail
    (online unpaid skipped, COD allowed), partial success summary shape.
  - Payment guardrail helper (`canConfirm`): online-paid allowed, online-unpaid blocked,
    COD allowed.
  - `finalizePaidPayment` no longer calls `bookCourierAndNotify`; confirmation email
    still sent; status stays `PENDING`.
- Manual verification (per CLAUDE.md): `npm run build`, then a manual
  confirm → dispatch → deliver pass over a test order, plus a bulk confirm over the
  pending-COD tab.

## Out of scope (YAGNI)

- New status values, refund automation, COD auto-confirm.
- Redesign or reordering of the order detail page.
- Backfill/migration of historical orders.
