# Admin Orders — Confirm Friction & Action Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins confirm unpaid online orders via an explicit warned override, and replace blocking `alert()`s with `sonner` toasts + button spinners across the admin order actions.

**Architecture:** Add an opt-in `allowUnpaid` flag to the `advanceStatus` and `bulkConfirm` server actions (default behavior unchanged, server stays the source of truth). Add `sonner` + a `<Toaster>` in the admin layout, and a shared `useActionRunner` hook (pending + toast + refresh) consumed by the row, detail, and bulk action UIs.

**Tech Stack:** Next.js 16.2 (App Router), React 19, Prisma, Vitest, sonner.

**Spec:** `docs/superpowers/specs/2026-06-04-admin-orders-confirm-feedback-design.md`

---

## File Structure

**Modify:**
- `app/admin/orders/actions.ts` — `advanceStatus` and `bulkConfirm` gain `opts?: { allowUnpaid?: boolean }`.
- `app/admin/orders/__tests__/actions.test.ts` — add allowUnpaid cases (existing cases stay).
- `app/admin/layout.tsx` — mount `<Toaster>`.
- `app/_components/admin/orders/row-actions.tsx` — use shared hook; enable+warn unpaid-online confirm; spinner.
- `app/_components/admin/orders/order-actions.tsx` — same treatment for the detail page.
- `app/_components/admin/orders/orders-table.tsx` — bulk bar toasts + warn-once before forcing unpaid confirm.
- `package.json` / lockfile — add `sonner`.

**Create:**
- `app/_components/admin/orders/use-action-runner.tsx` — `useActionRunner` hook + `Spinner` component.

---

## Task 1: Server — `advanceStatus` allowUnpaid override

**Files:**
- Modify: `app/admin/orders/actions.ts:63-80` (`advanceStatus`)
- Test: `app/admin/orders/__tests__/actions.test.ts:98-128` (add one case)

- [ ] **Step 1: Add the failing test**

In `app/admin/orders/__tests__/actions.test.ts`, inside the existing `describe("advanceStatus", ...)` block, add this test immediately after the `"blocks confirming an unpaid online order"` test (after line 119):

```typescript
  it("confirms an unpaid online order when allowUnpaid is set", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await advanceStatus("o1", "CONFIRMED", { allowUnpaid: true });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res).toEqual({ success: true });
  });
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npm test -- actions.test`
Expected: FAIL — "confirms an unpaid online order when allowUnpaid is set" fails (the order is still blocked; `orderUpdate` not called).

- [ ] **Step 3: Update `advanceStatus`**

In `app/admin/orders/actions.ts`, replace the whole `advanceStatus` function (lines 63-80) with:

```typescript
export async function advanceStatus(
  orderId: string,
  to: string,
  opts?: { allowUnpaid?: boolean },
): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (!nextStatuses(order.status).includes(to)) {
    return { success: false, error: `Cannot move order from ${order.status} to ${to}` };
  }
  if (to === "CONFIRMED" && !canConfirm(order) && !opts?.allowUnpaid) {
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
Expected: PASS — all `advanceStatus` cases, including the existing "blocks confirming an unpaid online order" (no flag → still blocked) and the new allowUnpaid case.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): allow warned confirm of unpaid online orders via allowUnpaid"
```

---

## Task 2: Server — `bulkConfirm` allowUnpaid override

**Files:**
- Modify: `app/admin/orders/actions.ts:273-294` (`bulkConfirm`)
- Test: `app/admin/orders/__tests__/actions.test.ts:318-339` (add one case)

- [ ] **Step 1: Add the failing test**

In `app/admin/orders/__tests__/actions.test.ts`, inside the existing `describe("bulkConfirm", ...)` block, add this test after the existing test (after line 338):

```typescript
  it("confirms unpaid online orders when allowUnpaid is set", async () => {
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "PENDING", paymentMethod: "KOKO", paymentStatus: "PENDING" })
      .mockResolvedValueOnce({ id: "o2", status: "PENDING", paymentMethod: "MINTPAY", paymentStatus: null });
    orderUpdate.mockResolvedValue({});

    const res = await bulkConfirm(["o1", "o2"], { allowUnpaid: true });

    expect(orderUpdate).toHaveBeenCalledTimes(2);
    expect(res.okCount).toBe(2);
    expect(res.skippedCount).toBe(0);
    expect(res.results).toEqual([
      { id: "o1", ok: true },
      { id: "o2", ok: true },
    ]);
  });
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npm test -- actions.test`
Expected: FAIL — the new test fails because unpaid online orders are still skipped with "Awaiting payment".

- [ ] **Step 3: Update `bulkConfirm`**

In `app/admin/orders/actions.ts`, replace the `bulkConfirm` function (lines 273-294) with:

```typescript
export async function bulkConfirm(ids: string[], opts?: { allowUnpaid?: boolean }): Promise<BulkResult> {
  await requireAdmin();
  const results: BulkItemResult[] = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) { results.push({ id, ok: false, error: "Not found" }); continue; }
    if (order.status !== "PENDING") {
      results.push({ id, ok: false, error: order.status === "CONFIRMED" ? "Already confirmed" : `Cannot confirm (${order.status})` });
      continue;
    }
    if (!canConfirm(order) && !opts?.allowUnpaid) { results.push({ id, ok: false, error: "Awaiting payment" }); continue; }
    try {
      await prisma.order.update({ where: { id }, data: { status: "CONFIRMED" } });
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false, error: "Update failed" });
    }
  }
  revalidatePath("/admin/orders");
  for (const r of results) if (r.ok) revalidatePath(`/admin/orders/${r.id}`);
  return summarize(results);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- actions.test`
Expected: PASS — the existing bulkConfirm test (no flag → skips unpaid) and the new allowUnpaid test.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): bulkConfirm honors allowUnpaid to confirm unpaid online orders"
```

---

## Task 3: Add `sonner` and mount the Toaster

**Files:**
- Modify: `package.json` (+ lockfile) via install
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Install sonner**

Run: `npm install sonner`
Expected: `sonner` added to `dependencies`; install completes with no peer-dependency errors (sonner supports React 19).

- [ ] **Step 2: Mount the Toaster in the admin layout**

Replace the entire contents of `app/admin/layout.tsx` with:

```tsx
// Admin chrome. requireAdmin() is the layer-2 server-side guard; the
// proxy.ts edge gate is layer 1 (spec #1).
import { Toaster } from "sonner";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { AdminTopBar } from "@/app/_components/admin/admin-top-bar";
import { AdminSidebar } from "@/app/_components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const userLabel = session.user.name || session.user.email || "Admin";

  return (
    <div className="flex min-h-screen flex-col">
      <AdminTopBar userLabel={userLabel} />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: success. (`<Toaster>` is a client component from sonner rendered inside the server layout — this is supported.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/admin/layout.tsx
git commit -m "feat(admin): add sonner and mount Toaster in admin layout"
```

---

## Task 4: Shared `useActionRunner` hook + `Spinner`

**Files:**
- Create: `app/_components/admin/orders/use-action-runner.tsx`

> No React component unit-test harness exists in this repo; verification is `npm run build` plus the manual smoke in Task 8.

- [ ] **Step 1: Create the hook + spinner**

Create `app/_components/admin/orders/use-action-runner.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type ActionResult = { success: boolean; warning?: string; error?: string };

/**
 * Shared runner for admin order actions: optional confirm gate, pending state,
 * a sonner toast on success/error, and a router.refresh() so server-rendered
 * rows and chip counts update without a manual page reload. `runningLabel` lets
 * a caller show a spinner on the specific button that is currently running.
 */
export function useActionRunner() {
  const [pending, start] = useTransition();
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const router = useRouter();

  const run = (label: string, fn: () => Promise<ActionResult>, confirmMsg?: string) =>
    start(async () => {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      setRunningLabel(label);
      try {
        const r = await fn();
        if (r.success) toast.success(r.warning ?? "Done");
        else toast.error(r.error ?? "Action failed");
        router.refresh();
      } finally {
        setRunningLabel(null);
      }
    });

  return { pending, runningLabel, run };
}

export function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]"
      aria-hidden
    />
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: success (not yet imported anywhere; must type-check).

- [ ] **Step 3: Commit**

```bash
git add app/_components/admin/orders/use-action-runner.tsx
git commit -m "feat(admin-orders): add shared useActionRunner hook and Spinner"
```

---

## Task 5: `RowActions` — toasts, spinner, warned unpaid-online confirm

**Files:**
- Modify: `app/_components/admin/orders/row-actions.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `row-actions.tsx`**

Replace the entire contents of `app/_components/admin/orders/row-actions.tsx` with:

```tsx
"use client";
import { advanceStatus, bookCourier, cancelOrder, markCodCollected } from "@/app/admin/orders/actions";
import { useActionRunner, Spinner } from "./use-action-runner";

type Props = {
  orderId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string | null;
  courierBooked: boolean;
  waybill: string | null;
};

export function RowActions(p: Props) {
  const { pending, runningLabel, run } = useActionRunner();

  // Online orders (non-COD) that are not yet PAID can still be confirmed, but
  // the admin is warned first.
  const unpaidOnline = p.paymentMethod !== "COD" && p.paymentStatus !== "PAID";
  const terminal = p.status === "DELIVERED" || p.status === "CANCELLED";
  const showCodCollected = !terminal && p.paymentMethod === "COD" && p.paymentStatus === "COD_PENDING";

  const confirmOrder = () =>
    unpaidOnline
      ? run("confirm", () => advanceStatus(p.orderId, "CONFIRMED", { allowUnpaid: true }),
          "This order isn't paid yet. Confirm and prepare to dispatch anyway?")
      : run("confirm", () => advanceStatus(p.orderId, "CONFIRMED"));

  // Secondary (⋯ menu) actions for this row's state.
  const menu: { label: string; run: () => void }[] = [];
  if (p.status === "CONFIRMED" && !p.courierBooked) {
    menu.push({ label: "Mark delivered", run: () => run("deliver", () => advanceStatus(p.orderId, "DELIVERED")) });
  }
  if (!terminal) {
    menu.push({ label: "Cancel order", run: () => run("cancel", () => cancelOrder(p.orderId), "Cancel this order and restore stock?") });
  }
  if (showCodCollected) {
    menu.push({ label: "Mark COD collected", run: () => run("cod", () => markCodCollected(p.orderId)) });
  }

  return (
    <div className="flex items-center gap-2">
      {p.status === "PENDING" && (
        <button
          disabled={pending}
          onClick={confirmOrder}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {runningLabel === "confirm" && <Spinner />} Confirm
        </button>
      )}
      {p.status === "CONFIRMED" && !p.courierBooked && (
        <button
          disabled={pending}
          onClick={() => run("dispatch", () => bookCourier(p.orderId))}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {runningLabel === "dispatch" && <Spinner />} Dispatch
        </button>
      )}
      {p.status === "CONFIRMED" && p.courierBooked && (
        <button
          disabled={pending}
          onClick={() => run("deliver", () => advanceStatus(p.orderId, "DELIVERED"))}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
        >
          {runningLabel === "deliver" && <Spinner />} Mark delivered
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

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/_components/admin/orders/row-actions.tsx
git commit -m "feat(admin-orders): row actions use toasts, spinners, and warned unpaid confirm"
```

---

## Task 6: `OrderActions` (detail page) — toasts, spinner, warned confirm

**Files:**
- Modify: `app/_components/admin/orders/order-actions.tsx` (full rewrite)

> The detail page renders the confirm action through the generic `nextStatus` button (`nextStatus === "CONFIRMED"` for a PENDING order). When that order is unpaid online, route it through the warned `allowUnpaid` path.

- [ ] **Step 1: Rewrite `order-actions.tsx`**

Replace the entire contents of `app/_components/admin/orders/order-actions.tsx` with:

```tsx
"use client";
import {
  bookCourier, advanceStatus, markCodCollected, resendConfirmationEmail, cancelOrder,
} from "@/app/admin/orders/actions";
import { useActionRunner, Spinner } from "./use-action-runner";

type Props = {
  orderId: string; status: string; paymentMethod: string; paymentStatus: string | null;
  courierBooked: boolean; nextStatus: string | null;
};

export function OrderActions(p: Props) {
  const { pending, runningLabel, run } = useActionRunner();
  const unpaidOnline = p.paymentMethod !== "COD" && p.paymentStatus !== "PAID";

  const advance = () => {
    if (!p.nextStatus) return;
    if (p.nextStatus === "CONFIRMED" && unpaidOnline) {
      run("advance", () => advanceStatus(p.orderId, "CONFIRMED", { allowUnpaid: true }),
        "This order isn't paid yet. Confirm and prepare to dispatch anyway?");
    } else {
      run("advance", () => advanceStatus(p.orderId, p.nextStatus!));
    }
  };

  return (
    <div className="space-y-2">
      {p.status === "CONFIRMED" && !p.courierBooked && (
        <button disabled={pending} onClick={() => run("dispatch", () => bookCourier(p.orderId))}
          className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {runningLabel === "dispatch" && <Spinner />} 📦 Book courier (Curfox)
        </button>
      )}
      {p.nextStatus && (
        <button disabled={pending} onClick={advance}
          className="flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          {runningLabel === "advance" && <Spinner />} Mark {p.nextStatus.toLowerCase()}
        </button>
      )}
      {p.paymentMethod === "COD" && p.paymentStatus === "COD_PENDING" && (
        <button disabled={pending} onClick={() => run("cod", () => markCodCollected(p.orderId))}
          className="flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          {runningLabel === "cod" && <Spinner />} Mark COD collected
        </button>
      )}
      <button disabled={pending} onClick={() => run("resend", () => resendConfirmationEmail(p.orderId))}
        className="flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
        {runningLabel === "resend" && <Spinner />} ✉ Resend confirmation
      </button>
      {p.status !== "DELIVERED" && p.status !== "CANCELLED" && (
        <button disabled={pending}
          onClick={() => run("cancel", () => cancelOrder(p.orderId), "Cancel this order and restore stock?")}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50">
          {runningLabel === "cancel" && <Spinner />} Cancel order
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/_components/admin/orders/order-actions.tsx
git commit -m "feat(admin-orders): detail-page actions use toasts, spinners, and warned confirm"
```

---

## Task 7: `OrdersTable` bulk bar — toasts + warn-once before forcing unpaid confirm

**Files:**
- Modify: `app/_components/admin/orders/orders-table.tsx`

- [ ] **Step 1: Update imports**

In `app/_components/admin/orders/orders-table.tsx`, replace the import block (lines 1-9) with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { formatPrice } from "@/app/_lib/format";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "./row-actions";
import { bulkConfirm, bulkDispatch, type BulkResult } from "@/app/admin/orders/actions";
```

- [ ] **Step 2: Replace `runBulk` with toast-based reporting + a dedicated confirm handler**

In the same file, replace the `runBulk` function (lines 36-44) with the following two helpers. `confirmSelected` computes the unpaid-online subset from the already-available row data and warns once before forcing; `dispatchSelected` keeps the existing behavior with toast reporting:

```tsx
  const report = (r: BulkResult, verb: string) => {
    const msg = `${r.okCount} ${verb}, ${r.skippedCount} skipped`;
    if (r.okCount > 0) toast.success(msg);
    else toast.error(msg);
    setSelected(new Set());
    router.refresh();
  };

  const confirmSelected = () =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      const unpaid = rows.filter((o) => selected.has(o.id) && o.paymentMethod !== "COD" && o.paymentStatus !== "PAID");
      if (unpaid.length > 0) {
        if (!window.confirm(`${unpaid.length} of these aren't paid yet. Confirm anyway?`)) return;
        report(await bulkConfirm(ids, { allowUnpaid: true }), "confirmed");
      } else {
        report(await bulkConfirm(ids), "confirmed");
      }
    });

  const dispatchSelected = () =>
    start(async () => {
      const ids = [...selected];
      if (ids.length === 0) return;
      report(await bulkDispatch(ids), "dispatched");
    });
```

- [ ] **Step 3: Wire the bulk-bar buttons to the new handlers**

In the same file, replace the two bulk-bar action buttons (the "Confirm selected" and "Dispatch selected" buttons, lines 51-54) with:

```tsx
          <button disabled={pending} onClick={confirmSelected}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">Confirm selected</button>
          <button disabled={pending} onClick={dispatchSelected}
            className="rounded-md border px-3 py-1 text-xs disabled:opacity-50">Dispatch selected</button>
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: success. (`start` from `useTransition` and `pending` are already in scope; the old `runBulk` is fully removed.)

- [ ] **Step 5: Commit**

```bash
git add app/_components/admin/orders/orders-table.tsx
git commit -m "feat(admin-orders): bulk bar uses toasts and warns before forcing unpaid confirm"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test`
Expected: PASS — all suites, including the new `advanceStatus` and `bulkConfirm` allowUnpaid cases.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: success, no type errors.

- [ ] **Step 3: Manual smoke test (per CLAUDE.md validation)**

Run `npm run dev`, sign in as admin, open `/admin/orders`, and confirm:
- An **unpaid online** (KOKO/MINTPAY/PAYHERE, "Awaiting payment") row now shows an **enabled** Confirm button; clicking it shows the "isn't paid yet — confirm anyway?" prompt; accepting confirms the order, shows a success **toast**, and the row + chip counts update with **no manual refresh**; a spinner shows in the button while it runs.
- A **COD** or **paid** order confirms with **no** payment warning.
- **Dispatch** and **Mark delivered** work and show toasts + spinners.
- **Cancel** still prompts and, on success, toasts; a **cancelled** row shows no Confirm.
- **Bulk**: select a mixed set including unpaid online; "Confirm selected" warns once ("N aren't paid…"); accepting confirms all and toasts an "N confirmed, M skipped" summary; the selection clears.
- **Filters** (all/needs-dispatch/pending-cod/delivered/cancelled, status, payment, sort) and **search** (order#, name, phone, email) all return correct rows; chip counts are correct.
- Double-clicking Confirm does not double-submit (button is disabled while pending).

- [ ] **Step 4: Final commit (if any stray working-tree changes remain)**

```bash
git status
# If clean, nothing to do — all work was committed per task.
```

---

## Self-Review Notes (verified during planning)

- **Spec coverage:** warned unpaid confirm — server (Tasks 1, 2) + clients (Tasks 5, 6, 7); toasts + spinners (Tasks 3, 4, 5, 6, 7); detail-page parity (Task 6); bulk warn-once/force (Task 7); reqs 3/4/6/7/8/10 verified in Task 8 manual smoke. `window.confirm` kept for the two gates (D1); bulk decline aborts (D2 — `confirmSelected` returns early on decline).
- **Type consistency:** `advanceStatus(orderId, to, opts?)` and `bulkConfirm(ids, opts?)` signatures match every call site (Tasks 5, 6, 7); `useActionRunner` returns `{ pending, runningLabel, run }` consumed identically in Tasks 5 and 6; `report`/`confirmSelected`/`dispatchSelected` use `start`/`pending`/`selected`/`rows` already defined in `orders-table.tsx`.
- **No placeholders:** every code step is complete and final.
