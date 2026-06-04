# Admin Orders — Manual Lifecycle & Actionable List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin orders list manage and dispatch orders directly through one consistent, fully-manual lifecycle (Confirm → Dispatch → Mark delivered), with bulk actions and a payment guardrail.

**Architecture:** Reuse the existing per-order server actions (`advanceStatus`, `bookCourier`, `cancelOrder`, `markCodCollected`). Add a `canConfirm` guardrail, two bulk server actions, a per-row smart-action client cell, and a client table that owns bulk-selection state. Remove courier auto-booking from payment finalization so dispatch is always a deliberate manual step.

**Tech Stack:** Next.js 16 (App Router), React client components, Prisma, NextAuth, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-admin-orders-manual-lifecycle-design.md`

---

## File Structure

**Modify:**
- `app/_lib/admin-orders.ts` — add `canConfirm` guardrail helper.
- `app/admin/orders/actions.ts` — payment guard in `advanceStatus`; add `bulkConfirm` / `bulkDispatch` + their result types.
- `app/_lib/payments/order-finalization.ts` — remove the courier auto-booking block from `finalizePaidPayment`.
- `app/_components/admin/orders/orders-table.tsx` — convert to a client component owning selection state + bulk bar; render a `RowActions` cell.
- `app/admin/orders/__tests__/actions.test.ts` — update one existing test; add guardrail + bulk tests.
- `app/_lib/__tests__/admin-orders.test.ts` — add `canConfirm` tests.
- `app/_lib/payments/__tests__/order-finalization.test.ts` — replace the two courier-booking tests.

**Create:**
- `app/_components/admin/orders/row-actions.tsx` — per-row smart next-action button + `⋯` menu.

**Delete:**
- `app/_components/admin/orders/dispatch-button.tsx` — superseded by `row-actions.tsx` (only `orders-table.tsx` imports it).

---

## Task 1: `canConfirm` payment guardrail helper

**Files:**
- Modify: `app/_lib/admin-orders.ts` (add after `canCancel`, near line 143)
- Test: `app/_lib/__tests__/admin-orders.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `app/_lib/__tests__/admin-orders.test.ts` (place inside the existing top-level `describe` block structure — append a new `describe`):

```typescript
import { canConfirm } from "@/app/_lib/admin-orders";

describe("canConfirm", () => {
  it("allows COD orders regardless of payment status", () => {
    expect(canConfirm({ paymentMethod: "COD", paymentStatus: "COD_PENDING" })).toBe(true);
    expect(canConfirm({ paymentMethod: "COD", paymentStatus: "COD_COLLECTED" })).toBe(true);
  });

  it("allows online orders only once paid", () => {
    expect(canConfirm({ paymentMethod: "KOKO", paymentStatus: "PAID" })).toBe(true);
    expect(canConfirm({ paymentMethod: "PAYHERE", paymentStatus: "PAID" })).toBe(true);
  });

  it("blocks unpaid online orders", () => {
    expect(canConfirm({ paymentMethod: "KOKO", paymentStatus: "PENDING" })).toBe(false);
    expect(canConfirm({ paymentMethod: "MINTPAY", paymentStatus: null })).toBe(false);
    expect(canConfirm({ paymentMethod: "PAYHERE", paymentStatus: "PAYMENT_FAILED" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- admin-orders.test`
Expected: FAIL — `canConfirm is not a function` / not exported.

- [ ] **Step 3: Add the helper**

In `app/_lib/admin-orders.ts`, add directly below `canCancel` (after line 143):

```typescript
/**
 * Payment guardrail for confirming/dispatching. COD is exempt (COD_PENDING is its
 * normal pre-delivery state); online orders must be PAID before they can ship.
 */
export function canConfirm(order: { paymentMethod: string; paymentStatus: string | null }): boolean {
  return order.paymentMethod === "COD" || order.paymentStatus === "PAID";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- admin-orders.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "feat(admin-orders): add canConfirm payment guardrail helper"
```

---

## Task 2: Payment guard in `advanceStatus`

**Files:**
- Modify: `app/admin/orders/actions.ts:55-69` (`advanceStatus`) and the import on line 8
- Test: `app/admin/orders/__tests__/actions.test.ts:96-113`

- [ ] **Step 1: Update the existing test and add the guardrail test**

In `app/admin/orders/__tests__/actions.test.ts`, the existing `advanceStatus` `describe` block (lines 98-113) needs the happy-path mock to carry payment fields, plus a new rejection test. Replace the whole block (lines 98-113) with:

```typescript
describe("advanceStatus", () => {
  it("rejects an illegal transition", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING" });
    const res = await advanceStatus("o1", "DELIVERED");
    expect(res).toEqual({ success: false, error: "Cannot move order from PENDING to DELIVERED" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("allows PENDING→CONFIRMED for a paid order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PAID" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await advanceStatus("o1", "CONFIRMED");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res).toEqual({ success: true });
  });

  it("blocks confirming an unpaid online order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PENDING" });
    const res = await advanceStatus("o1", "CONFIRMED");
    expect(res).toEqual({ success: false, error: "Awaiting payment — confirm online orders only after payment." });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("allows confirming a COD order awaiting collection", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "COD", paymentStatus: "COD_PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await advanceStatus("o1", "CONFIRMED");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- actions.test`
Expected: FAIL — "blocks confirming an unpaid online order" fails because the guard does not exist yet (order would be updated).

- [ ] **Step 3: Add the guard to `advanceStatus`**

In `app/admin/orders/actions.ts`, line 8 currently imports from `admin-orders`. Add `canConfirm` to that import:

```typescript
import { nextStatuses, applyItemChanges, recomputeTotals, canEdit, canConfirm, type ItemChange } from "@/app/_lib/admin-orders";
```

Then in `advanceStatus` (lines 55-69), add the guard after the transition check. The updated function body:

```typescript
export async function advanceStatus(orderId: string, to: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (!nextStatuses(order.status).includes(to)) {
    return { success: false, error: `Cannot move order from ${order.status} to ${to}` };
  }
  if (to === "CONFIRMED" && !canConfirm(order)) {
    return { success: false, error: "Awaiting payment — confirm online orders only after payment." };
  }
  try {
    await prisma.order.update({ where: { id: orderId }, data: { status: to } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- actions.test`
Expected: PASS (all `advanceStatus` cases).

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): guard advanceStatus against confirming unpaid online orders"
```

---

## Task 3: Bulk server actions (`bulkConfirm`, `bulkDispatch`)

**Files:**
- Modify: `app/admin/orders/actions.ts` (add types near line 13; add actions at end of file)
- Test: `app/admin/orders/__tests__/actions.test.ts` (append a new `describe`)

- [ ] **Step 1: Write the failing tests**

Append to `app/admin/orders/__tests__/actions.test.ts`:

```typescript
import { bulkConfirm, bulkDispatch } from "../actions";

describe("bulkConfirm", () => {
  it("confirms eligible orders and skips ineligible ones with a summary", async () => {
    // o1: PENDING paid online → confirm; o2: PENDING unpaid online → skip; o3: already CONFIRMED → skip
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PAID" })
      .mockResolvedValueOnce({ id: "o2", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PENDING" })
      .mockResolvedValueOnce({ id: "o3", status: "CONFIRMED", paymentMethod: "COD", paymentStatus: "COD_PENDING" });
    orderUpdate.mockResolvedValue({});

    const res = await bulkConfirm(["o1", "o2", "o3"]);

    expect(orderUpdate).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res.okCount).toBe(1);
    expect(res.skippedCount).toBe(2);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: false, error: "Awaiting payment" },
      { id: "o3", ok: false, error: "Already confirmed" },
    ]);
  });
});

describe("bulkDispatch", () => {
  it("dispatches confirmed un-booked orders and skips the rest", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "true";
    // o1: CONFIRMED not booked → book; o2: still PENDING → skip
    orderFindUnique
      .mockResolvedValueOnce({ ...FULL_ORDER, id: "o1", status: "CONFIRMED", courierBookedAt: null })
      .mockResolvedValueOnce({ ...FULL_ORDER, id: "o2", status: "PENDING", courierBookedAt: null });
    bookCourierAndNotify.mockResolvedValueOnce("CF-1");

    const res = await bulkDispatch(["o1", "o2"]);

    expect(bookCourierAndNotify).toHaveBeenCalledTimes(1);
    expect(res.okCount).toBe(1);
    expect(res.skippedCount).toBe(1);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: false, error: "Not dispatchable" },
    ]);
  });

  it("returns all-skipped when the courier integration is disabled", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "false";
    const res = await bulkDispatch(["o1", "o2"]);
    expect(res.okCount).toBe(0);
    expect(res.skippedCount).toBe(2);
    expect(bookCourierAndNotify).not.toHaveBeenCalled();
  });
});
```

> Note: `FULL_ORDER` is the fixture already defined at line 236 of this test file. These `describe` blocks are appended after it, so it is in scope.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- actions.test`
Expected: FAIL — `bulkConfirm` / `bulkDispatch` are not exported.

- [ ] **Step 3: Add the result types**

In `app/admin/orders/actions.ts`, after the `ActionResult` type (line 15), add:

```typescript
export type BulkItemResult = { id: string; ok: boolean; error?: string };
export type BulkResult = { results: BulkItemResult[]; okCount: number; skippedCount: number };

function summarize(results: BulkItemResult[]): BulkResult {
  const okCount = results.filter((r) => r.ok).length;
  return { results, okCount, skippedCount: results.length - okCount };
}
```

- [ ] **Step 4: Add the bulk actions**

Append to the end of `app/admin/orders/actions.ts`. These reuse the existing `ORDER_INCLUDE` and `toOrderDetails` (defined earlier in the same file) and the `canConfirm` import added in Task 2:

```typescript
export async function bulkConfirm(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status !== "PENDING") {
      results.push({ id, ok: false, error: order.status === "CONFIRMED" ? "Already confirmed" : `Cannot confirm (${order.status})` });
      continue;
    }
    if (!canConfirm(order)) { results.push({ id, ok: false, error: "Awaiting payment" }); continue; }
    try {
      await prisma.order.update({ where: { id }, data: { status: "CONFIRMED" } });
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false, error: "Update failed" });
    }
  }
  revalidatePath("/admin/orders");
  return summarize(results);
}

export async function bulkDispatch(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  if (process.env.ROYAL_EXPRESS_ENABLED !== "true") {
    return summarize(ids.map((id) => ({ id, ok: false, error: "Courier disabled" })));
  }
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status !== "CONFIRMED" || order.courierBookedAt) {
      results.push({ id, ok: false, error: "Not dispatchable" });
      continue;
    }
    try {
      const waybill = await bookCourierAndNotify({ order: toOrderDetails(order) });
      results.push(waybill ? { id, ok: true } : { id, ok: false, error: "Booking failed" });
    } catch {
      results.push({ id, ok: false, error: "Booking failed" });
    }
  }
  revalidatePath("/admin/orders");
  return summarize(results);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- actions.test`
Expected: PASS (all `bulkConfirm` / `bulkDispatch` cases).

- [ ] **Step 6: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): add bulkConfirm and bulkDispatch server actions"
```

---

## Task 4: Remove courier auto-booking from payment finalization

**Files:**
- Modify: `app/_lib/payments/order-finalization.ts:3` (import) and `:75-90` (remove block)
- Test: `app/_lib/payments/__tests__/order-finalization.test.ts:128-150` (replace two tests)

- [ ] **Step 1: Update the tests to assert the new behaviour**

In `app/_lib/payments/__tests__/order-finalization.test.ts`, replace the two courier tests (lines 128-150 — "books courier when RoyalExpress is enabled" and "alerts admin and still succeeds when courier booking throws") with a single test asserting no booking happens:

```typescript
  it("never books the courier on payment, even when RoyalExpress is enabled", async () => {
    process.env.ROYAL_EXPRESS_ENABLED = "true";

    const result = await finalizePaidPayment("ORD-1", "KOKO");

    expect(bookCourierAndNotify).not.toHaveBeenCalled();
    expect(sendOrderConfirmationEmail).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "success" });

    process.env.ROYAL_EXPRESS_ENABLED = "false";
  });
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npm test -- order-finalization.test`
Expected: FAIL — `bookCourierAndNotify` IS called (auto-booking still in source).

- [ ] **Step 3: Remove the auto-booking block from the source**

In `app/_lib/payments/order-finalization.ts`, delete the entire `if (process.env.ROYAL_EXPRESS_ENABLED === "true") { ... }` block (lines 75-90, including the surrounding blank lines). After the edit, the `try` body goes straight from building `details` to the email-send comment:

```typescript
  try {
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    const details = paidDetails(updated, items);

    // NOTE: emailSent is a best-effort dedup hint for the mailer; the atomic
    // claim (updateMany above) is the real idempotency gate — do not remove the
    // claim assuming this flag alone suffices.
    if (!updated.emailSent) {
      try {
        await sendOrderConfirmationEmail(details);
        await prisma.order.update({ where: { id: orderId }, data: { emailSent: true } });
      } catch (err) {
        logMailerError("order-confirmation", { orderId, webNumber: updated.webNumber }, err);
      }
    }
  } catch (err) {
```

Then remove the now-unused `bookCourierAndNotify` import. Line 3 currently reads:

```typescript
import { bookCourierAndNotify } from "@/app/checkout/book-courier";
```

Delete that line. Leave the `sendAdminFailureAlertEmail` import intact — it is still used by the outer `catch` safety net.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- order-finalization.test`
Expected: PASS — all finalization tests, including the new "never books the courier" test and the existing "marks paid and sends confirmation email".

- [ ] **Step 5: Verify no other source imports the removed symbol**

Run: `npm run build`
Expected: build succeeds (no unused-import / TS errors in `order-finalization.ts`).

- [ ] **Step 6: Commit**

```bash
git add app/_lib/payments/order-finalization.ts app/_lib/payments/__tests__/order-finalization.test.ts
git commit -m "feat(payments): stop auto-booking courier on payment; dispatch is now manual"
```

---

## Task 5: `RowActions` smart next-action cell

**Files:**
- Create: `app/_components/admin/orders/row-actions.tsx`

> No unit-test harness exists for React client components in this repo (logic is unit-tested; UI is verified via `npm run build` + manual pass). This task creates the component and verifies it compiles; behaviour is verified manually in Task 7.

- [ ] **Step 1: Create the component**

Create `app/_components/admin/orders/row-actions.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceStatus, bookCourier, cancelOrder, markCodCollected } from "@/app/admin/orders/actions";

type Props = {
  orderId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string | null;
  courierBooked: boolean;
  waybill: string | null;
};

type Result = { success: boolean; warning?: string; error?: string };

export function RowActions(p: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<Result>, confirmMsg?: string) =>
    start(async () => {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      const r = await fn();
      alert(r.success ? (r.warning ?? "Done") : r.error);
      router.refresh();
    });

  // Online orders (non-COD) must be PAID before they can be confirmed.
  const unpaidOnline = p.paymentMethod !== "COD" && p.paymentStatus !== "PAID";
  const showCodCollected = p.paymentMethod === "COD" && p.paymentStatus === "COD_PENDING";
  const terminal = p.status === "DELIVERED" || p.status === "CANCELLED";

  // Secondary (⋯ menu) actions for this row's state.
  const menu: { label: string; run: () => void }[] = [];
  if (p.status === "CONFIRMED" && !p.courierBooked) {
    menu.push({ label: "Mark delivered", run: () => run(() => advanceStatus(p.orderId, "DELIVERED")) });
  }
  if (!terminal) {
    menu.push({ label: "Cancel order", run: () => run(() => cancelOrder(p.orderId), "Cancel this order and restore stock?") });
  }
  if (showCodCollected) {
    menu.push({ label: "Mark COD collected", run: () => run(() => markCodCollected(p.orderId)) });
  }

  return (
    <div className="flex items-center gap-2">
      {p.status === "PENDING" && (
        <button
          disabled={pending || unpaidOnline}
          title={unpaidOnline ? "Awaiting payment" : undefined}
          onClick={() => run(() => advanceStatus(p.orderId, "CONFIRMED"))}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Confirm
        </button>
      )}
      {p.status === "CONFIRMED" && !p.courierBooked && (
        <button
          disabled={pending}
          onClick={() => run(() => bookCourier(p.orderId))}
          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Dispatch
        </button>
      )}
      {p.status === "CONFIRMED" && p.courierBooked && (
        <button
          disabled={pending}
          onClick={() => run(() => advanceStatus(p.orderId, "DELIVERED"))}
          className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
        >
          Mark delivered
        </button>
      )}
      {terminal && <span className="text-muted-foreground">{p.waybill ?? "—"}</span>}

      {menu.length > 0 && (
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border px-2 py-1 text-xs select-none">⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-background p-1 shadow-md">
            {menu.map((m) => (
              <button
                key={m.label}
                disabled={pending}
                onClick={(e) => {
                  const d = e.currentTarget.closest("details") as HTMLDetailsElement | null;
                  if (d) d.open = false;
                  m.run();
                }}
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-secondary disabled:opacity-50"
              >
                {m.label}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (the component is not yet imported anywhere, but must type-check).

- [ ] **Step 3: Commit**

```bash
git add app/_components/admin/orders/row-actions.tsx
git commit -m "feat(admin-orders): add RowActions smart next-action cell"
```

---

## Task 6: Client orders table with selection + bulk bar

**Files:**
- Modify: `app/_components/admin/orders/orders-table.tsx` (full rewrite to a client component)
- Delete: `app/_components/admin/orders/dispatch-button.tsx`

> `app/admin/orders/page.tsx` imports `OrdersTable` and passes `rows` — its import stays unchanged. `createdAt` is a `Date`; Next.js serializes `Date` props across the server→client boundary, so `toLocaleString` still works in the client component.

- [ ] **Step 1: Rewrite `orders-table.tsx` as a client component**

Replace the entire contents of `app/_components/admin/orders/orders-table.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/app/_lib/format";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "./row-actions";
import { bulkConfirm, bulkDispatch, type BulkResult } from "@/app/admin/orders/actions";

type Row = {
  id: string; webNumber: string | null; createdAt: Date; customerPhone: string;
  guestName: string | null; user: { name: string | null } | null;
  total: number; paymentMethod: string; paymentStatus: string | null; status: string;
  courierBookedAt: Date | null; courierWaybillNumber: string | null;
  _count: { items: number };
};

export function OrdersTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No orders match this view.</p>;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allSelected = rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const runBulk = (fn: (ids: string[]) => Promise<BulkResult>, verb: string) =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      const r = await fn(ids);
      alert(`${r.okCount} ${verb}, ${r.skippedCount} skipped.`);
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div>
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mb-2 flex items-center gap-3 rounded-md border bg-secondary/60 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <button disabled={pending} onClick={() => runBulk(bulkConfirm, "confirmed")}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">Confirm selected</button>
          <button disabled={pending} onClick={() => runBulk(bulkDispatch, "dispatched")}
            className="rounded-md border px-3 py-1 text-xs disabled:opacity-50">Dispatch selected</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground">Clear</button>
        </div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="p-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
            <th className="p-2">Order #</th><th className="p-2">Date</th><th className="p-2">Customer</th>
            <th className="p-2">Items</th><th className="p-2">Total</th><th className="p-2">Payment</th>
            <th className="p-2">Status</th><th className="p-2">Dispatch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b hover:bg-secondary/40">
              <td className="p-2">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)}
                  aria-label={`Select ${o.webNumber ?? o.id}`} />
              </td>
              <td className="p-2 font-medium">
                <Link href={`/admin/orders/${o.id}`} className="hover:underline">{o.webNumber ?? o.id}</Link>
              </td>
              <td className="p-2">{o.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</td>
              <td className="p-2">{o.user?.name ?? o.guestName ?? "—"}<br /><span className="text-muted-foreground">{o.customerPhone}</span></td>
              <td className="p-2">{o._count.items}</td>
              <td className="p-2 font-medium">{formatPrice(o.total)}</td>
              <td className="p-2">
                <Badge variant="secondary">{paymentStatusLabel(o.paymentStatus) ?? "—"}</Badge>
                <br /><span className="text-muted-foreground">{o.paymentMethod}</span>
              </td>
              <td className="p-2"><Badge variant="outline">{o.status}</Badge></td>
              <td className="p-2">
                <RowActions orderId={o.id} status={o.status} paymentMethod={o.paymentMethod}
                  paymentStatus={o.paymentStatus} courierBooked={!!o.courierBookedAt} waybill={o.courierWaybillNumber} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Delete the superseded dispatch button**

```bash
git rm app/_components/admin/orders/dispatch-button.tsx
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds. If it fails with "DispatchButton is not exported" or a missing-import error, grep for stray imports: `git grep dispatch-button` should return nothing.

- [ ] **Step 4: Commit**

```bash
git add app/_components/admin/orders/orders-table.tsx
git commit -m "feat(admin-orders): actionable orders list with per-row actions and bulk select"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test`
Expected: PASS — all suites, including `admin-orders.test`, `actions.test`, `order-finalization.test`.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Manual smoke test (per CLAUDE.md validation requirement)**

Run: `npm run dev`, sign in as admin, open `/admin/orders`, and confirm:
- A **PENDING + paid** (online) or **COD** order shows an enabled **Confirm** button; clicking it moves the row to CONFIRMED.
- A **PENDING + unpaid online** order shows a **disabled** Confirm button with an "Awaiting payment" tooltip.
- A **CONFIRMED** order shows **Dispatch**; clicking it books the courier (requires `ROYAL_EXPRESS_ENABLED=true`) and the row shows the waybill afterward.
- A dispatched (CONFIRMED + booked) order shows **Mark delivered**.
- The `⋯` menu shows Cancel (and Mark COD collected for a COD order awaiting collection).
- Selecting several rows reveals the bulk bar; **Confirm selected** reports an "N confirmed, M skipped" summary and refreshes the list.

- [ ] **Step 4: Verify the live payment path is unaffected (prod-risk check)**

> Koko is live in production. Confirm the callback still finalizes payment and no longer books the courier.

Run: `npm test -- order-finalization.test`
Expected: PASS — "marks paid and sends confirmation email" still passes (confirmation email kept) and "never books the courier on payment" passes (booking removed).

- [ ] **Step 5: Final commit (if any working-tree changes remain)**

```bash
git status
# If clean, nothing to do — all work was committed per task.
```

---

## Self-Review Notes (verified during planning)

- **Spec coverage:** manual lifecycle (Tasks 2, 5), remove auto-book (Task 4), payment guardrail (Tasks 1, 2; enforced at confirm — the single gate, since CONFIRMED is the precondition for dispatch), smart row actions + `⋯` menu (Task 5), bulk actions with partial-success summary (Tasks 3, 6), testing (Tasks 1-4, 7). Detail page (`OrderActions`) intentionally untouched.
- **Type consistency:** `BulkResult` / `BulkItemResult` defined in Task 3 and imported by Task 6; `canConfirm` defined in Task 1, imported by Task 2 and used in Task 3; `RowActions` prop shape matches the call site in Task 6.
- **Mark COD collected** visibility matches the existing `markCodCollected` guard (`paymentMethod === "COD" && paymentStatus === "COD_PENDING"`).
```
