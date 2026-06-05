# Admin Orders — Clearer Filters, Bulk Cancel, Delete Cancelled

**Date:** 2026-06-05
**Status:** Approved (design)
**Area:** `app/admin/orders`, `app/_components/admin/orders`, `app/_lib/admin-orders.ts`

## Why

The admin Orders page filtering is confusing. The root cause is structural, not
cosmetic: **two controls write to the same `status` dimension** — the Status
dropdown (PENDING/CONFIRMED/DELIVERED/CANCELLED) and the tab pills
(Needs dispatch / Delivered / Cancelled). `buildOrderWhere` lets the dropdown
silently override the tab preset ([admin-orders.ts:38-43](../../../app/_lib/admin-orders.ts)),
while the clicked tab pill stays visually highlighted — so the UI shows one state
and the query runs another.

Two operational gaps also exist:
- No way to **cancel orders in bulk** (only Confirm/Dispatch are bulk actions).
- No way to **delete** orders — cancelled records accumulate with no removal path.

## Goals

1. One source of truth per filter dimension; the active state is always honest.
2. Bulk cancel from the orders table.
3. Delete (permanent) for cancelled orders, row-level and bulk.

## Non-Goals

- No schema migration (hard delete relies on existing cascade).
- No soft-delete / archive flag.
- No "Dispatched / awaiting delivery" tab (possible future addition).
- No change to single-order confirm/dispatch/edit flows.

## Design

### 1. Filters — tabs are the single status control

**Remove the Status `<select>`** from `orders-toolbar.tsx`. Keep the Payment
dropdown, Sort dropdown, and Search box. Tabs become the only status filter.

Removing the dropdown removes the only path to **PENDING** orders (new orders
awaiting confirmation), which no tab covers today. So **add a "Pending" tab**.

New tab set (`ORDER_TABS` in `admin-orders.ts`):

```
all | pending | needs-dispatch | pending-cod | delivered | cancelled
```

| Tab            | Condition                                  |
|----------------|--------------------------------------------|
| All            | (no filter)                                |
| Pending        | `status = PENDING`                         |
| Needs dispatch | `status = CONFIRMED` AND `courierBookedAt = null` |
| Pending COD    | `paymentStatus = COD_PENDING`              |
| Delivered      | `status = DELIVERED`                        |
| Cancelled      | `status = CANCELLED`                        |

`buildOrderWhere` changes:
- Add `case "pending": where.status = "PENDING";`.
- **Delete the `if (params.status) { ... delete where.courierBookedAt; }` block**
  — there is no more `status` query param, so the incoherent-query workaround is
  no longer needed.
- Keep the payment override (`if (params.payment) where.paymentStatus = ...`).
  The Pending COD tab and the Payment dropdown both touch `paymentStatus`; if the
  Payment dropdown is set it wins. This residual overlap is acceptable (far milder
  than the status overlap) and the Pending COD tab is kept as a convenience view.

`ListParams` drops the `status` field. `page.tsx` drops `status: sp.status` from
the `listOrders` call. The per-tab count loop already iterates `ORDER_TABS`, so the
new Pending tab gets a count automatically (one extra `count` query).

### 2. Bulk cancel

New server action in `app/admin/orders/actions.ts`, mirroring `bulkConfirm`:

```ts
export async function bulkCancel(ids: string[]): Promise<BulkResult>
```

- `requireAdmin()`.
- Per id: load order with `items`. Skip (ok:false) if not found, already
  CANCELLED, or DELIVERED. Otherwise run the **same transaction as `cancelOrder`**:
  restore stock for each item (`increment`), then set `status = CANCELLED`.
- Return `summarize(results)`.
- `revalidatePath` for the list and each cancelled order.

To avoid divergence, factor `cancelOrder`'s core into a shared helper (e.g.
`cancelOrderTx(tx, order)`) used by both `cancelOrder` and `bulkCancel`.

**Client (`orders-table.tsx`):** add a **"Cancel selected"** button to the bulk
bar with a confirm. The client already has each row's `paymentStatus`, so it
computes how many selected orders were paid (`PAID` / `COD_COLLECTED`) and, after
a successful run, shows a warning toast: *"N were paid — handle refunds manually."*
This reuses the existing unpaid-warning pattern (`confirmSelected`,
[orders-table.tsx:49-51](../../../app/_components/admin/orders/orders-table.tsx)) —
no change to the action signature.

### 3. Delete cancelled orders (hard delete)

New server actions in `actions.ts`:

```ts
export async function deleteOrder(orderId: string): Promise<ActionResult>
export async function bulkDelete(ids: string[]): Promise<BulkResult>
```

- `deleteOrder`: `requireAdmin()`, load order, **reject unless
  `status === "CANCELLED"`** (`{ success:false, error:"Only cancelled orders can be deleted" }`),
  then `prisma.order.delete({ where: { id } })`. `OrderItem` and `OrderNote` have
  `onDelete: Cascade` (schema confirmed), so they are removed automatically.
- **No stock changes.** Cancelling already restored stock; touching it here would
  double-restore. (Explicit guard in the design to prevent a copy-from-cancel bug.)
- `bulkDelete`: mirror `bulkConfirm` shape; each id must be CANCELLED or it is
  skipped (`ok:false, error:"Not cancelled"`); delete; `summarize`.
- `revalidatePath("/admin/orders")` after.

**UI:**
- **Row-level Delete** (`row-actions.tsx`): when `status === "CANCELLED"`, render a
  destructive "Delete" button with a confirm ("Permanently delete this cancelled
  order? This cannot be undone."). Calls `deleteOrder`.
- **Bulk "Delete selected"** (`orders-table.tsx`): rendered only when *every*
  selected order is CANCELLED. Confirm, then `bulkDelete`.

## Data flow (unchanged shape)

`page.tsx` (server) → `listOrders` / `buildOrderWhere` → table rows.
Toolbar/table (client) → server actions → `revalidatePath` → re-render.

## Error handling

- All new actions go through `requireAdmin()`.
- Eligibility checks return typed errors; bulk variants record per-item failures
  and report `okCount` / `skippedCount`.
- DB failures caught and returned as a generic retry message, matching existing
  actions.

## Testing

Add to `app/admin/orders/__tests__/actions.test.ts`:
- `bulkCancel`: cancels eligible orders, skips DELIVERED and already-CANCELLED,
  restores stock for cancelled ones.
- `deleteOrder`: deletes a CANCELLED order; rejects PENDING/CONFIRMED/DELIVERED;
  does **not** modify stock.
- `bulkDelete`: deletes all-CANCELLED selection; skips non-cancelled.
- `buildOrderWhere`: `pending` tab → `status = PENDING`; confirm no `status` param
  branch remains.

Validation: `npm run build` before merge (CLAUDE.md §2).

## Files touched

- `app/_lib/admin-orders.ts` — `ORDER_TABS`, `buildOrderWhere`, `ListParams`.
- `app/admin/orders/page.tsx` — drop `status` param.
- `app/_components/admin/orders/orders-toolbar.tsx` — remove Status select, add Pending tab label.
- `app/_components/admin/orders/orders-table.tsx` — Cancel selected, Delete selected, paid warning.
- `app/_components/admin/orders/row-actions.tsx` — row Delete on cancelled.
- `app/admin/orders/actions.ts` — `bulkCancel`, `deleteOrder`, `bulkDelete`, shared cancel helper.
- `app/admin/orders/__tests__/actions.test.ts` — new tests.
