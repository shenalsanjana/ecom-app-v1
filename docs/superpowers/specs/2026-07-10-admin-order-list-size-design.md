# Admin Orders List — Show T-Shirt Size

**Date:** 2026-07-10
**Status:** Approved design — ready for implementation plan
**Area:** Admin · Orders list (`/admin/orders`, ITEMS column)
**Process:** Lightweight — design + plan only; implementation dispatched directly to a
subagent (no `openspec/changes/` proposal, no dedicated worktree). Justified by scope:
one Prisma `select` field, one formatter, one type.

## Problem

The admin Orders list (`OrdersTable`) renders each line item as `"{name} - {color}
x{quantity}"` (e.g. `Oversize bear T-shirt - Black x1`), via
`formatOrderItemLine` in `app/_lib/order-item-display.ts`. `OrderItem.size` already
exists in the schema and is populated at checkout, but `listOrders()` never selects it
and the formatter never renders it — so admins packing/dispatching orders can't see
size from the list and must open each order's detail page to find it.

## Decision

Add size to the existing item line, positioned right before the quantity (closest to
what a packer needs): `"{name} - {color} - {size} x{quantity}"`, e.g.
`Oversize bear T-shirt - Black - M x1`. A missing/blank size falls back to `—`, mirroring
the existing color fallback — same rule, same reasoning (admin views always show the
slot; customer-facing copy is the one that omits missing attributes).

Scope is intentionally just this list:
- The order detail page (`/admin/orders/[id]`) already shows size via
  `OrderItemsEditor`, driven by `getOrderDetail()` — untouched.
- SMS (`app/_lib/sms.ts`) and email (`app/_lib/mailer.ts`) item summaries use a separate
  character-budget truncation formatter for color; adding size there is a materially
  bigger change (truncation budget math) and out of scope here.

## Changes

1. **`app/_lib/admin-orders.ts` — `listOrders()`**: add `size: true` to the `items`
   select (currently `{ id, name, color, quantity }`). No migration — the column
   already exists.
2. **`app/_lib/order-item-display.ts`**: extend `OrderItemSummaryInput` with
   `size?: string | null`; update `formatOrderItemLine` to render
   `"{name} - {color} - {size} x{quantity}"` with the same trim-and-em-dash fallback
   logic already used for `color`.
3. **`app/_components/admin/orders/orders-table.tsx`**: extend the `Row.items` element
   type with `size: string | null` so it matches the new select shape passed through
   from `listOrders()`.

## Error handling

None new — `size` follows the exact null-safety pattern `color` already has. No new
failure modes are introduced.

## Testing

- **Unit (`app/_lib/__tests__/order-item-display.test.ts`)**: add cases mirroring the
  existing color tests — size present, size `null`, size undefined, size
  blank/whitespace — each asserting the `- {size}` segment (or `- —`) lands before
  `x{quantity}`.
- **Build:** `npm run build` (catches the `Row` type change and the new select field).
- **Manual smoke:** load `/admin/orders`, confirm each visible row's ITEMS column shows
  `Name - Color - Size xQty` and that an item with no size shows `—` in that slot.

## Out of scope (YAGNI)

- SMS / email item-summary formatting.
- Order detail page (already shows size).
- Any change to how size is captured, stored, or edited (`OrderItemsEditor`,
  `applyItemChanges`) — this is display-only.
