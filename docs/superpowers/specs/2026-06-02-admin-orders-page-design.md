# Admin Orders Page — Design

**Date:** 2026-06-02
**Spec #:** 3 of 9 (Dressing Bear admin dashboard)
**Status:** Draft — pending implementation plan
**Depends on:** Spec #1 (admin roles & route protection) and Spec #2 (admin UI shell), both shipped.

---

## 1. Goal

Build the **Orders** admin page at `/admin/orders` (list) and `/admin/orders/[id]` (detail) — the operator's daily order-management surface. It lets an admin find orders, dispatch them (Curfox), advance status, collect COD, edit contents/address, cancel, resend the customer confirmation (with waybill), and print the Curfox delivery label.

The "Needs dispatch" list view is the same set behind the dashboard's "Pending dispatch" KPI, so the operator drills dashboard → filtered list → order.

## 2. Non-goals

- **Refunds / payment capture-adjustment.** Editing or cancelling a paid order does **not** move money. Any delta is handled manually with the customer; we only warn.
- **Manual order creation** from the admin.
- **Adding brand-new products** to an existing order (only modify/remove existing line items). Avoids a product-picker UI.
- **Custom packing slip.** Printing uses the Curfox merchant portal (Curfox owns the delivery label). `fetchCurfoxWaybillPdf` was intentionally removed — no server-side PDF.
- **Products / Customers / Settings pages** — specs #4–#6.
- **Bulk actions** (multi-select dispatch/cancel) — defer.
- **Full audit log.** Internal notes (below) are append-only but are not a complete action audit; full audit stays deferred (spec #1 §8).

## 3. Constraints from the existing codebase

- **Next.js 16 App Router.** `app/admin/layout.tsx` already provides chrome + `requireAdmin()`. New pages render inside it.
- **Server vs Client (CLAUDE.md §3):** pages and data fetches are Server Components; interactive bits (edit mode, qty steppers, confirm dialogs, dropdowns, toasts) are leaf `"use client"` components. Never render an `async` Server Component inside a client component.
- **Auth:** every Server Action calls `requireAdmin()` (defense-in-depth on top of the layout guard and the `proxy.ts` edge gate).
- **Prisma + Postgres, `connection_limit=2`** (`app/_lib/prisma.ts`). List queries must stay light: one `count` + one paginated `findMany` with `take/skip`, no N+1. Add indexes (see §7).
- **Reuse existing flows — do NOT duplicate:**
  - Courier booking: `bookCourierAndNotify` (`app/checkout/book-courier.ts`) — books Curfox, captures `courierWaybillNumber`, sends the brand dispatch email. Never throws; records `courierLastError`.
  - Customer email: `sendOrderConfirmationEmail` (`app/_lib/mailer.ts`) — already includes the tracking code when present.
  - Status/payment enums: `app/_lib/order-status.ts` (`PAYMENT_STATUSES`).
  - Delivery recompute: `calculateDelivery` + `zoneForCity` (`app/_lib/checkout-config.ts`, `delivery-zones.ts`).
  - Atomic stock decrement pattern: `app/checkout/actions.ts` (`updateMany` with `stock: { gte }` guard inside `$transaction`).
  - Curfox portal URL: currently hardcoded in `mailer.ts` (`https://royalexpress.merchant.curfox.com/all-orders`). Extract to a shared constant `CURFOX_PORTAL_URL` and reuse in both places.
- **Light-only design system**, boutique palette, shadcn primitives in `components/ui/`. Needed primitives not yet installed: `table`, `dialog`, `select`, `textarea`, `badge` — add via `npx shadcn add table dialog select textarea badge` (one-time).
- **`Order` model fields of interest:** `status` (`PENDING|CONFIRMED|DELIVERED|CANCELLED`), `paymentStatus` (`PENDING|PAID|PAYMENT_FAILED|COD_PENDING|COD_COLLECTED`), `courierWaybillNumber`, `courierBookedAt`, `trackingCode`, `webNumber`, `rbNumber`, `notes` (customer note — **not** reused for admin notes), `subtotal/shippingCost/total`, `items[]`.

## 4. Design

### 4.1 Routes & file map

| File | Type | Responsibility |
|------|------|----------------|
| `app/admin/orders/page.tsx` | Server | Read `searchParams` (`q,tab,status,payment,sort,page`), call `listOrders()`, render toolbar + tabs + table + pagination |
| `app/admin/orders/loading.tsx` | Server | Skeleton table |
| `app/admin/orders/[id]/page.tsx` | Server | `getOrderDetail(id)` (404 if missing), render detail layout |
| `app/admin/orders/[id]/not-found.tsx` | Server | "Order not found" |
| `app/admin/orders/actions.ts` | `"use server"` | All mutations; each calls `requireAdmin()` + `revalidatePath` |
| `app/_lib/admin-orders.ts` | server module | `listOrders()`, `getOrderDetail()`, and **pure** helpers (see §4.7) — query/where builders, totals recompute, transition rules |
| `app/_components/admin/orders/orders-table.tsx` | Server | Renders rows (presentational) |
| `app/_components/admin/orders/orders-toolbar.tsx` | `"use client"` | Search input + Status/Payment/Sort selects + tabs; pushes to URL via `useRouter`/`searchParams` |
| `app/_components/admin/orders/order-actions.tsx` | `"use client"` | Dispatch / advance-status / mark-COD / resend / print buttons + confirm `Dialog`s; calls actions |
| `app/_components/admin/orders/order-items-editor.tsx` | `"use client"` | Edit mode: qty stepper, size select, remove; submits to `editItems` |
| `app/_components/admin/orders/address-editor.tsx` | `"use client"` | Edit shipping address; submits to `editAddress` |
| `app/_components/admin/orders/order-notes.tsx` | `"use client"` | Append-only note list + add-note form |
| `app/_lib/__tests__/admin-orders.test.ts` | unit | Pure helpers + query shapes (mock prisma) |
| `app/admin/orders/__tests__/actions.test.ts` | unit | Action guards, stock/totals, cancel restore, resend email |
| `tests/e2e/admin-orders.spec.ts` | e2e | List filter, row→detail, dispatch, edit, cancel, resend, print-link gating |

### 4.2 Data model change — internal notes

There is no internal-notes storage today (`Order.notes` is the customer's checkout note). Add an append-only table:

```prisma
model OrderNote {
  id          String   @id @default(cuid())
  orderId     String
  authorEmail String                       // admin who wrote it (from session)
  body        String
  createdAt   DateTime @default(now())
  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@index([orderId])
}
```

Add the reverse relation `notesLog OrderNote[]` to `Order`. One Prisma migration.

### 4.3 List page

- **Toolbar:** single search box (`q` — matches `webNumber`, `rbNumber`, customer name, phone, email), plus `Status`, `Payment`, and `Sort` selects. All state lives in the URL.
- **Quick-filter tabs** (presets layered on top of the dropdowns), each with a count:
  - **All**
  - **Needs dispatch** — `status = CONFIRMED AND courierBookedAt = null` (matches the dashboard KPI; default tab when arriving from the KPI)
  - **Pending COD** — `paymentStatus = COD_PENDING`
  - **Delivered** — `status = DELIVERED`
  - **Cancelled** — `status = CANCELLED`
- **Columns:** Order # (`webNumber`) · Date (SLT, via `startOfTodaySLT`-style formatting) · Customer (name + phone) · Items (count) · Total · Payment (chip + method) · Status (chip) · Dispatch (inline **Book courier** button when needed; waybill text once booked).
- **Inline "Book courier"** is the only list-level mutation (high-frequency). Row click → detail.
- **Pagination:** server-side, 25/page default, `?page=`. `listOrders` returns `{ rows, total }`.

### 4.4 Detail page

Two-column layout (stacks on mobile):

- **Header:** back link, `webNumber`, status + payment chips, date; right side: **Edit**, **Print label (Curfox)** (gated, §4.6), **Cancel order** (destructive, confirm dialog).
- **Main:** Items (view, or edit mode with qty/size/remove), Totals, **Internal notes** (append-only).
- **Side:** **Status & dispatch** (Book courier, Advance status, Mark COD collected, Resend confirmation), **Customer**, **Shipping address** (+Edit), **Payment** (method, status, web #, waybill).

### 4.5 Server Actions (`app/admin/orders/actions.ts`)

Each: `requireAdmin()` → validate (zod) → mutate (transaction where needed) → `revalidatePath('/admin/orders')` and `/admin/orders/[id]` → return `{ success: true, ... } | { success: false, error }` (mirrors `processOrder`).

| Action | Behavior | Guards |
|--------|----------|--------|
| `bookCourier(orderId)` | Delegate to `bookCourierAndNotify`; persists `courierWaybillNumber`/`courierBookedAt`/`trackingCode`. Returns booking outcome. | Requires `status=CONFIRMED` and not already booked; `ROYAL_EXPRESS_ENABLED` respected (surface a clear message if disabled). Never throws (existing contract). |
| `advanceStatus(orderId, to)` | Set `status`. Allowed: `PENDING→CONFIRMED` (operator confirms an order — e.g. a COD order, which is created `PENDING` — so it enters the dispatch queue) and `CONFIRMED→DELIVERED`. (`CANCELLED` is via `cancelOrder`.) | Reject illegal transitions via `nextStatuses()` helper. |
| `markCodCollected(orderId)` | `paymentStatus = COD_COLLECTED`. | Only when `paymentMethod=COD` and `paymentStatus=COD_PENDING`. |
| `editItems(orderId, changes)` | In a `$transaction`: apply qty/size changes + removals; restore stock on decrease/removal, decrement (with `stock>=` guard) on increase; recompute `subtotal/shippingCost/total` via `calculateDelivery`+`zoneForCity`; persist. | Reject if order `CANCELLED/DELIVERED`. On a paid order, succeed but include `paymentDelta` warning in the result. Oversell on increase → `{success:false}`. |
| `editAddress(orderId, address)` | Update shipping fields; recompute `shippingCost` if zone changes. | If `courierBookedAt` set → block with message "address already sent to Curfox; cancel/rebook there." |
| `cancelOrder(orderId)` | `$transaction`: `status=CANCELLED`, restore stock for all current items. | Reject if already `CANCELLED` or `DELIVERED` (idempotent). On a paid order, succeed but return `manualRefund: true` warning. |
| `resendConfirmationEmail(orderId)` | Rebuild `OrderDetails` from current row (incl. `trackingCode`/`courierWaybillNumber`) → `sendOrderConfirmationEmail`. | Requires a customer email. Returns whether a tracking code was included. |
| `addNote(orderId, body)` | Insert `OrderNote { authorEmail: session.email, body }`. | Non-empty body (zod, ≤500). |

**Print label** is **not** an action — it's an `<a href={CURFOX_PORTAL_URL} target="_blank" rel="noopener">` rendered only when `courierWaybillNumber` is set; the waybill # is shown beside it so the operator can locate and print it (QR → Default), exactly as the dispatch email instructs.

### 4.6 Print-label gating

- `courierWaybillNumber == null` → button **disabled** with tooltip "Book courier first."
- `courierWaybillNumber != null` → enabled link to `CURFOX_PORTAL_URL`, waybill # displayed.

### 4.7 Pure, unit-testable helpers (in `admin-orders.ts`)

Extract logic out of the actions so it's testable under the project's `node`-environment, `.ts`-only vitest setup:

- `buildOrderWhere({ q, tab, status, payment })` → Prisma `where` object.
- `recomputeTotals(items, city)` → `{ subtotal, shippingCost, total }`.
- `applyItemChanges(currentItems, changes)` → `{ nextItems, stockDeltas }` (positive = restore, negative = decrement).
- `nextStatuses(current)` → allowed transitions (`PENDING→CONFIRMED`, `CONFIRMED→DELIVERED`); `canCancel(order)` (any non-`DELIVERED`/non-`CANCELLED`), `canEdit(order)` (same).

Actions are thin wrappers that call these + prisma.

### 4.8 Data flow

```
List:   /admin/orders?tab=needs-dispatch&page=1
        → page.tsx (server) → listOrders(parsedSearchParams)
        → buildOrderWhere → prisma.count + prisma.findMany(take,skip,include items count)
        → render table + tabs (counts via grouped counts) + pagination

Detail: /admin/orders/[id]
        → page.tsx (server) → getOrderDetail(id) (order + items + product sizes + notesLog)
        → render; client action components call actions.ts
        → action: requireAdmin → validate → (transaction) mutate → revalidatePath → result
        → client shows toast; server component re-renders fresh data
```

### 4.9 Error handling

- Actions return discriminated results; client surfaces them via toast (success) or inline error (failure). No raw exceptions to the operator.
- Stock conflict on qty increase → `{success:false, error:"Only N left of <item>"}`.
- `bookCourier`: reflects `bookCourierAndNotify` outcome; on Curfox failure the existing admin-alert email fires and the action returns a non-fatal "booking failed — see Curfox / retry" message; `courierLastError` is persisted and shown.
- Detail of a missing/whitespace id → `not-found`.
- Route-level `error.tsx` inherited from the admin segment (add an orders-specific one only if needed).

### 4.10 Testing

**Unit (`.ts`, mock prisma):**
- `buildOrderWhere` for each tab/filter combination.
- `recomputeTotals` (zone change crosses free-shipping threshold; rounding).
- `applyItemChanges` (decrease, remove, increase, multi-item; stock deltas).
- `nextStatuses` / `canCancel` / `canEdit` (incl. rejection of DELIVERED/CANCELLED edits).
- Actions: `requireAdmin` rejection; `editItems` recompute+stock; `cancelOrder` restores stock and is idempotent; `markCodCollected` guards non-COD; `resendConfirmationEmail` calls mailer with the tracking code populated; `editAddress` blocked after booking.

**E2E (`tests/e2e/admin-orders.spec.ts`, seeded admin):**
1. List renders; "Needs dispatch" tab filters; search narrows results.
2. Row click → `/admin/orders/[id]`.
3. Book courier (Curfox client mocked) → waybill appears; Print-label link becomes enabled.
4. Edit item qty → totals update; stock adjusts.
5. Cancel order (confirm dialog) → status CANCELLED; paid order shows manual-refund warning.
6. Resend confirmation → success toast.
7. Print-label link disabled before dispatch, enabled (→ Curfox portal) after.

## 5. Rollout plan

1. `npx shadcn add table dialog select textarea badge`.
2. Prisma migration: add `OrderNote` (+ reverse relation) and the list-supporting indexes (§7).
3. Implement on `feat/admin-orders` off `main`.
4. Extract `CURFOX_PORTAL_URL` constant; update `mailer.ts` to use it.
5. Smoke locally as the seeded admin against dev data; verify each action + Curfox booking in sandbox.
6. Deploy: run migration; no new required env vars (Curfox/email already configured).

## 6. Open / deferred decisions

- **Refunds & payment delta** — out; manual. Warnings only.
- **Adding products to an order / manual order creation** — out.
- **Bulk actions** — deferred.
- **Tab counts cost** — counts are extra `COUNT` queries; if the pool (limit 2) strains, compute them lazily or cache. Start simple, measure.
- **Address edit after booking** — blocked for now (Curfox already has it). Could later trigger a rebook flow.

## 7. Risks & mitigations

- **Connection pool (limit 2).** List = `count` + `findMany` (+ up to 4 tab `COUNT`s). Run tab counts in a single `groupBy` where possible; paginate hard. Revisit caching if needed.
- **List performance / unindexed scans.** Add `@@index([status])`, `@@index([paymentStatus])`, and `@@index([status, courierBookedAt])` (needs-dispatch) to `Order`. `createdAt` is already indexed for sort.
- **Concurrent stock on edit.** Reuse the `updateMany` `stock>=` guard inside the transaction; oversell → action error, no partial commit.
- **Paid-order edit/cancel leaves payment untracked.** Explicit UI warnings; documented non-goal. Acceptable per scope.
- **`bookCourier` when `ROYAL_EXPRESS_ENABLED=false`.** Surface a clear disabled-state message instead of a silent no-op.
- **Mobile.** Table collapses to stacked cards < `md`; detail columns stack. Admin is desktop-primary.

## 8. Caveats (carried forward)

- **JWT TTL 30 days** (spec #1 §9): a revoked admin keeps access until token expiry.
- **Pre-existing e2e/lint debt** noted in spec #2 §9 still applies; this spec's own files must pass clean.

## 9. Acceptance criteria

1. `/admin/orders` lists orders with working search, the five quick-filter tabs, status/payment filters, sort, and server-side pagination — all URL-driven.
2. "Needs dispatch" tab returns exactly `status=CONFIRMED & courierBookedAt=null`.
3. Inline "Book courier" books via `bookCourierAndNotify` (requires `status=CONFIRMED`, not already booked) and reflects the outcome.
4. Advance status supports `PENDING→CONFIRMED` and `CONFIRMED→DELIVERED`; illegal transitions are rejected.
5. `/admin/orders/[id]` shows items, totals, customer, address, payment, dispatch, and internal notes; missing id → not-found.
6. Edit mode changes qty/size and removes items; totals recompute and stock adjusts atomically; paid orders show the manual-delta warning; adding products is not possible.
7. Edit address updates fields and recomputes shipping; blocked once courier is booked.
8. Cancel sets CANCELLED, restores stock, is idempotent, blocks on DELIVERED, and warns on paid orders (manual refund).
9. Mark COD collected works only for COD orders pending collection.
10. Resend confirmation re-sends `sendOrderConfirmationEmail`, including the waybill/tracking code when dispatched.
11. Print label is disabled pre-dispatch and links to the Curfox portal (with waybill #) post-dispatch.
12. Internal notes are append-only with author + timestamp.
13. Every Server Action enforces `requireAdmin()`; spec #1 redirect/401/403 invariants still hold.
14. All unit + e2e tests pass; `npm run build`, `tsc --noEmit`, and `npm run lint` are clean for this spec's files.
