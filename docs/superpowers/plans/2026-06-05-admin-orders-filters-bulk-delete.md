# Admin Orders — Clearer Filters, Bulk Cancel, Delete Cancelled — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin Orders filters honest (tabs own status, drop the redundant Status dropdown, add a Pending tab), add bulk cancel, and add permanent delete (row + bulk) for cancelled orders.

**Architecture:** Server actions in `app/admin/orders/actions.ts` do all mutations (`requireAdmin` + `revalidatePath`). `bulkCancel` reuses `cancelOrder`'s stock-restore transaction via an extracted helper. `deleteOrder`/`bulkDelete` are pure record removal gated to `CANCELLED` (Prisma cascade removes items/notes; stock is untouched). Filtering lives in `buildOrderWhere`; the toolbar/table are thin client components.

**Tech Stack:** Next.js 16 App Router, React Server/Client Components, Prisma (PostgreSQL/SQLite), Vitest, sonner toasts.

**Design spec:** `docs/superpowers/specs/2026-06-05-admin-orders-filters-bulk-delete-design.md`

---

## File Structure

- `app/admin/orders/actions.ts` — add `cancelOrderTx` helper, refactor `cancelOrder` to use it, add `bulkCancel`, `deleteOrder`, `bulkDelete`.
- `app/admin/orders/__tests__/actions.test.ts` — add `order.delete` mock; tests for the three new actions.
- `app/_lib/admin-orders.ts` — `ORDER_TABS` (+`pending`), `buildOrderWhere` (drop `status` param branch, add `pending` case), `ListParams` (drop `status`).
- `app/_lib/__tests__/admin-orders.test.ts` — update the two status-override tests, add a `pending`-tab test.
- `app/admin/orders/page.tsx` — stop passing `status` into `listOrders`.
- `app/_components/admin/orders/orders-toolbar.tsx` — remove the Status `<select>`, add the Pending tab label.
- `app/_components/admin/orders/orders-table.tsx` — "Cancel selected", "Delete selected" (cancelled-only), paid-refund warning.
- `app/_components/admin/orders/row-actions.tsx` — row-level Delete on cancelled orders.

---

## Task 1: Extract `cancelOrderTx` and refactor `cancelOrder` (no behavior change)

**Files:**
- Modify: `app/admin/orders/actions.ts` (the `cancelOrder` function, lines 88-113)
- Test: `app/admin/orders/__tests__/actions.test.ts` (existing `cancelOrder` suite must stay green)

- [ ] **Step 1: Run the existing cancelOrder tests to confirm the baseline is green**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts -t "cancelOrder"`
Expected: PASS (3 tests).

- [ ] **Step 2: Add the `Prisma.TransactionClient` import**

In `app/admin/orders/actions.ts`, the existing import on line 5 is:

```ts
import type { Prisma } from "@prisma/client";
```

Leave it as-is — `Prisma.TransactionClient` is available via this namespace import. No change needed if it already imports `Prisma`.

- [ ] **Step 3: Add the `cancelOrderTx` helper above `cancelOrder`**

Insert this helper immediately above the `cancelOrder` function (just under the `const PAID = ...` line at 86):

```ts
/**
 * Stock-restore + status flip for a cancellation, inside a caller-provided
 * transaction. Shared by cancelOrder (single) and bulkCancel (many) so the two
 * paths never diverge. Eligibility checks are the caller's responsibility.
 */
async function cancelOrderTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: { productId: string; quantity: number }[],
): Promise<void> {
  for (const it of items) {
    await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { increment: it.quantity } } });
  }
  await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
}
```

- [ ] **Step 4: Refactor `cancelOrder`'s transaction body to call the helper**

Replace the `try { await prisma.$transaction(async (tx) => { ... }); }` block inside `cancelOrder` (lines 98-107) with:

```ts
  try {
    await prisma.$transaction((tx) => cancelOrderTx(tx, orderId, order.items));
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
```

Everything else in `cancelOrder` (the `requireAdmin`, the not-found / already-cancelled / delivered guards, the `revalidate`, and the PAID warning return) stays exactly the same.

- [ ] **Step 5: Run the cancelOrder tests again to confirm no behavior change**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts -t "cancelOrder"`
Expected: PASS (3 tests) — same assertions on `productUpdateMany`, `orderUpdate`, and the paid warning.

- [ ] **Step 6: Commit**

```bash
git add app/admin/orders/actions.ts
git commit -m "refactor(admin-orders): extract cancelOrderTx for reuse by bulk cancel"
```

---

## Task 2: `bulkCancel` action

**Files:**
- Modify: `app/admin/orders/actions.ts` (add `bulkCancel` near the other bulk actions, after `bulkDispatch`)
- Test: `app/admin/orders/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Add this suite to `app/admin/orders/__tests__/actions.test.ts`. Put the import line with the other action imports near the bottom (next to `import { bulkConfirm, bulkDispatch } from "../actions";`):

```ts
import { bulkCancel } from "../actions";

describe("bulkCancel", () => {
  it("cancels eligible orders, restores stock, and skips terminal ones", async () => {
    // o1: CONFIRMED → cancel + restore; o2: already CANCELLED → skip; o3: DELIVERED → skip
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", items: [{ productId: "p1", quantity: 2 }] })
      .mockResolvedValueOnce({ id: "o2", status: "CANCELLED", paymentStatus: "PENDING", items: [] })
      .mockResolvedValueOnce({ id: "o3", status: "DELIVERED", paymentStatus: "PAID", items: [{ productId: "p9", quantity: 1 }] });
    orderUpdate.mockResolvedValue({});
    productUpdateMany.mockResolvedValue({ count: 1 });

    const res = await bulkCancel(["o1", "o2", "o3"]);

    // only o1 restores stock and flips status
    expect(productUpdateMany).toHaveBeenCalledTimes(1);
    expect(productUpdateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stock: { increment: 2 } } });
    expect(orderUpdate).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res.okCount).toBe(1);
    expect(res.skippedCount).toBe(2);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: false, error: "Already cancelled" },
      { id: "o3", ok: false, error: "Cannot cancel (DELIVERED)" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts -t "bulkCancel"`
Expected: FAIL — `bulkCancel` is not exported.

- [ ] **Step 3: Implement `bulkCancel`**

Add to `app/admin/orders/actions.ts`, after the `bulkDispatch` function:

```ts
export async function bulkCancel(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: { select: { productId: true, quantity: true } } },
    });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status === "CANCELLED") { results.push({ id, ok: false, error: "Already cancelled" }); continue; }
    if (order.status === "DELIVERED") { results.push({ id, ok: false, error: "Cannot cancel (DELIVERED)" }); continue; }
    try {
      await prisma.$transaction((tx) => cancelOrderTx(tx, id, order.items));
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false, error: "Cancel failed" });
    }
  }
  revalidatePath("/admin/orders");
  for (const r of results) if (r.ok) revalidatePath(`/admin/orders/${r.id}`);
  return summarize(results);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts -t "bulkCancel"`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): bulkCancel action reusing cancelOrderTx"
```

---

## Task 3: `deleteOrder` and `bulkDelete` actions

**Files:**
- Modify: `app/admin/orders/actions.ts` (add both functions after `bulkCancel`)
- Test: `app/admin/orders/__tests__/actions.test.ts` (add a `delete` mock to the Prisma stub)

- [ ] **Step 1: Add an `order.delete` mock to the test harness**

In `app/admin/orders/__tests__/actions.test.ts`:

1. Add `orderDelete` to the hoisted mock block (the one at lines 4-10):

```ts
const { orderFindUnique, orderUpdate, orderDelete, noteCreate, productUpdateMany, txn } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderDelete: vi.fn(),
  noteCreate: vi.fn(),
  productUpdateMany: vi.fn(),
  txn: vi.fn(),
}));
```

2. Add `delete: orderDelete` to the `order` object in **both** the `vi.mock("@/app/_lib/prisma", ...)` client (line 29) and the `txn` re-implementation inside `beforeEach` (line 50):

```ts
    order: { findUnique: orderFindUnique, update: orderUpdate, delete: orderDelete },
```

3. Add `orderDelete.mockReset();` to `beforeEach` (next to the other resets around line 42-47).

- [ ] **Step 2: Write the failing tests**

Add this suite to `app/admin/orders/__tests__/actions.test.ts`:

```ts
import { deleteOrder, bulkDelete } from "../actions";

describe("deleteOrder", () => {
  it("deletes a cancelled order without touching stock", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CANCELLED" });
    orderDelete.mockResolvedValueOnce({});
    const res = await deleteOrder("o1");
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: "o1" } });
    expect(productUpdateMany).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it("rejects deleting a non-cancelled order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CONFIRMED" });
    const res = await deleteOrder("o1");
    expect(res).toEqual({ success: false, error: "Only cancelled orders can be deleted" });
    expect(orderDelete).not.toHaveBeenCalled();
  });
});

describe("bulkDelete", () => {
  it("deletes cancelled orders and skips the rest", async () => {
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "CANCELLED" })
      .mockResolvedValueOnce({ id: "o2", status: "DELIVERED" });
    orderDelete.mockResolvedValue({});
    const res = await bulkDelete(["o1", "o2"]);
    expect(orderDelete).toHaveBeenCalledTimes(1);
    expect(orderDelete).toHaveBeenCalledWith({ where: { id: "o1" } });
    expect(res.okCount).toBe(1);
    expect(res.skippedCount).toBe(1);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: false, error: "Not cancelled" },
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts -t "deleteOrder"`
Expected: FAIL — `deleteOrder` / `bulkDelete` not exported.

- [ ] **Step 4: Implement both actions**

Add to `app/admin/orders/actions.ts`, after `bulkCancel`:

```ts
export async function deleteOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "CANCELLED") return { success: false, error: "Only cancelled orders can be deleted" };
  // Pure record removal: items & notes cascade-delete (schema onDelete: Cascade).
  // Do NOT restore stock here — cancellation already did.
  try {
    await prisma.order.delete({ where: { id: orderId } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidatePath("/admin/orders");
  return { success: true };
}

export async function bulkDelete(ids: string[]): Promise<BulkResult> {
  await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status !== "CANCELLED") { results.push({ id, ok: false, error: "Not cancelled" }); continue; }
    try {
      await prisma.order.delete({ where: { id } });
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false, error: "Delete failed" });
    }
  }
  revalidatePath("/admin/orders");
  return summarize(results);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts -t "deleteOrder"` then `npx vitest run app/admin/orders/__tests__/actions.test.ts -t "bulkDelete"`
Expected: PASS.

- [ ] **Step 6: Run the whole actions test file to confirm nothing regressed**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: PASS (all suites).

- [ ] **Step 7: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): deleteOrder + bulkDelete for cancelled orders"
```

---

## Task 4: `buildOrderWhere` — add Pending tab, drop the status override

**Files:**
- Modify: `app/_lib/admin-orders.ts` (`ORDER_TABS` line 6, `ListParams` lines 9-15, `buildOrderWhere` lines 17-60)
- Test: `app/_lib/__tests__/admin-orders.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `app/_lib/__tests__/admin-orders.test.ts`:

1. **Add** a Pending-tab test inside the `describe("buildOrderWhere", ...)` block (after the `needs-dispatch` test):

```ts
  it("maps 'pending' to status PENDING", () => {
    expect(buildOrderWhere({ tab: "pending" })).toEqual({ status: "PENDING" });
  });
```

2. **Replace** the test "merges explicit status/payment filters over the tab preset" (lines 40-44) with a payment-only version (there is no more `status` param):

```ts
  it("merges an explicit payment filter over the tab preset", () => {
    const where = buildOrderWhere({ tab: "all", payment: "PAID" });
    expect(where.paymentStatus).toBe("PAID");
  });
```

3. **Delete** the test "drops the needs-dispatch courierBookedAt constraint when status is overridden" (lines 46-50) entirely — the override it covered no longer exists.

- [ ] **Step 2: Run the tests to verify the Pending test fails**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts -t "buildOrderWhere"`
Expected: FAIL — `'pending'` maps to `{}` (no case yet), and TypeScript/`tab: "pending"` is not yet a valid `OrderTab`.

- [ ] **Step 3: Add `pending` to `ORDER_TABS`**

In `app/_lib/admin-orders.ts` line 6, change:

```ts
export const ORDER_TABS = ["all", "needs-dispatch", "pending-cod", "delivered", "cancelled"] as const;
```

to:

```ts
export const ORDER_TABS = ["all", "pending", "needs-dispatch", "pending-cod", "delivered", "cancelled"] as const;
```

- [ ] **Step 4: Drop `status` from `ListParams`**

In `app/_lib/admin-orders.ts`, the `ListParams` type (lines 9-15) currently has a `status?: string;` field. Remove that one line so the type is:

```ts
export type ListParams = {
  tab?: OrderTab;
  q?: string;
  payment?: string;
  sort?: "newest" | "oldest";
};
```

- [ ] **Step 5: Add the `pending` case and remove the status-override block in `buildOrderWhere`**

In `buildOrderWhere`, add a `pending` case to the switch (above `needs-dispatch`):

```ts
    case "pending":
      where.status = "PENDING";
      break;
```

Then **delete** the entire status-override block (currently lines 38-43):

```ts
  // Explicit filters override the tab preset. When status is overridden we also
  // drop the needs-dispatch courierBookedAt:null constraint, which would
  // otherwise leak into an incoherent query (e.g. status=PENDING + not-booked).
  if (params.status) {
    where.status = params.status;
    delete where.courierBookedAt;
  }
```

Leave the payment line that follows it:

```ts
  if (params.payment) where.paymentStatus = params.payment;
```

- [ ] **Step 6: Run the lib tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: PASS (all suites, including the new `pending` test).

- [ ] **Step 7: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "feat(admin-orders): tabs own status — add Pending tab, drop status override"
```

---

## Task 5: Stop passing `status` into `listOrders` from the page

**Files:**
- Modify: `app/admin/orders/page.tsx` (the `listOrders` call, lines 14-21)

- [ ] **Step 1: Remove the `status` argument**

In `app/admin/orders/page.tsx`, the `listOrders({ ... })` call currently passes `status: sp.status,`. Remove that line so the call is:

```ts
  const { rows, total } = await listOrders({
    tab,
    q: sp.q,
    payment: sp.payment,
    sort: sp.sort as "newest" | "oldest" | undefined,
    page,
  });
```

(The `pageHref` helper still copies every `sp` entry except `page`, so any stale `?status=` in a bookmarked URL is harmless — `buildOrderWhere` simply ignores it now.)

- [ ] **Step 2: Type-check the page compiles**

Run: `npx tsc --noEmit`
Expected: PASS — no error about an unknown `status` property on `ListParams`.

- [ ] **Step 3: Commit**

```bash
git add app/admin/orders/page.tsx
git commit -m "refactor(admin-orders): page no longer reads the removed status param"
```

---

## Task 6: Toolbar — remove the Status dropdown, label the Pending tab

**Files:**
- Modify: `app/_components/admin/orders/orders-toolbar.tsx`

- [ ] **Step 1: Add the Pending label to `TAB_LABEL`**

In `app/_components/admin/orders/orders-toolbar.tsx`, change the `TAB_LABEL` map (lines 5-8) to include `pending`:

```ts
const TAB_LABEL: Record<OrderTab, string> = {
  all: "All", pending: "Pending", "needs-dispatch": "Needs dispatch",
  "pending-cod": "Pending COD", delivered: "Delivered", cancelled: "Cancelled",
};
```

- [ ] **Step 2: Remove the Status `<select>`**

Delete the entire first `<select aria-label="Filter by status">` block (lines 33-44 — the one whose options are All statuses / Pending / Confirmed / Delivered / Cancelled). Keep the Payment `<select>` and the Sort `<select>` exactly as they are. The wrapping `<div className="mt-3 flex flex-wrap items-center gap-2">` now contains just Payment and Sort.

- [ ] **Step 3: Verify the toolbar compiles and the type map is exhaustive**

Run: `npx tsc --noEmit`
Expected: PASS — `Record<OrderTab, string>` now requires the `pending` key, which Step 1 added.

- [ ] **Step 4: Commit**

```bash
git add app/_components/admin/orders/orders-toolbar.tsx
git commit -m "feat(admin-orders): toolbar drops Status dropdown, adds Pending tab"
```

---

## Task 7: Table — Cancel selected, Delete selected, paid-refund warning

**Files:**
- Modify: `app/_components/admin/orders/orders-table.tsx`

- [ ] **Step 1: Import the two new bulk actions**

Change the action import on line 10 from:

```ts
import { bulkConfirm, bulkDispatch, type BulkResult } from "@/app/admin/orders/actions";
```

to:

```ts
import { bulkConfirm, bulkDispatch, bulkCancel, bulkDelete, type BulkResult } from "@/app/admin/orders/actions";
```

- [ ] **Step 2: Add `cancelSelected` and `deleteSelected` handlers + an `allCancelled` flag**

Immediately after the existing `dispatchSelected` handler (ends at line 63), add:

```ts
  const PAID_STATUSES = new Set(["PAID", "COD_COLLECTED"]);

  const cancelSelected = () =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      if (!window.confirm(`Cancel ${ids.length} order(s) and restore their stock?`)) return;
      const paidCount = rows.filter((o) => selected.has(o.id) && PAID_STATUSES.has(o.paymentStatus ?? "")).length;
      const r = await bulkCancel(ids);
      report(r, "cancelled");
      if (r.okCount > 0 && paidCount > 0) {
        toast.warning(`${paidCount} were paid — handle refunds manually.`);
      }
    });

  const selectedRows = rows.filter((o) => selected.has(o.id));
  const allCancelled = selectedRows.length > 0 && selectedRows.every((o) => o.status === "CANCELLED");

  const deleteSelected = () =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      if (!window.confirm(`Permanently delete ${ids.length} cancelled order(s)? This cannot be undone.`)) return;
      report(await bulkDelete(ids), "deleted");
    });
```

(`report` already clears the selection, shows a success/error toast, and refreshes — see lines 37-43. The refund `toast.warning` fires after it for the paid subset.)

- [ ] **Step 3: Add the buttons to the bulk bar**

In the bulk bar `<div>` (lines 67-76), after the existing "Dispatch selected" button and before the "Clear" button, add "Cancel selected" and a conditional "Delete selected":

```tsx
          <button disabled={pending} onClick={cancelSelected}
            className="rounded-md border border-destructive px-3 py-1 text-xs text-destructive disabled:opacity-50">Cancel selected</button>
          {allCancelled && (
            <button disabled={pending} onClick={deleteSelected}
              className="rounded-md bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-50">Delete selected</button>
          )}
```

Keep the `<button onClick={() => setSelected(new Set())} className="ml-auto ...">Clear</button>` last so it stays right-aligned.

- [ ] **Step 4: Type-check and build the table**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_components/admin/orders/orders-table.tsx
git commit -m "feat(admin-orders): bulk cancel + bulk delete (cancelled-only) with refund warning"
```

---

## Task 8: Row actions — Delete button on cancelled orders

**Files:**
- Modify: `app/_components/admin/orders/row-actions.tsx`

- [ ] **Step 1: Import `deleteOrder`**

Change line 2 from:

```ts
import { advanceStatus, bookCourier, cancelOrder, markCodCollected } from "@/app/admin/orders/actions";
```

to:

```ts
import { advanceStatus, bookCourier, cancelOrder, deleteOrder, markCodCollected } from "@/app/admin/orders/actions";
```

- [ ] **Step 2: Render a Delete button for cancelled rows**

In the returned JSX, the terminal branch currently renders just the waybill (line 70):

```tsx
      {terminal && <span className="text-muted-foreground">{p.waybill ?? "—"}</span>}
```

Replace that line with one that keeps the waybill span and adds a Delete button when the order is CANCELLED:

```tsx
      {terminal && <span className="text-muted-foreground">{p.waybill ?? "—"}</span>}
      {p.status === "CANCELLED" && (
        <button
          disabled={pending}
          onClick={() => run("delete", () => deleteOrder(p.orderId), "Permanently delete this cancelled order? This cannot be undone.")}
          className="inline-flex items-center gap-1 rounded-md border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
        >
          {runningLabel === "delete" && <Spinner />} Delete
        </button>
      )}
```

(`run(label, fn, confirmMsg)` from `useActionRunner` already gates on `window.confirm`, toasts success/error, and refreshes — see `use-action-runner.tsx:19-39`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/admin/orders/row-actions.tsx
git commit -m "feat(admin-orders): row-level delete for cancelled orders"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS — all suites, including the new `bulkCancel`, `deleteOrder`, `bulkDelete`, and `pending`-tab tests.

- [ ] **Step 2: Production build (required by CLAUDE.md §2 before merge)**

Run: `npm run build`
Expected: build completes with no type errors and no errors about the removed `status` param or the `OrderTab` union.

- [ ] **Step 3: Manual smoke check (optional but recommended)**

Run the dev server (`npm run dev`) and on `/admin/orders`:
- The Status dropdown is gone; the **Pending** tab appears and lists `PENDING` orders.
- Selecting orders shows **Cancel selected**; cancelling restores stock and, if any were paid, shows the refund warning toast.
- On the **Cancelled** tab, each row shows **Delete**; selecting only cancelled orders reveals **Delete selected**.
- Deleting removes the order and its items/notes; stock is unchanged.

- [ ] **Step 4: Final commit (if any smoke-fix tweaks were needed)**

```bash
git add -A
git commit -m "chore(admin-orders): verification pass for filters/bulk-cancel/delete"
```

---

## Self-Review Notes

- **Spec coverage:** Filters (Tasks 4-6), Pending tab (Tasks 4, 6), bulk cancel + refund warning (Tasks 1-2, 7), hard delete row + bulk gated to CANCELLED (Tasks 3, 7-8), no stock touch on delete (Task 3 test asserts `productUpdateMany` not called), tests + build (Task 9). All spec sections mapped.
- **Type consistency:** `cancelOrderTx(tx, orderId, items)` defined in Task 1 and called identically in Tasks 1 & 2. `BulkResult` / `BulkItemResult` / `summarize` reused from existing code. `OrderTab` gains `"pending"` in Task 4 and is consumed in Task 6's `TAB_LABEL` (`Record<OrderTab, string>` enforces exhaustiveness).
- **No status param leak:** `ListParams.status` removed (Task 4) and the page stops passing it (Task 5) — `tsc --noEmit` in Task 5 would fail if either were missed.
