# Admin Orders — Confirm Friction & Action Feedback

**Date:** 2026-06-04
**Status:** Approved design — ready for implementation plan
**Area:** Admin · Orders (`/admin/orders` list + `/admin/orders/[id]` detail)
**Builds on:** `2026-06-04-admin-orders-manual-lifecycle-design.md` (merged via PR #6)

## Problem

The manual order lifecycle (Confirm → Dispatch → Mark delivered, filters, search,
counts, bulk actions) shipped and works, but day-to-day order management still feels
broken for two concrete reasons:

1. **Confirm is dead for most of the list.** The admin's orders are mostly `PENDING`
   online orders (KOKO/MINTPAY/PAYHERE) marked "Awaiting payment". The payment guardrail
   greys out (disables) the Confirm button for any non-COD order whose
   `paymentStatus !== "PAID"` (`row-actions.tsx`), and the server `advanceStatus` hard-
   blocks the same transition. So most rows show a dead, greyed-out Confirm button —
   which reads as "confirm doesn't work."
2. **Crude feedback.** Every admin action reports success/error with a blocking
   `alert()` and gates destructive actions with `window.confirm()`. There is no real
   loading state beyond a `disabled` attribute, and no toast/inline success or error
   surface.

The remaining requirements (cancelled orders hide Confirm; failed payments stay
cancelled; filters; search; count chips; double-click protection) are already satisfied
by the merged implementation and need verification only, not a rebuild.

## Decisions (from brainstorming)

- **Unpaid online orders:** allow confirm, but **warn first** ("not paid yet — confirm
  anyway?"). The admin takes responsibility (payment settled out-of-band, or will be
  chased).
- **Feedback (req 9):** add **`sonner`** toasts (success/error) + **button spinners**;
  drop the `alert()` success/error popups.
- **D1 — confirmation gate mechanism:** use **`window.confirm()`** for the two yes/no
  gates (unpaid-online warning, cancel-order). Keeps scope tight and avoids a second UI
  dependency. A polished `AlertDialog` is a future swap, explicitly out of scope here.
- **D2 — bulk confirm with unpaid online selected:** **prompt-and-force** — if the
  selection includes unpaid online orders, warn once, then confirm them with
  `allowUnpaid: true`. Consistent with the single-row decision.

## Server changes — opt-in override (default stays safe)

The server remains the source of truth; it never silently confirms an unpaid online
order. An explicit, opt-in flag enables the warned path.

### `advanceStatus` (`app/admin/orders/actions.ts`)
New signature: `advanceStatus(orderId: string, to: string, opts?: { allowUnpaid?: boolean })`.

- The transition validity check (`nextStatuses`) is unchanged.
- The payment guard becomes: when `to === "CONFIRMED" && !canConfirm(order)`, return the
  existing `"Awaiting payment — confirm online orders only after payment."` error
  **unless** `opts?.allowUnpaid === true`, in which case the confirm proceeds.
- All other transitions (e.g. `CONFIRMED → DELIVERED`) are unaffected; `allowUnpaid`
  only relaxes the unpaid-online confirm gate.

### `bulkConfirm` (`app/admin/orders/actions.ts`)
New signature: `bulkConfirm(ids: string[], opts?: { allowUnpaid?: boolean })`.

- Per-order rules unchanged except: an unpaid online order
  (`!canConfirm(order)`) is **skipped with `"Awaiting payment"`** when `allowUnpaid` is
  falsy (current behavior), and **confirmed** when `allowUnpaid === true`.
- `status !== "PENDING"` skips ("Already confirmed" / `Cannot confirm (STATUS)`) are
  unchanged. Result shape (`BulkResult`) is unchanged.

`canConfirm` itself is unchanged — it stays the definition of "safe to confirm without a
warning"; the override is layered on top by callers.

## Client changes

### `RowActions` (`app/_components/admin/orders/row-actions.tsx`)
- **Confirm enabled for unpaid online.** Remove `unpaidOnline` from the button's
  `disabled` (keep `disabled={pending}`). Keep deriving `unpaidOnline` to decide whether
  to warn.
- **Warn before confirming unpaid online.** On Confirm click:
  - if `unpaidOnline`: `window.confirm("This order isn't paid yet. Confirm and prepare
    to dispatch anyway?")`; if accepted → `advanceStatus(orderId, "CONFIRMED",
    { allowUnpaid: true })`; if declined → no-op.
  - else → `advanceStatus(orderId, "CONFIRMED")`.
- **Toasts + spinner.** Replace the `run` helper's `alert(...)` with
  `toast.success(message)` on success (use `r.warning ?? "Done"`) and `toast.error(r.error)`
  on failure. While `pending`, render a small inline spinner inside the active button
  (e.g. a `<Spinner/>` glyph + the label) and keep the button disabled. Keep
  `router.refresh()` after the action resolves so the row, dispatch column, and chip
  counts update without a manual page refresh.
- **Cancel** keeps its `window.confirm("Cancel this order and restore stock?")` gate.

### `OrderActions` (detail page, `app/_components/admin/orders/order-actions.tsx`)
Apply the same treatment for consistency: toasts + spinner; the "Mark confirmed" button
is enabled for unpaid online and routes through the same warn → `allowUnpaid: true` path;
`alert()` calls replaced by toasts.

### `OrdersTable` bulk bar (`app/_components/admin/orders/orders-table.tsx`)
- `runBulk` reports via toast instead of `alert` (e.g.
  `toast.success("7 confirmed, 2 skipped")`; `toast.error` when `okCount === 0`).
- **Bulk confirm warn-once:** before calling `bulkConfirm`, compute whether any selected
  row is unpaid online (the table already has each row's `paymentMethod`/`paymentStatus`).
  - If **none** are unpaid online → `bulkConfirm(ids)` directly.
  - If **some** are unpaid online → `window.confirm("N of these aren't paid — confirm
    anyway?")`. **Accept** → `bulkConfirm(ids, { allowUnpaid: true })` (force all).
    **Decline** → abort the whole bulk action (do nothing), so there is no partial
    surprise.
- Bulk "Dispatch selected" is unchanged.

### Toast infrastructure
- Add `sonner` as a dependency.
- Mount `<Toaster richColors position="top-right" />` in **`app/admin/layout.tsx`** so
  toasts are scoped to the admin area, not the storefront.
- A tiny module (e.g. `app/_components/admin/orders/use-action-runner.ts` or an inline
  helper) centralizes the `run` pattern (pending + toast + refresh) so `RowActions` and
  `OrderActions` don't duplicate it. Keep it minimal; do not over-abstract.

## Requirements already satisfied — verify, don't rebuild

| Req | Status | Mechanism |
| --- | --- | --- |
| 3 — cancelled hide Confirm | works | `terminal` branch renders waybill/`—`, no Confirm |
| 4 — failed payments stay cancelled | works | `finalizeFailedPayment` sets `CANCELLED` |
| 6 — filters (all/needs-dispatch/pending-cod/delivered/cancelled, status, payment, sort) | works | `buildOrderWhere` + `OrdersToolbar` |
| 7 — search by order#/name/phone/email | works | `buildOrderWhere` OR clause |
| 8 — chip counts update after actions | works | server-computed counts + `router.refresh()` / `revalidatePath` |
| 10 — no double-click duplicates | works | `useTransition` disables button; server re-checks the status transition |

The manual smoke test (below) confirms these still hold after the feedback changes.

## Error handling

- Server actions remain authoritative: a stale client cannot force an illegal
  transition; the action re-reads the order and returns a structured error surfaced as a
  toast.
- `allowUnpaid` only relaxes the unpaid-online confirm gate — it never bypasses the
  `nextStatuses` transition rules, the `requireAdmin` guard, or the dispatch
  precondition (`CONFIRMED && !courierBookedAt`).

## Testing

- **Unit (`app/admin/orders/__tests__/actions.test.ts`):**
  - `advanceStatus`: unpaid online → CONFIRMED is blocked **without** `allowUnpaid` (existing
    test stays) and **succeeds with** `{ allowUnpaid: true }`; COD and paid online paths
    unchanged; non-CONFIRMED transitions ignore the flag.
  - `bulkConfirm`: with `{ allowUnpaid: true }` an unpaid online order is confirmed (not
    skipped); without it, the existing skip behavior holds.
- **Build:** `npm run build` (catches the new signatures, sonner import, Toaster mount).
- **Manual smoke (per CLAUDE.md validation):** confirm an unpaid online order via the
  warning; confirm a COD order with no warning; dispatch; mark delivered; cancel; bulk
  confirm a mixed selection; toggle each filter tab and the status/payment/sort selects;
  search by order#/name/phone/email; verify chip counts and the row update with no manual
  refresh; verify toasts + button spinners appear and the buttons block double-clicks.

## Out of scope (YAGNI)

- A custom `AlertDialog` (D1 keeps `window.confirm`).
- Table/pagination redesign, new filters, or column changes.
- Changes to the COD/online auto-booking policy (settled in the prior spec).
- Refactoring `buildOrderWhere` / `OrdersToolbar`.
