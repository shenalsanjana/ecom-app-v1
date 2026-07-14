# Admin Order Editing — Custom Charges, Discounts, Add/Swap Product

**Date:** 2026-07-14
**Status:** Approved design

## Problem

The admin order detail page (`/admin/orders/[id]`) already lets an admin edit an
existing line's quantity/size, edit the shipping address, and edit tracking — via
`OrderItemsEditor`, `AddressEditor`, `TrackingEditor` (`app/_components/admin/orders/`)
backed by server actions in `app/admin/orders/actions.ts`. There is no way to:

- Add an arbitrary custom charge (e.g. a rush fee, a custom-embroidery surcharge) or a
  discount to an order.
- Add a brand new product line to an existing order (e.g. a phone order where the
  customer adds an item after checkout).
- Swap what product/color/size an existing line points to, without deleting and
  re-adding it as an unrelated new line.

This is a real gap for phone/manual order handling, which the store does regularly
(COD is a first-class payment method here).

## Decisions (resolved during brainstorming)

1. **Unified adjustments list**, not flat discount/charge fields. Each adjustment is a
   custom label + signed amount (positive = charge, negative = discount), stored as its
   own row. An order can carry any number of charges and discounts, each independently
   removable. This matches "customized chargers" (plural, arbitrary) better than a
   single flat field per type.
2. **Adjustments are customer-visible.** They render as extra line items in the order
   confirmation email (text + HTML), between the item list and the
   Subtotal/Delivery/Total block. `Order.total` — which is also the exact amount handed
   to Curfox as the COD-collectable amount (`book-courier.ts`) — always reflects them.
   Silently baking them into `total` with no itemization was rejected as untrustworthy
   for a customer-facing total.
3. **Swap is a first-class action**, not "remove + add achieves the same thing."
   Existing lines get a "change product" action (new product + color + size, quantity
   carried over) in addition to the new "add product" action, so an admin corrects a
   miskeyed phone order without losing the line's identity/history.
4. **Added/swapped items are catalog-priced**, not admin-priced. Price is always the
   variant/product snapshot, exactly like checkout. If the admin needs a different
   effective price, that's what the adjustments mechanism is for — keeping "this is a
   catalog item at catalog price" and "this is a manual price correction" unambiguous
   instead of one field doing both jobs.
5. **Adjustments/add/swap only apply from the product catalog** ("add another product
   from products" — the user's own phrasing). No free-text/custom line items; custom
   *charges* already cover anything that isn't a real catalog product.
6. **All order-editing actions now block once `courierBookedAt` is set** — extending the
   guard `AddressEditor` already has ("Address already sent to Curfox — cancel/rebook
   there.") to `editItems`, and to the three new actions below. Today `editItems` has no
   such guard, which is a latent bug (editing quantities after Curfox has the parcel's
   declared value/weight desyncs the two systems); this change closes it everywhere
   rather than adding three more actions with the same hole.

## Data model

New table, same shape/relation pattern as the existing `OrderNote`:

```prisma
model OrderAdjustment {
  id        String   @id @default(cuid())
  orderId   String
  label     String
  amount    Float    // signed: positive = charge, negative = discount
  createdAt DateTime @default(now())

  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}
```

`Order` gains `adjustments OrderAdjustment[]`.

Migration: new folder under `prisma/migrations/`, hand-authored per the project's "no
local database" convention (`prisma migrate dev` can't run here) — a single `CREATE
TABLE` + FK + index, no data backfill needed since this is a purely additive table.

## Totals

`recomputeTotals` (`app/_lib/admin-orders.ts`) gains an `adjustments` parameter:

```ts
export function recomputeTotals(
  items: { price: number; quantity: number }[],
  city: string,
  config: DeliveryConfig,
  adjustments: { amount: number }[] = [],
): { subtotal: number; shippingCost: number; total: number }
```

`total = max(0, subtotal + shippingCost + sum(adjustments.amount))`. The clamp means a
discount can never push an order negative. All four existing/new call sites
(`editAddress`, `editItems`, and the three new actions below) pass the order's current
adjustment rows.

## Server actions (`app/admin/orders/actions.ts`)

All follow the existing `requireAdmin()` → validate → `canEdit(order)` →
`courierBookedAt` guard → mutate-in-transaction → `recomputeTotals` → revalidate →
"paid order, settle manually" warning pattern already used by `editItems`.

- **`addAdjustment(orderId, { label, amount, kind: "CHARGE" | "DISCOUNT" })`** — server
  negates `amount` when `kind === "DISCOUNT"`; creates the row; recomputes totals.
- **`removeAdjustment(orderId, adjustmentId)`** — deletes the row; recomputes totals.
- **`addOrderItem(orderId, { productId, variantId, size, quantity })`** — resolves
  name/color/sku/price from the product+variant exactly like `app/checkout/actions.ts`
  does, resolves `plainTshirtStockId` (by variant `colorSlug` + `size`) and
  `dtfDesignId` (from `product.dtfDesignId`), runs the acquire through the existing
  `acquireItemPools` guarded-decrement (so it's blocked by real stock like every other
  stock-affecting path), creates the `OrderItem`, recomputes totals.
- **`swapOrderItem(orderId, itemId, { productId, variantId, size, quantity })`** —
  restores the existing line's pools (`restoreItemPools`), then resolves the new pools
  from the **new** variant's `colorSlug` + chosen `size` and the **new** product's
  `dtfDesignId` — i.e. the same fresh-resolution path `addOrderItem`/checkout use, not
  the existing `resolveNewPlainPool` helper (which intentionally freezes on the *old*
  pool's colorSlug for same-color size-only edits and doesn't apply here since the color
  itself may be changing). Acquires the new pools, updates the same `OrderItem` row in
  place (id preserved) with the new product/variant/color/sku/name/size/price/pool ids
  and quantity, recomputes totals.

A shared read-only helper, **`searchProductsForOrder(q: string)`**, backs both pickers:
non-archived products matching `q` by name (reuses the `contains`/`insensitive` pattern
from `buildOrderWhere`), each with its non-archived variants (id, color, colorSlug,
price) and each variant's offered sizes (`sizeStocks`). Capped at ~20 results.

## Admin UI

- **New "Adjustments" panel** on `/admin/orders/[id]`, same card styling as the
  Payment/Customer panels. Lists existing adjustments (label, signed amount, remove
  button when editable). When `canEditOrder`, an inline form: Charge/Discount toggle +
  label text + positive amount input + Add button (mirrors the plain-Tailwind, no-UI-kit
  style `OrderItemsEditor`/`AddressEditor` already use — this codebase doesn't use a
  component-library combobox anywhere, so the product picker below follows the same
  plain-HTML-controls convention).
- **`OrderItemsEditor` extended**: each existing row gets a "Change product" toggle
  (only when editable) that reveals the product/variant/size picker in place of that
  row, defaulting quantity to the row's current quantity. Below the item list, an
  "Add product" disclosure with the same picker, empty quantity defaulting to 1.
- **Picker shape** (shared by add and swap): text input (debounced search via
  `searchProductsForOrder`) → results list → click a product to reveal its variant
  (color) select → size select (from that variant's `sizeStocks`) → quantity number
  input → confirm button. No stock-quantity number is shown in the picker itself (the
  server enforces it); an insufficient-stock error surfaces the same
  `"Insufficient stock for \"X\""` message `acquireItemPools` already throws.
- The Subtotal/Shipping/Total block at the bottom of the items card gains an
  Adjustments line (only rendered when there's at least one row) between Shipping and
  Total.

## Customer-facing changes

`OrderDetails` (`app/_lib/mailer.ts`) gains `adjustments?: { label: string; amount:
number }[]`. Text and HTML confirmation templates render each as its own line ("Rush
fee: +Rs 500", "Loyalty discount: −Rs 200") between the item list and the
Subtotal/Delivery/Total block. `toOrderDetails()` in `admin/orders/actions.ts` maps the
order's `adjustments` relation through. No new customer-facing page is needed — this
app has no live account/order-detail page; the confirmation email (sendable on demand
via the existing `resendConfirmationEmail` admin action) is the only customer touchpoint
for order totals, so it's the only template that needs updating. SMS templates only ever
carry the bare total, not an itemized breakdown, and are unaffected.

## Validation & error handling

- `canEdit(order)` (not DELIVERED/CANCELLED) gates every action here, same as today.
- New guard: every action here (plus `editItems`, closing its existing gap) additionally
  rejects with `"Order already sent to Curfox — cancel/rebook there to make changes."`
  once `order.courierBookedAt` is set.
- Adjustment `amount` must be a finite positive number before sign is applied; label
  trimmed, 1–80 chars (zod schema, mirrors `NoteSchema`'s shape).
- `addOrderItem`/`swapOrderItem` quantity must be a positive integer.
- Insufficient stock surfaces `acquireItemPools`'s existing error message verbatim —
  no new error copy invented for that case.
- Total floor at 0, as above.
- Paid orders (`PAID`/`COD_COLLECTED`) keep the existing "warning: settle manually"
  return shape on any action that changes `total`.

## Testing

- **Unit (`app/_lib/__tests__/admin-orders.test.ts`)**: `recomputeTotals` with
  adjustments (charge only, discount only, mixed, discount exceeding subtotal+shipping
  → clamps to 0).
- **Unit (`app/admin/orders/__tests__/actions.test.ts`)**: `addAdjustment` /
  `removeAdjustment` (sign flip on kind, totals recompute, courier-booked rejection,
  canEdit rejection); `addOrderItem` (pool resolution + acquire, insufficient-stock
  rejection, courier-booked rejection); `swapOrderItem` (restore-old + acquire-new,
  row id preserved, insufficient-stock leaves original line untouched via transaction
  rollback); `editItems` gains courier-booked-rejection cases.
- **Unit (`app/_lib/__tests__/mailer.test.ts`)**: confirmation email includes an
  adjustments section when present, omits it when empty, correct sign formatting.
- **Build:** `npm run build` (new Prisma types, new action signatures, new components).
- **Manual smoke:** on a PENDING order, add a charge and a discount and confirm the
  total updates; add a new product and confirm stock decrements; swap an existing line's
  color/size and confirm old stock is restored and new stock is acquired; book the order
  with Curfox (or set `courierBookedAt` in a test order) and confirm all five actions now
  reject; resend the confirmation email and confirm adjustments render correctly.

## Out of scope (YAGNI)

- Percentage-based discounts (flat amount only, matching the approved data-model
  choice).
- Free-text/non-catalog line items (adjustments already cover non-catalog charges).
- A live customer account/order-detail page (doesn't exist today; not being added).
- Editing an added/swapped item's price independently of the catalog (use an
  adjustment instead).
- Auto-sending a new confirmation email on every edit — the existing manual "Resend
  confirmation email" action is the mechanism, unchanged.
