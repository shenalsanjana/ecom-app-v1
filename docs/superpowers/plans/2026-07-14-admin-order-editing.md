# Admin Order Editing — Custom Charges, Discounts, Add/Swap Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin add custom charges/discounts to an order, add a new catalog product to an order, and swap an existing line's product/color/size — all reflected in the order total (and thus the COD amount handed to the courier) and in the customer confirmation email.

**Architecture:** One new table (`OrderAdjustment`, signed amount: positive=charge, negative=discount) joins `Order`. `recomputeTotals` becomes adjustment-aware and is the single source of truth for `subtotal/shippingCost/total`, called from every action that changes items or adjustments. Five new/modified server actions in `app/admin/orders/actions.ts` reuse the existing `acquireItemPools`/`restoreItemPools` stock machinery and the same snapshot-at-write pattern checkout already uses. Two new client components (`OrderAdjustments`, `ProductPicker`) extend the existing admin order detail page; `ProductPicker` is shared by both the "add product" and "change product" flows.

**Tech Stack:** Next.js 16 App Router, Prisma (PostgreSQL), Zod, Vitest, plain-Tailwind client components (no UI kit) — matching this codebase's existing admin-orders code exactly.

**Reference:** Design spec at `docs/superpowers/specs/2026-07-14-admin-order-editing-design.md` — read it if a task here seems to contradict it; the spec's decisions win.

## Global Constraints

- **No local database in this dev environment.** Never run `prisma migrate dev`, `npm run db:push`, or `npm run build` (the last fails at static-prerender for DB-touching pages, unrelated to code correctness here). After any `prisma/schema.prisma` change, hand-author the migration SQL yourself (see Task 1) and run `npx prisma generate` (works without a DB) to refresh client types.
- **Type-check gate:** `npx tsc --noEmit` (must exit 0) — use this instead of `npm run build` throughout.
- **Test invocation:** `npm run test -- <exact/path/to/file.test.ts>` for a scoped run; `npm run test` for the full suite. Do not use directory-prefix filters or bare `npx vitest` — both intermittently misreport "no tests" (a known globalSetup quirk, not a real failure — if you hit it, re-run the full suite to confirm nothing is actually broken).
- **Server actions are tested via mocked Prisma**, not a real database — follow the `vi.hoisted` + `vi.mock("@/app/_lib/prisma", ...)` pattern already in `app/admin/orders/__tests__/actions.test.ts` exactly (shown in the tasks below). Admin order UI components have no dedicated unit tests in this codebase today (checked: `app/_components/admin/orders/` has zero `*.test.tsx` files) — new UI components follow that same convention; they're covered by the manual smoke pass in Task 14, not new test infrastructure.
- **Style:** no comments explaining *what* code does; TypeScript strict (no `any`); match the plain-Tailwind, `alert()`-based client-component style already used by `order-items-editor.tsx` / `address-editor.tsx` / `order-notes.tsx` (not the newer `useActionRunner`/toast pattern used by `order-actions.tsx` — this feature extends the older files, so it follows their established convention).
- **Commit after every task** (or every step marked "Commit" below) per `openspec/COMMIT_PROCESS.md` / the `git-spec` skill: Conventional Commits, e.g. `feat(admin-orders): add OrderAdjustment table`.

---

## Task 1: Schema + migration — `OrderAdjustment` table

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714120000_add_order_adjustments/migration.sql`

**Interfaces:**
- Produces: Prisma model `OrderAdjustment { id, orderId, label, amount, createdAt }`, relation `Order.adjustments: OrderAdjustment[]`, client accessor `prisma.orderAdjustment`.

- [ ] **Step 1: Add the `OrderAdjustment` model and the `Order.adjustments` relation**

In `prisma/schema.prisma`, add this model directly after `model OrderNote { ... }` (currently ends around line 284):

```prisma
model OrderAdjustment {
  id        String   @id @default(cuid())
  orderId   String
  label     String
  amount    Float
  createdAt DateTime @default(now())

  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}
```

In `model Order`, add the relation field next to the existing `notesLog` line:

```prisma
  items                 OrderItem[]
  notesLog              OrderNote[]
  adjustments           OrderAdjustment[]
```

- [ ] **Step 2: Hand-author the migration SQL**

Create `prisma/migrations/20260714120000_add_order_adjustments/migration.sql`:

```sql
-- Add OrderAdjustment: admin-entered custom charges/discounts on an order.
-- amount is signed (positive = charge, negative = discount); Order.total is
-- computed as subtotal + shippingCost + sum(adjustments.amount), clamped >= 0.

CREATE TABLE IF NOT EXISTS "OrderAdjustment" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "amount"    DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OrderAdjustment_orderId_idx" ON "OrderAdjustment"("orderId");

DO $$ BEGIN
  ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 3: Regenerate the Prisma client (no DB needed)**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (no consumers of the new model yet, so this just confirms the schema/client generation didn't break anything existing).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260714120000_add_order_adjustments/migration.sql
git commit -m "feat(admin-orders): add OrderAdjustment table"
```

---

## Task 2: Pure helpers — adjustment-aware totals, sign resolution, courier-booked guard

**Files:**
- Modify: `app/_lib/admin-orders.ts`
- Test: `app/_lib/__tests__/admin-orders.test.ts`

**Interfaces:**
- Consumes: nothing new (pure functions only).
- Produces:
  - `export type AdjustmentKind = "CHARGE" | "DISCOUNT"`
  - `export function signedAdjustmentAmount(kind: AdjustmentKind, amount: number): number`
  - `export function courierBookedError(order: { courierBookedAt: Date | null }): string | null`
  - `export function recomputeTotals(items: {price:number;quantity:number}[], city: string, config?: DeliveryConfig, adjustments?: {amount:number}[]): {subtotal:number; shippingCost:number; total:number}` (adjustments param is new; existing call sites with 2-3 args are unaffected since it defaults to `[]`)

- [ ] **Step 1: Write the failing tests**

In `app/_lib/__tests__/admin-orders.test.ts`, extend the existing `describe("recomputeTotals", ...)` block (do not remove its existing three tests) by adding these cases inside it:

```ts
  it("adds a positive adjustment (charge) on top of subtotal+shipping", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo", undefined, [{ amount: 500 }]);
    expect(r).toEqual({ subtotal: 1000, shippingCost: 350, total: 1850 });
  });

  it("subtracts a negative adjustment (discount)", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo", undefined, [{ amount: -300 }]);
    expect(r).toEqual({ subtotal: 1000, shippingCost: 350, total: 1050 });
  });

  it("sums multiple adjustments", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo", undefined, [{ amount: 500 }, { amount: -200 }]);
    expect(r.total).toBe(1650);
  });

  it("clamps total at 0 when discounts exceed subtotal+shipping", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo", undefined, [{ amount: -5000 }]);
    expect(r.total).toBe(0);
  });

  it("defaults to no adjustments when the param is omitted", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo");
    expect(r.total).toBe(1350);
  });
```

Then add two new `describe` blocks at the end of the file:

```ts
import { signedAdjustmentAmount } from "../admin-orders";

describe("signedAdjustmentAmount", () => {
  it("keeps a charge positive", () => {
    expect(signedAdjustmentAmount("CHARGE", 500)).toBe(500);
  });
  it("negates a discount", () => {
    expect(signedAdjustmentAmount("DISCOUNT", 500)).toBe(-500);
  });
});

import { courierBookedError } from "../admin-orders";

describe("courierBookedError", () => {
  it("returns an error once the courier has been booked", () => {
    expect(courierBookedError({ courierBookedAt: new Date() }))
      .toBe("Order already sent to Curfox — cancel/rebook there to make changes.");
  });
  it("returns null when the courier has not been booked", () => {
    expect(courierBookedError({ courierBookedAt: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- app/_lib/__tests__/admin-orders.test.ts`
Expected: FAIL — `signedAdjustmentAmount`/`courierBookedError` not exported, and the new `recomputeTotals` assertions fail (4th param currently ignored/nonexistent).

- [ ] **Step 3: Implement in `app/_lib/admin-orders.ts`**

Replace the existing `recomputeTotals` function with:

```ts
export type AdjustmentKind = "CHARGE" | "DISCOUNT";

export function signedAdjustmentAmount(kind: AdjustmentKind, amount: number): number {
  return kind === "DISCOUNT" ? -amount : amount;
}

export function courierBookedError(order: { courierBookedAt: Date | null }): string | null {
  return order.courierBookedAt
    ? "Order already sent to Curfox — cancel/rebook there to make changes."
    : null;
}

export function recomputeTotals(
  items: { price: number; quantity: number }[],
  city: string,
  config: DeliveryConfig = DEFAULT_DELIVERY_CONFIG,
  adjustments: { amount: number }[] = [],
): { subtotal: number; shippingCost: number; total: number } {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const shippingCost = calculateDelivery(subtotal, zoneForCity(city), config);
  const adjustmentTotal = adjustments.reduce((s, a) => s + a.amount, 0);
  const total = Math.max(0, subtotal + shippingCost + adjustmentTotal);
  return { subtotal, shippingCost, total };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- app/_lib/__tests__/admin-orders.test.ts`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "feat(admin-orders): adjustment-aware totals + courier-booked guard helper"
```

---

## Task 3: Wire adjustments into `editAddress`/`editItems`; block `editItems` once courier-booked

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `recomputeTotals` (4-arg form) and `courierBookedError` from Task 2.
- Produces: `editItems` now rejects once `courierBookedAt` is set; both `editAddress` and `editItems` include and pass through `order.adjustments`.

- [ ] **Step 1: Write the failing tests**

In `app/admin/orders/__tests__/actions.test.ts`, inside `describe("editItems", ...)`, add:

```ts
  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, courierBookedAt: new Date() });
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("includes existing adjustments when recomputing totals", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, adjustments: [{ id: "a1", amount: 500 }] });
    orderUpdate.mockResolvedValueOnce({});
    orderItemUpdate.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    // subtotal 2000 (qty 1 @ 2000), Colombo shipping 350, +500 adjustment = 2850
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 2000, shippingCost: 350, total: 2850 }),
    }));
    expect(res).toEqual({ success: true });
  });
```

In `describe("editAddress", ...)`, add:

```ts
  it("includes existing adjustments when recomputing totals for the new city", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", courierBookedAt: null,
      items: [{ price: 1000, quantity: 1 }],
      adjustments: [{ amount: -200 }],
    });
    orderUpdate.mockResolvedValueOnce({});
    const res = await editAddress("o1", ADDR);
    // subtotal 1000, Kandy shipping 450, -200 adjustment = 1250
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ shippingCost: 450, total: 1250 }),
    }));
    expect(res).toEqual({ success: true });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL on the three new tests (courier guard doesn't exist yet on `editItems`; adjustments aren't fetched/passed yet).

- [ ] **Step 3: Implement in `app/admin/orders/actions.ts`**

Update the import line to pull in the two new helpers:

```ts
import { nextStatuses, applyItemChanges, recomputeTotals, canEdit, canConfirm, courierBookedError, type ItemChange } from "@/app/_lib/admin-orders";
```

In `editAddress`, change the order fetch and the `recomputeTotals` call:

```ts
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.courierBookedAt) return { success: false, error: "Address already sent to Curfox — cancel/rebook there." };

  const totals = recomputeTotals(order.items, parsed.data.city, await getDeliveryConfig(), order.adjustments);
```

In `editItems`, change the order fetch, add the courier guard right after the existing `canEdit` check, and pass adjustments to `recomputeTotals`:

```ts
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, adjustments: true },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };
```

...and further down:

```ts
  const totals = recomputeTotals(next.nextItems, order.shippingCity, await getDeliveryConfig(), order.adjustments);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: PASS, including every pre-existing test in the file (the `ORDER`/`ADDR` fixtures don't set `.adjustments`, so it's `undefined` and `recomputeTotals`'s default parameter turns it into `[]` — totals for old tests are unchanged).

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): apply adjustments to totals; block item edits once courier-booked"
```

---

## Task 4: `addAdjustment` action

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `signedAdjustmentAmount`, `courierBookedError`, `recomputeTotals`, `canEdit` (admin-orders.ts); `PAID` set (already module-local in actions.ts).
- Produces: `export async function addAdjustment(orderId: string, input: { label: string; amount: number; kind: AdjustmentKind }): Promise<ActionResult>`

- [ ] **Step 1: Extend the test file's Prisma mocks**

At the top of `app/admin/orders/__tests__/actions.test.ts`, the second `vi.hoisted` block currently declares `orderFindUnique, orderUpdate, orderDelete, noteCreate, plainStockUpdateMany, plainStockFindUnique, dtfDesignUpdateMany, txn`. Add two more names to that same object (both the destructure and the returned object):

```ts
const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const {
  orderFindUnique, orderUpdate, orderDelete, noteCreate, plainStockUpdateMany, plainStockFindUnique,
  dtfDesignUpdateMany, txn, orderAdjustmentCreate, orderAdjustmentDelete,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderDelete: vi.fn(),
  noteCreate: vi.fn(),
  plainStockUpdateMany: vi.fn(),
  plainStockFindUnique: vi.fn(),
  dtfDesignUpdateMany: vi.fn(),
  txn: vi.fn(),
  orderAdjustmentCreate: vi.fn(),
  orderAdjustmentDelete: vi.fn(),
}));
```

Update the `vi.mock("@/app/_lib/prisma", ...)` block's `client` object (both the module-level one and the one rebuilt inside `beforeEach`'s `txn.mockImplementation`) to add `orderAdjustment`:

```ts
vi.mock("@/app/_lib/prisma", () => {
  const client = {
    order: { findUnique: orderFindUnique, update: orderUpdate, delete: orderDelete },
    orderNote: { create: noteCreate },
    plainTshirtStock: { updateMany: plainStockUpdateMany, findUnique: plainStockFindUnique },
    dtfDesign: { updateMany: dtfDesignUpdateMany },
    orderItem: { update: orderItemUpdate, delete: orderItemDelete },
    orderAdjustment: { create: orderAdjustmentCreate, delete: orderAdjustmentDelete },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(client)) } };
});
```

In `beforeEach`, mirror the same addition inside `txn.mockReset().mockImplementation(...)`'s `client` object, and reset the two new mocks alongside the others:

```ts
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => {
    const client = {
      order: { findUnique: orderFindUnique, update: orderUpdate, delete: orderDelete },
      orderNote: { create: noteCreate },
      plainTshirtStock: { updateMany: plainStockUpdateMany, findUnique: plainStockFindUnique },
      dtfDesign: { updateMany: dtfDesignUpdateMany },
      orderItem: { update: orderItemUpdate, delete: orderItemDelete },
      orderAdjustment: { create: orderAdjustmentCreate, delete: orderAdjustmentDelete },
    };
    return fn(client);
  });
```

Add `orderAdjustmentCreate.mockReset(); orderAdjustmentDelete.mockReset();` next to the other `.mockReset()` calls in `beforeEach`.

- [ ] **Step 2: Write the failing tests**

Add a new `describe` block after `describe("editAddress", ...)`:

```ts
import { addAdjustment } from "../actions";

describe("addAdjustment", () => {
  const BASE = { id: "o1", status: "CONFIRMED", courierBookedAt: null, paymentStatus: "PENDING",
    shippingCity: "Colombo", items: [{ price: 1000, quantity: 1 }], adjustments: [] };

  it("rejects a blank label", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    const res = await addAdjustment("o1", { label: "  ", amount: 500, kind: "CHARGE" });
    expect(res).toEqual({ success: false, error: "Enter a label and a positive amount" });
    expect(orderAdjustmentCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    const res = await addAdjustment("o1", { label: "Rush fee", amount: 0, kind: "CHARGE" });
    expect(res.success).toBe(false);
    expect(orderAdjustmentCreate).not.toHaveBeenCalled();
  });

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, courierBookedAt: new Date() });
    const res = await addAdjustment("o1", { label: "Rush fee", amount: 500, kind: "CHARGE" });
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
  });

  it("stores a charge as a positive amount and recomputes total", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    orderAdjustmentCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});
    const res = await addAdjustment("o1", { label: "Rush fee", amount: 500, kind: "CHARGE" });
    expect(orderAdjustmentCreate).toHaveBeenCalledWith({ data: { orderId: "o1", label: "Rush fee", amount: 500 } });
    // subtotal 1000, Colombo shipping 350, +500 = 1850
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" }, data: expect.objectContaining({ total: 1850 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("stores a discount as a negative amount", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    orderAdjustmentCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});
    const res = await addAdjustment("o1", { label: "Loyalty discount", amount: 200, kind: "DISCOUNT" });
    expect(orderAdjustmentCreate).toHaveBeenCalledWith({ data: { orderId: "o1", label: "Loyalty discount", amount: -200 } });
    expect(res).toEqual({ success: true });
  });

  it("warns when the order was already paid", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, paymentStatus: "PAID" });
    orderAdjustmentCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});
    const res = await addAdjustment("o1", { label: "Rush fee", amount: 500, kind: "CHARGE" });
    expect(res).toEqual({ success: true, warning: "Order was paid — any price difference must be settled manually." });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `addAdjustment` is not exported yet.

- [ ] **Step 4: Implement `addAdjustment` in `app/admin/orders/actions.ts`**

Update the import to also bring in `signedAdjustmentAmount` and the type:

```ts
import { nextStatuses, applyItemChanges, recomputeTotals, canEdit, canConfirm, courierBookedError, signedAdjustmentAmount, type ItemChange, type AdjustmentKind } from "@/app/_lib/admin-orders";
```

Add this after `editItems` (before the `ORDER_INCLUDE` constant):

```ts
const AdjustmentSchema = z.object({
  label: z.string().trim().min(1).max(80),
  amount: z.number().finite().positive(),
  kind: z.enum(["CHARGE", "DISCOUNT"]),
});

export async function addAdjustment(
  orderId: string,
  input: { label: string; amount: number; kind: AdjustmentKind },
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = AdjustmentSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a label and a positive amount" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const amount = signedAdjustmentAmount(parsed.data.kind, parsed.data.amount);
  const totals = recomputeTotals(order.items, order.shippingCity, await getDeliveryConfig(), [...order.adjustments, { amount }]);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderAdjustment.create({ data: { orderId, label: parsed.data.label, amount } });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): add addAdjustment action"
```

---

## Task 5: `removeAdjustment` action

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: same helpers as Task 4; `orderAdjustmentDelete` mock already added in Task 4.
- Produces: `export async function removeAdjustment(orderId: string, adjustmentId: string): Promise<ActionResult>`

- [ ] **Step 1: Write the failing tests**

Add after the `addAdjustment` describe block:

```ts
import { removeAdjustment } from "../actions";

describe("removeAdjustment", () => {
  const BASE = { id: "o1", status: "CONFIRMED", courierBookedAt: null, paymentStatus: "PENDING",
    shippingCity: "Colombo", items: [{ price: 1000, quantity: 1 }],
    adjustments: [{ id: "a1", amount: 500 }, { id: "a2", amount: -100 }] };

  it("rejects an unknown adjustment id", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    const res = await removeAdjustment("o1", "does-not-exist");
    expect(res).toEqual({ success: false, error: "Adjustment not found" });
    expect(orderAdjustmentDelete).not.toHaveBeenCalled();
  });

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, courierBookedAt: new Date() });
    const res = await removeAdjustment("o1", "a1");
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
  });

  it("deletes the row and recomputes total from the remaining adjustments", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    orderAdjustmentDelete.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});
    const res = await removeAdjustment("o1", "a1");
    expect(orderAdjustmentDelete).toHaveBeenCalledWith({ where: { id: "a1" } });
    // subtotal 1000, Colombo shipping 350, remaining adjustment -100 = 1250
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" }, data: expect.objectContaining({ total: 1250 }),
    }));
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `removeAdjustment` not exported.

- [ ] **Step 3: Implement `removeAdjustment` in `app/admin/orders/actions.ts`**

Add directly after `addAdjustment`:

```ts
export async function removeAdjustment(orderId: string, adjustmentId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const target = order.adjustments.find((a) => a.id === adjustmentId);
  if (!target) return { success: false, error: "Adjustment not found" };
  const remaining = order.adjustments.filter((a) => a.id !== adjustmentId);
  const totals = recomputeTotals(order.items, order.shippingCity, await getDeliveryConfig(), remaining);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderAdjustment.delete({ where: { id: adjustmentId } });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): add removeAdjustment action"
```

---

## Task 6: Mailer — render adjustments in the confirmation email

**Files:**
- Modify: `app/_lib/mailer.ts`
- Test: `app/_lib/__tests__/mailer-confirmation.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OrderDetails.adjustments?: { label: string; amount: number }[]` (optional — this task's changes compile and pass standalone with no caller populating it yet); confirmation email (text + HTML) renders one line per adjustment between the item list and Subtotal/Delivery/Total.

- [ ] **Step 1: Write the failing tests**

In `app/_lib/__tests__/mailer-confirmation.test.ts`, add a new describe block:

```ts
import { formatPrice } from "@/app/_lib/format";

describe("sendOrderConfirmationEmail adjustments", () => {
  it("renders charges and discounts as their own lines with signed amounts", async () => {
    const order: OrderDetails = { ...ORDER, adjustments: [{ label: "Rush fee", amount: 500 }, { label: "Loyalty discount", amount: -200 }] };
    await sendOrderConfirmationEmail(order);
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).toContain(`Rush fee: +${formatPrice(500)}`);
    expect(opts.text).toContain(`Loyalty discount: −${formatPrice(200)}`);
    expect(opts.html).toContain("Rush fee");
    expect(opts.html).toContain("Loyalty discount");
  });

  it("omits the adjustments section entirely when there are none", async () => {
    await sendOrderConfirmationEmail(ORDER);
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).not.toContain("Rush fee");
  });
});
```

This follows the same convention `mailer-dispatch.test.ts` already uses (calling `formatPrice()` in the assertion itself rather than hardcoding its output), so the test doesn't depend on knowing the exact locale-formatted string in advance.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- app/_lib/__tests__/mailer-confirmation.test.ts`
Expected: FAIL — `OrderDetails` has no `adjustments` field yet and the template doesn't render it.

- [ ] **Step 3: Implement in `app/_lib/mailer.ts`**

Add the field to `OrderDetails` (after `notes?: string;`):

```ts
  adjustments?: { label: string; amount: number }[];
```

Add two formatting helpers near `formatCustomerItemText`/`formatCustomerItemHtml`:

```ts
function formatAdjustmentText(a: { label: string; amount: number }): string {
  const sign = a.amount < 0 ? "−" : "+";
  return `${a.label}: ${sign}${formatPrice(Math.abs(a.amount))}`;
}

function formatAdjustmentsListText(adjustments: OrderDetails["adjustments"]): string {
  if (!adjustments || adjustments.length === 0) return "";
  return `\n${adjustments.map(formatAdjustmentText).join("\n")}\n`;
}

function formatAdjustmentsListHtml(adjustments: OrderDetails["adjustments"]): string {
  if (!adjustments || adjustments.length === 0) return "";
  return adjustments.map((a) => {
    const sign = a.amount < 0 ? "−" : "+";
    return `<p>${escapeHtml(a.label)}: <strong>${sign}${formatPrice(Math.abs(a.amount))}</strong></p>`;
  }).join("");
}
```

In `sendOrderConfirmationEmail`, insert the adjustments block into the text template between the items list and the Subtotal line:

```
Items:
${itemsListText}
${formatAdjustmentsListText(order.adjustments)}
Subtotal: ${formatPrice(order.subtotal)}
```

And into the HTML template, between the `.items` div and the Subtotal `<p>`:

```html
    </div>
${formatAdjustmentsListHtml(order.adjustments)}
    <p><strong>Subtotal:</strong> ${formatPrice(order.subtotal)}</p>
```

(That closing `</div>` is the existing one that already closes the `.items` block — insert the new line immediately after it, before the `<p><strong>Subtotal:</strong>` line.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- app/_lib/__tests__/mailer-confirmation.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 — `adjustments` is optional on `OrderDetails`, so every existing caller (none of which set it yet) still type-checks.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/mailer.ts app/_lib/__tests__/mailer-confirmation.test.ts
git commit -m "feat(mailer): render order adjustments in the confirmation email"
```

---

## Task 7: `ORDER_INCLUDE`/`toOrderDetails` carry adjustments through

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `OrderDetails.adjustments` (Task 6 — already exists on the type, so this task's mapping type-checks immediately).
- Produces: `toOrderDetails(order)` now populates `OrderDetails.adjustments`.

- [ ] **Step 1: Write the failing test**

In `describe("resendConfirmationEmail", ...)`, add:

```ts
  it("passes adjustments through to the email", async () => {
    orderFindUnique.mockResolvedValueOnce({
      ...FULL_ORDER, trackingCode: "CF-88213",
      adjustments: [{ label: "Rush fee", amount: 500 }, { label: "Loyalty discount", amount: -100 }],
    });
    sendOrderConfirmationEmail.mockResolvedValueOnce(undefined);
    await resendConfirmationEmail("o1");
    const arg = sendOrderConfirmationEmail.mock.calls[0][0];
    expect(arg.adjustments).toEqual([{ label: "Rush fee", amount: 500 }, { label: "Loyalty discount", amount: -100 }]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `arg.adjustments` is `undefined`.

- [ ] **Step 3: Implement in `app/admin/orders/actions.ts`**

Update `ORDER_INCLUDE`:

```ts
const ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: { select: { name: true, color: true, sku: true, size: true, price: true, quantity: true } },
  adjustments: { select: { label: true, amount: true } },
} satisfies Prisma.OrderInclude;
```

Update `toOrderDetails` to add the mapped field (insert right after the `items:` mapping):

```ts
    items: order.items.map((i) => ({
      name: i.name,
      color: i.color,
      sku: i.sku,
      size: i.size,
      price: i.price,
      quantity: i.quantity,
    })),
    adjustments: order.adjustments.map((a) => ({ label: a.label, amount: a.amount })),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 — `toOrderDetails`'s object literal now satisfies `OrderDetails` (the `adjustments` field already exists on the type from Task 6).

- [ ] **Step 6: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): carry adjustments through to OrderDetails"
```

---

## Task 8: `resolveVariantForOrder` helper + `searchProductsForOrder` action

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (all in `actions.ts`):
  - `export type ProductSearchResult = { id: string; name: string; price: number; variants: { id: string; color: string; colorSlug: string; price: number | null; sizes: string[] }[] }`
  - `export async function searchProductsForOrder(query: string): Promise<ProductSearchResult[]>`
  - Private (not exported) `type ResolvedOrderVariant = { productId, productName, productPrice, variantId, color, colorSlug, sku, variantPrice, dtfDesignId, sizes }`, `async function resolveVariantForOrder(productId: string, variantId: string): Promise<ResolvedOrderVariant | null>`, `function validateChosenSize(sizes: string[], size: string | null): string | null` — Tasks 9 and 10 call these three by name.

- [ ] **Step 1: Extend the test file's Prisma mocks**

Add one more mock to the same `vi.hoisted` block extended in Task 4:

```ts
const {
  orderFindUnique, orderUpdate, orderDelete, noteCreate, plainStockUpdateMany, plainStockFindUnique,
  dtfDesignUpdateMany, txn, orderAdjustmentCreate, orderAdjustmentDelete, productFindMany,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderDelete: vi.fn(),
  noteCreate: vi.fn(),
  plainStockUpdateMany: vi.fn(),
  plainStockFindUnique: vi.fn(),
  dtfDesignUpdateMany: vi.fn(),
  txn: vi.fn(),
  orderAdjustmentCreate: vi.fn(),
  orderAdjustmentDelete: vi.fn(),
  productFindMany: vi.fn(),
}));
```

Add `product: { findMany: productFindMany },` to the module-level mock `client` object in `vi.mock("@/app/_lib/prisma", ...)` (the transaction client doesn't need it — `searchProductsForOrder` runs outside a transaction). Add `productFindMany.mockReset();` in `beforeEach`.

- [ ] **Step 2: Write the failing tests**

Add a new describe block:

```ts
import { searchProductsForOrder } from "../actions";

describe("searchProductsForOrder", () => {
  it("returns an empty array for a blank query without hitting the database", async () => {
    const res = await searchProductsForOrder("   ");
    expect(res).toEqual([]);
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it("maps products/variants/sizes into the picker shape", async () => {
    productFindMany.mockResolvedValueOnce([
      {
        id: "p1", name: "Cat Tee", price: 2000,
        variants: [
          { id: "v1", color: "White", colorSlug: "white", price: null, sizeStocks: [{ size: "M" }, { size: "L" }] },
        ],
      },
    ]);
    const res = await searchProductsForOrder("cat");
    expect(productFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { archived: false, name: { contains: "cat", mode: "insensitive" } },
      take: 20,
    }));
    expect(res).toEqual([
      { id: "p1", name: "Cat Tee", price: 2000, variants: [{ id: "v1", color: "White", colorSlug: "white", price: null, sizes: ["M", "L"] }] },
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `searchProductsForOrder` not exported.

- [ ] **Step 4: Implement in `app/admin/orders/actions.ts`**

Add the import for `effectivePrice` at the top:

```ts
import { effectivePrice } from "@/app/_lib/variants";
```

Add this block after `removeAdjustment` (before `ORDER_INCLUDE`):

```ts
export type ProductSearchResult = {
  id: string;
  name: string;
  price: number;
  variants: { id: string; color: string; colorSlug: string; price: number | null; sizes: string[] }[];
};

export async function searchProductsForOrder(query: string): Promise<ProductSearchResult[]> {
  await requireAdmin();
  const q = query.trim();
  if (!q) return [];
  const products = await prisma.product.findMany({
    where: { archived: false, name: { contains: q, mode: "insensitive" } },
    take: 20,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      price: true,
      variants: {
        where: { archived: false },
        orderBy: { sortOrder: "asc" },
        select: { id: true, color: true, colorSlug: true, price: true, sizeStocks: { select: { size: true } } },
      },
    },
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    variants: p.variants.map((v) => ({ id: v.id, color: v.color, colorSlug: v.colorSlug, price: v.price, sizes: v.sizeStocks.map((s) => s.size) })),
  }));
}

type ResolvedOrderVariant = {
  productId: string;
  productName: string;
  productPrice: number;
  variantId: string;
  color: string;
  colorSlug: string;
  sku: string | null;
  variantPrice: number | null;
  dtfDesignId: string | null;
  sizes: string[];
};

async function resolveVariantForOrder(productId: string, variantId: string): Promise<ResolvedOrderVariant | null> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      productId: true,
      color: true,
      colorSlug: true,
      sku: true,
      price: true,
      sizeStocks: { select: { size: true } },
      product: { select: { id: true, name: true, price: true, dtfDesignId: true, archived: true } },
    },
  });
  if (!variant || variant.productId !== productId || variant.product.archived) return null;
  return {
    productId: variant.product.id,
    productName: variant.product.name,
    productPrice: variant.product.price,
    variantId: variant.id,
    color: variant.color,
    colorSlug: variant.colorSlug,
    sku: variant.sku,
    variantPrice: variant.price,
    dtfDesignId: variant.product.dtfDesignId,
    sizes: variant.sizeStocks.map((s) => s.size),
  };
}

function validateChosenSize(sizes: string[], size: string | null): string | null {
  if (sizes.length === 0) return size ? "This color has no sizes to choose from" : null;
  if (!size || !sizes.includes(size)) return `Size "${size ?? ""}" is not offered for this color`;
  return null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (`resolveVariantForOrder`/`validateChosenSize` are unused at this point — TypeScript does not error on unused top-level functions, only unused local variables/imports, so this is fine; they'll be consumed by Tasks 9–10).

- [ ] **Step 7: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): add product search + variant-resolution helpers for order editing"
```

---

## Task 9: `addOrderItem` action

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `resolveVariantForOrder`, `validateChosenSize` (Task 8, same file); `acquireItemPools` (`app/_lib/inventory-pools.ts`, already imported in this file); `effectivePrice` (Task 8 import).
- Produces: private (not exported) `const ProductItemSchema = z.object({ productId, variantId, size: string|null, quantity })` — reused as-is by Task 10; `export async function addOrderItem(orderId: string, input: { productId: string; variantId: string; size: string | null; quantity: number }): Promise<ActionResult>`

- [ ] **Step 1: Extend the test file's Prisma mocks**

Add `variantFindUnique` and `orderItemCreate` to the same hoisted block (extend the object from Task 8):

```ts
const {
  orderFindUnique, orderUpdate, orderDelete, noteCreate, plainStockUpdateMany, plainStockFindUnique,
  dtfDesignUpdateMany, txn, orderAdjustmentCreate, orderAdjustmentDelete, productFindMany, variantFindUnique,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderDelete: vi.fn(),
  noteCreate: vi.fn(),
  plainStockUpdateMany: vi.fn(),
  plainStockFindUnique: vi.fn(),
  dtfDesignUpdateMany: vi.fn(),
  txn: vi.fn(),
  orderAdjustmentCreate: vi.fn(),
  orderAdjustmentDelete: vi.fn(),
  productFindMany: vi.fn(),
  variantFindUnique: vi.fn(),
}));
```

Add `orderItemCreate` to the existing second hoisted block (`orderItemUpdate, orderItemDelete`):

```ts
const { orderItemUpdate, orderItemDelete, orderItemCreate } = vi.hoisted(() => ({
  orderItemUpdate: vi.fn(),
  orderItemDelete: vi.fn(),
  orderItemCreate: vi.fn(),
}));
```

Add `productVariant: { findUnique: variantFindUnique },` and change `orderItem: { update: orderItemUpdate, delete: orderItemDelete }` to `orderItem: { update: orderItemUpdate, delete: orderItemDelete, create: orderItemCreate }` in **both** places the `client` object is built (the module-level `vi.mock` and the `beforeEach` `txn.mockImplementation`). Add `variantFindUnique.mockReset(); orderItemCreate.mockReset();` in `beforeEach`.

- [ ] **Step 2: Write the failing tests**

```ts
import { addOrderItem } from "../actions";

describe("addOrderItem", () => {
  const BASE = { id: "o1", status: "CONFIRMED", courierBookedAt: null, paymentStatus: "PENDING",
    shippingCity: "Colombo", items: [{ price: 1000, quantity: 1 }], adjustments: [] };
  const VARIANT = {
    id: "v1", productId: "p1", color: "White", colorSlug: "white", sku: "DB-CAT-WHT", price: null,
    sizeStocks: [{ size: "M" }, { size: "L" }],
    product: { id: "p1", name: "Cat Tee", price: 2000, dtfDesignId: "d1", archived: false },
  };

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, courierBookedAt: new Date() });
    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "M", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
  });

  it("rejects a variant that doesn't belong to the given product", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce({ ...VARIANT, productId: "other-product" });
    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "M", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Selected product/color is no longer available" });
  });

  it("rejects a size not offered by the variant", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "XXL", quantity: 1 });
    expect(res).toEqual({ success: false, error: 'Size "XXL" is not offered for this color' });
  });

  it("resolves the color+size pool, acquires stock, creates the line, and recomputes totals", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    plainStockFindUnique.mockResolvedValueOnce({ id: "ps-white-m" });
    orderItemCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});

    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "M", quantity: 2 });

    expect(plainStockFindUnique).toHaveBeenCalledWith({ where: { colorSlug_size: { colorSlug: "white", size: "M" } }, select: { id: true } });
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps-white-m", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } } });
    expect(dtfDesignUpdateMany).toHaveBeenCalledWith({ where: { id: "d1", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } } });
    expect(orderItemCreate).toHaveBeenCalledWith({
      data: {
        orderId: "o1", productId: "p1", variantId: "v1", color: "White", sku: "DB-CAT-WHT",
        name: "Cat Tee", size: "M", price: 2000, quantity: 2,
        plainTshirtStockId: "ps-white-m", dtfDesignId: "d1",
      },
    });
    // subtotal 1000 (existing) + 2000*2 (new) = 5000, at/above 5000 free-shipping threshold -> 0
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" }, data: expect.objectContaining({ subtotal: 5000, shippingCost: 0, total: 5000 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("fails when the stock acquire has insufficient quantity, without creating the line", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    plainStockFindUnique.mockResolvedValueOnce({ id: "ps-white-m" });
    plainStockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: "M", quantity: 50 });

    expect(res).toEqual({ success: false, error: 'Insufficient stock for "Cat Tee"' });
    expect(orderItemCreate).not.toHaveBeenCalled();
  });

  it("adds a sizeless item without touching the plain-tee pool", async () => {
    const sizelessVariant = { ...VARIANT, sizeStocks: [] };
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(sizelessVariant);
    orderItemCreate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});

    const res = await addOrderItem("o1", { productId: "p1", variantId: "v1", size: null, quantity: 1 });

    expect(plainStockFindUnique).not.toHaveBeenCalled();
    expect(plainStockUpdateMany).not.toHaveBeenCalled();
    expect(orderItemCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ size: null, plainTshirtStockId: null }),
    }));
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `addOrderItem` not exported.

- [ ] **Step 4: Implement `addOrderItem` in `app/admin/orders/actions.ts`**

Add this after `validateChosenSize` (from Task 8):

```ts
const ProductItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  size: z.string().trim().min(1).nullable(),
  quantity: z.number().int().positive(),
});

export async function addOrderItem(
  orderId: string,
  input: { productId: string; variantId: string; size: string | null; quantity: number },
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Pick a product, color, size, and quantity" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const resolved = await resolveVariantForOrder(parsed.data.productId, parsed.data.variantId);
  if (!resolved) return { success: false, error: "Selected product/color is no longer available" };
  const sizeError = validateChosenSize(resolved.sizes, parsed.data.size);
  if (sizeError) return { success: false, error: sizeError };

  const plainRow = parsed.data.size
    ? await prisma.plainTshirtStock.findUnique({
        where: { colorSlug_size: { colorSlug: resolved.colorSlug, size: parsed.data.size } },
        select: { id: true },
      })
    : null;
  const price = effectivePrice({ price: resolved.variantPrice }, { price: resolved.productPrice });
  const totals = recomputeTotals(
    [...order.items, { price, quantity: parsed.data.quantity }],
    order.shippingCity,
    await getDeliveryConfig(),
    order.adjustments,
  );

  try {
    await prisma.$transaction(async (tx) => {
      await acquireItemPools(tx, {
        plainTshirtStockId: plainRow?.id ?? null,
        dtfDesignId: resolved.dtfDesignId,
        quantity: parsed.data.quantity,
        name: resolved.productName,
      });
      await tx.orderItem.create({
        data: {
          orderId,
          productId: resolved.productId,
          variantId: resolved.variantId,
          color: resolved.color,
          sku: resolved.sku,
          name: resolved.productName,
          size: parsed.data.size,
          price,
          quantity: parsed.data.quantity,
          plainTshirtStockId: plainRow?.id ?? null,
          dtfDesignId: resolved.dtfDesignId,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to add product" };
  }
  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): add addOrderItem action"
```

---

## Task 10: `swapOrderItem` action

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `resolveVariantForOrder`, `validateChosenSize` (Task 8); `ProductItemSchema` (Task 9, same file); `restoreItemPools`/`acquireItemPools` (`app/_lib/inventory-pools.ts`, already imported); `effectivePrice` (Task 8 import).
- Produces: `export async function swapOrderItem(orderId: string, itemId: string, input: { productId: string; variantId: string; size: string | null; quantity: number }): Promise<ActionResult>`

- [ ] **Step 1: Write the failing tests**

```ts
import { swapOrderItem } from "../actions";

describe("swapOrderItem", () => {
  const BASE = {
    id: "o1", status: "CONFIRMED", courierBookedAt: null, paymentStatus: "PENDING", shippingCity: "Colombo",
    items: [{ id: "i1", price: 2000, quantity: 1, plainTshirtStockId: "ps-old", dtfDesignId: "d-old" }],
    adjustments: [],
  };
  const VARIANT = {
    id: "v2", productId: "p2", color: "Black", colorSlug: "black", sku: "DB-DOG-BLK", price: null,
    sizeStocks: [{ size: "S" }, { size: "M" }],
    product: { id: "p2", name: "Dog Tee", price: 1800, dtfDesignId: "d-new", archived: false },
  };

  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...BASE, courierBookedAt: new Date() });
    const res = await swapOrderItem("o1", "i1", { productId: "p2", variantId: "v2", size: "S", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Order already sent to Curfox — cancel/rebook there to make changes." });
  });

  it("rejects an unknown order item id", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    const res = await swapOrderItem("o1", "does-not-exist", { productId: "p2", variantId: "v2", size: "S", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Order item not found" });
  });

  it("restores the old line's pools, resolves the new variant's pools fresh, and updates the row in place", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    plainStockFindUnique.mockResolvedValueOnce({ id: "ps-black-s" });
    orderItemUpdate.mockResolvedValueOnce({});
    orderUpdate.mockResolvedValueOnce({});

    const res = await swapOrderItem("o1", "i1", { productId: "p2", variantId: "v2", size: "S", quantity: 3 });

    expect(plainStockUpdateMany).toHaveBeenNthCalledWith(1, { where: { id: "ps-old" }, data: { quantity: { increment: 1 } } });
    expect(dtfDesignUpdateMany).toHaveBeenNthCalledWith(1, { where: { id: "d-old" }, data: { quantity: { increment: 1 } } });
    expect(plainStockFindUnique).toHaveBeenCalledWith({ where: { colorSlug_size: { colorSlug: "black", size: "S" } }, select: { id: true } });
    expect(plainStockUpdateMany).toHaveBeenNthCalledWith(2, { where: { id: "ps-black-s", quantity: { gte: 3 } }, data: { quantity: { decrement: 3 } } });
    expect(orderItemUpdate).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: {
        productId: "p2", variantId: "v2", color: "Black", sku: "DB-DOG-BLK",
        name: "Dog Tee", size: "S", price: 1800, quantity: 3,
        plainTshirtStockId: "ps-black-s", dtfDesignId: "d-new",
      },
    });
    // subtotal 1800*3 = 5400, at/above free-shipping threshold -> 0
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" }, data: expect.objectContaining({ subtotal: 5400, shippingCost: 0, total: 5400 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("fails when the new variant has insufficient stock, leaving the original row untouched", async () => {
    orderFindUnique.mockResolvedValueOnce(BASE);
    variantFindUnique.mockResolvedValueOnce(VARIANT);
    plainStockFindUnique.mockResolvedValueOnce({ id: "ps-black-s" });
    plainStockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // restore of the old line always succeeds
      .mockResolvedValueOnce({ count: 0 }); // acquiring the new line fails

    const res = await swapOrderItem("o1", "i1", { productId: "p2", variantId: "v2", size: "S", quantity: 3 });

    expect(res).toEqual({ success: false, error: 'Insufficient stock for "Dog Tee"' });
    expect(orderItemUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `swapOrderItem` not exported.

- [ ] **Step 3: Implement `swapOrderItem` in `app/admin/orders/actions.ts`**

Add directly after `addOrderItem`:

```ts
export async function swapOrderItem(
  orderId: string,
  itemId: string,
  input: { productId: string; variantId: string; size: string | null; quantity: number },
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductItemSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Pick a product, color, size, and quantity" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, adjustments: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };
  const courierError = courierBookedError(order);
  if (courierError) return { success: false, error: courierError };

  const original = order.items.find((i) => i.id === itemId);
  if (!original) return { success: false, error: "Order item not found" };

  const resolved = await resolveVariantForOrder(parsed.data.productId, parsed.data.variantId);
  if (!resolved) return { success: false, error: "Selected product/color is no longer available" };
  const sizeError = validateChosenSize(resolved.sizes, parsed.data.size);
  if (sizeError) return { success: false, error: sizeError };

  const plainRow = parsed.data.size
    ? await prisma.plainTshirtStock.findUnique({
        where: { colorSlug_size: { colorSlug: resolved.colorSlug, size: parsed.data.size } },
        select: { id: true },
      })
    : null;
  const price = effectivePrice({ price: resolved.variantPrice }, { price: resolved.productPrice });
  const nextItems = order.items.map((i) => (i.id === itemId ? { price, quantity: parsed.data.quantity } : i));
  const totals = recomputeTotals(nextItems, order.shippingCity, await getDeliveryConfig(), order.adjustments);

  try {
    await prisma.$transaction(async (tx) => {
      await restoreItemPools(tx, original);
      await acquireItemPools(tx, {
        plainTshirtStockId: plainRow?.id ?? null,
        dtfDesignId: resolved.dtfDesignId,
        quantity: parsed.data.quantity,
        name: resolved.productName,
      });
      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          productId: resolved.productId,
          variantId: resolved.variantId,
          color: resolved.color,
          sku: resolved.sku,
          name: resolved.productName,
          size: parsed.data.size,
          price,
          quantity: parsed.data.quantity,
          plainTshirtStockId: plainRow?.id ?? null,
          dtfDesignId: resolved.dtfDesignId,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to change product" };
  }
  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + type-check**

Run: `npm run test`
Expected: PASS, full suite (all `app/admin/orders/actions.ts` server actions now covered).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): add swapOrderItem action"
```

---

## Task 11: `OrderAdjustments` UI panel

**Files:**
- Create: `app/_components/admin/orders/order-adjustments.tsx`
- Modify: `app/_lib/admin-orders.ts` (`getOrderDetail` — include `adjustments`)
- Modify: `app/admin/orders/[id]/page.tsx` (render the new panel + the Adjustments totals line)

**Interfaces:**
- Consumes: `addAdjustment`, `removeAdjustment` (Task 4/5); `formatPrice` (`app/_lib/format.ts`).
- Produces: `export function OrderAdjustments({ orderId, adjustments, editable }: { orderId: string; adjustments: { id: string; label: string; amount: number }[]; editable: boolean }): JSX.Element`

- [ ] **Step 1: Include adjustments in `getOrderDetail`**

In `app/_lib/admin-orders.ts`, update `getOrderDetail`:

```ts
export async function getOrderDetail(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      items: { include: { variant: { select: { sizeStocks: { select: { size: true } } } } } },
      notesLog: { orderBy: { createdAt: "desc" } },
      adjustments: { orderBy: { createdAt: "asc" } },
    },
  });
}
```

- [ ] **Step 2: Create the component**

Create `app/_components/admin/orders/order-adjustments.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAdjustment, removeAdjustment } from "@/app/admin/orders/actions";
import { formatPrice } from "@/app/_lib/format";

type Adjustment = { id: string; label: string; amount: number };

export function OrderAdjustments({ orderId, adjustments, editable }: { orderId: string; adjustments: Adjustment[]; editable: boolean }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"CHARGE" | "DISCOUNT">("CHARGE");
  const [pending, start] = useTransition();
  const router = useRouter();

  function add() {
    const parsedAmount = Number(amount);
    start(async () => {
      const r = await addAdjustment(orderId, { label, amount: parsedAmount, kind });
      if (r.success) { setLabel(""); setAmount(""); } else { alert(r.error); }
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const r = await removeAdjustment(orderId, id);
      if (!r.success) alert(r.error);
      router.refresh();
    });
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Adjustments</h4>
      {adjustments.length === 0 && <p className="text-sm text-muted-foreground">No custom charges or discounts.</p>}
      <ul className="space-y-1 text-sm">
        {adjustments.map((a) => (
          <li key={a.id} className="flex items-center justify-between">
            <span>{a.label}</span>
            <span className="flex items-center gap-2">
              <span>{a.amount < 0 ? "−" : "+"}{formatPrice(Math.abs(a.amount))}</span>
              {editable && <button className="text-destructive" disabled={pending} onClick={() => remove(a.id)}>✕</button>}
            </span>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="mt-2 space-y-1 border-t pt-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => setKind("CHARGE")}
              className={`rounded border px-2 py-1 text-xs ${kind === "CHARGE" ? "bg-primary text-primary-foreground" : ""}`}>Charge</button>
            <button type="button" onClick={() => setKind("DISCOUNT")}
              className={`rounded border px-2 py-1 text-xs ${kind === "DISCOUNT" ? "bg-primary text-primary-foreground" : ""}`}>Discount</button>
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Rush fee)"
            className="w-full rounded border px-2 py-1 text-sm" />
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount"
            className="w-full rounded border px-2 py-1 text-sm" />
          <button disabled={pending || !label.trim() || !amount} onClick={add}
            className="rounded-md border px-3 py-1 text-sm">Add {kind === "CHARGE" ? "charge" : "discount"}</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the order detail page**

In `app/admin/orders/[id]/page.tsx`, add the import:

```tsx
import { OrderAdjustments } from "@/app/_components/admin/orders/order-adjustments";
```

Add the Adjustments panel as a new card, right after the items card's closing `</div>` (i.e. as a sibling before the "Internal notes" card, inside the `md:col-span-2` column):

```tsx
          <div className="rounded-lg border p-4">
            <OrderAdjustments orderId={order.id} editable={canEditOrder}
              adjustments={order.adjustments.map((a) => ({ id: a.id, label: a.label, amount: a.amount }))} />
          </div>
```

Add the Adjustments line to the existing totals block (between Shipping and Total):

```tsx
            <div className="mt-3 border-t pt-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>{formatPrice(order.shippingCost)}</span></div>
              {order.adjustments.length > 0 && (
                <div className="flex justify-between">
                  <span>Adjustments</span>
                  <span>{formatPrice(order.adjustments.reduce((s, a) => s + a.amount, 0))}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatPrice(order.total)}</span></div>
            </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_components/admin/orders/order-adjustments.tsx app/admin/orders/[id]/page.tsx
git commit -m "feat(admin-orders): add Adjustments panel to the order detail page"
```

---

## Task 12: `ProductPicker` shared component

**Files:**
- Create: `app/_components/admin/orders/product-picker.tsx`

**Interfaces:**
- Consumes: `searchProductsForOrder`, `ProductSearchResult` (Task 8).
- Produces: `export type ProductPickerSelection = { productId: string; variantId: string; size: string | null; quantity: number }`, `export function ProductPicker({ onConfirm, confirmLabel, initialQuantity, disabled }: { onConfirm: (s: ProductPickerSelection) => void; confirmLabel: string; initialQuantity?: number; disabled?: boolean }): JSX.Element` — consumed by Task 13.

- [ ] **Step 1: Create the component**

Create `app/_components/admin/orders/product-picker.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { searchProductsForOrder, type ProductSearchResult } from "@/app/admin/orders/actions";

export type ProductPickerSelection = { productId: string; variantId: string; size: string | null; quantity: number };

export function ProductPicker({
  onConfirm, confirmLabel, initialQuantity, disabled,
}: {
  onConfirm: (selection: ProductPickerSelection) => void;
  confirmLabel: string;
  initialQuantity?: number;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [product, setProduct] = useState<ProductSearchResult | null>(null);
  const [variantId, setVariantId] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(initialQuantity ?? 1);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const t = setTimeout(() => { searchProductsForOrder(q).then(setResults); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const variant = product?.variants.find((v) => v.id === variantId) ?? null;

  function reset() {
    setQuery(""); setResults([]); setProduct(null); setVariantId(""); setSize(""); setQuantity(initialQuantity ?? 1);
  }

  function confirm() {
    if (!product || !variant) return;
    if (variant.sizes.length > 0 && !size) return;
    onConfirm({ productId: product.id, variantId: variant.id, size: variant.sizes.length > 0 ? size : null, quantity });
    reset();
  }

  if (!product) {
    return (
      <div className="space-y-1">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…"
          className="w-full rounded border px-2 py-1 text-sm" disabled={disabled} />
        {results.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded border text-sm">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" className="block w-full px-2 py-1 text-left hover:bg-secondary" onClick={() => setProduct(p)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{product.name}</span>
        <button type="button" className="text-xs text-muted-foreground" onClick={reset}>Change</button>
      </div>
      <select value={variantId} onChange={(e) => { setVariantId(e.target.value); setSize(""); }}
        className="w-full rounded border px-2 py-1 text-sm">
        <option value="">Choose color…</option>
        {product.variants.map((v) => <option key={v.id} value={v.id}>{v.color}</option>)}
      </select>
      {variant && variant.sizes.length > 0 && (
        <select value={size} onChange={(e) => setSize(e.target.value)} className="w-full rounded border px-2 py-1 text-sm">
          <option value="">Choose size…</option>
          {variant.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}
        className="w-full rounded border px-2 py-1 text-sm" />
      <button type="button" disabled={disabled || !variant || (variant.sizes.length > 0 && !size)} onClick={confirm}
        className="w-full rounded-md bg-primary px-2 py-1 text-sm text-primary-foreground disabled:opacity-50">
        {confirmLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (component isn't imported anywhere yet, so this just confirms it compiles standalone).

- [ ] **Step 3: Commit**

```bash
git add app/_components/admin/orders/product-picker.tsx
git commit -m "feat(admin-orders): add shared ProductPicker component"
```

---

## Task 13: Wire `ProductPicker` into `OrderItemsEditor` (add product + change product)

**Files:**
- Modify: `app/_components/admin/orders/order-items-editor.tsx`

**Interfaces:**
- Consumes: `addOrderItem`, `swapOrderItem` (Tasks 9/10); `ProductPicker`, `ProductPickerSelection` (Task 12).
- Produces: no new exports — `OrderItemsEditor`'s existing props (`orderId`, `items`, `editable`) are unchanged.

- [ ] **Step 1: Replace the full file content**

Replace all of `app/_components/admin/orders/order-items-editor.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editItems, addOrderItem, swapOrderItem } from "@/app/admin/orders/actions";
import { formatPrice } from "@/app/_lib/format";
import type { ItemChange } from "@/app/_lib/admin-orders";
import { ProductPicker, type ProductPickerSelection } from "./product-picker";

type Item = {
  id: string; name: string; size: string | null; color: string | null; sku: string | null;
  price: number; quantity: number; sizes: string;
};

export function OrderItemsEditor({ orderId, items, editable }: { orderId: string; items: Item[]; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items);
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    const changes: ItemChange[] = [];
    for (const orig of items) {
      const d = draft.find((x) => x.id === orig.id);
      if (!d) { changes.push({ id: orig.id, remove: true }); continue; }
      if (d.quantity !== orig.quantity) changes.push({ id: orig.id, quantity: d.quantity });
      if (d.size !== orig.size) changes.push({ id: orig.id, size: d.size });
    }
    start(async () => {
      const r = await editItems(orderId, changes);
      alert(r.success ? (r.warning ?? "Saved") : r.error);
      if (r.success) setEditing(false);
      router.refresh();
    });
  }

  function runSwap(itemId: string, selection: ProductPickerSelection) {
    start(async () => {
      const r = await swapOrderItem(orderId, itemId, selection);
      alert(r.success ? (r.warning ?? "Saved") : r.error);
      if (r.success) setSwappingId(null);
      router.refresh();
    });
  }

  function runAdd(selection: ProductPickerSelection) {
    start(async () => {
      const r = await addOrderItem(orderId, selection);
      alert(r.success ? (r.warning ?? "Saved") : r.error);
      if (r.success) setAdding(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Items · {draft.length}</h4>
        {editable && <button onClick={() => setEditing((v) => !v)} className="text-xs text-primary">{editing ? "Cancel" : "✎ Edit"}</button>}
      </div>
      <ul className="mt-2 space-y-2">
        {draft.map((it) => (
          <li key={it.id}>
            {swappingId === it.id ? (
              <div className="rounded border p-2">
                <ProductPicker
                  confirmLabel="Change product"
                  initialQuantity={it.quantity}
                  disabled={pending}
                  onConfirm={(selection) => runSwap(it.id, selection)}
                />
                <button type="button" className="mt-1 text-xs text-muted-foreground" onClick={() => setSwappingId(null)}>Cancel</button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="block">{it.name}{it.size ? ` · ${it.size}` : ""}</span>
                  <span className="block text-xs text-muted-foreground">Color: {it.color ?? "—"} · SKU: {it.sku ?? "—"}</span>
                </span>
                {editing ? (
                  <span className="flex items-center gap-2">
                    {(() => {
                      const sizeOptions = it.sizes ? it.sizes.split(",").map((s) => s.trim()).filter(Boolean) : [];
                      return sizeOptions.length > 0 ? (
                        <select
                          value={it.size ?? ""}
                          className="rounded border px-1 text-sm"
                          onChange={(e) => setDraft((d) => d.map((x) => x.id === it.id ? { ...x, size: e.target.value || null } : x))}
                        >
                          {sizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : null;
                    })()}
                    <input type="number" min={1} value={it.quantity} className="w-14 rounded border px-1"
                      onChange={(e) => setDraft((d) => d.map((x) => x.id === it.id ? { ...x, quantity: Number(e.target.value) } : x))} />
                    <button className="text-destructive" onClick={() => setDraft((d) => d.filter((x) => x.id !== it.id))}>✕</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span>×{it.quantity} @ {formatPrice(it.price)} = {formatPrice(it.price * it.quantity)}</span>
                    {editable && (
                      <button type="button" className="text-xs text-primary" onClick={() => setSwappingId(it.id)}>⇄ Change product</button>
                    )}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing && <button disabled={pending} onClick={save} className="mt-3 rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground">Save changes</button>}
      {editable && !editing && (
        <div className="mt-3 border-t pt-2">
          {adding ? (
            <div className="rounded border p-2">
              <ProductPicker confirmLabel="Add product" disabled={pending} onConfirm={runAdd} />
              <button type="button" className="mt-1 text-xs text-muted-foreground" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="text-xs text-primary" onClick={() => setAdding(true)}>+ Add product</button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: PASS, full suite.

- [ ] **Step 4: Commit**

```bash
git add app/_components/admin/orders/order-items-editor.tsx
git commit -m "feat(admin-orders): wire add/change product into the order items editor"
```

---

## Task 14: Final validation + manual smoke pass

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: PASS — every test file, including all of `app/admin/orders/__tests__/actions.test.ts`, `app/_lib/__tests__/admin-orders.test.ts`, `app/_lib/__tests__/mailer-confirmation.test.ts`.

- [ ] **Step 3: Confirm the migration is present for the user to apply**

Run: `git log --oneline -1 -- prisma/migrations/20260714120000_add_order_adjustments/migration.sql`
Expected: shows the Task 1 commit. This repo has no local database (see Global Constraints) — the migration applies automatically via `.github/workflows/migrate.yml` on merge to `main`, or the user can run `npm run db:deploy` locally against their real `DATABASE_URL`. Tell the user this explicitly when handing off; do not attempt to apply it yourself.

- [ ] **Step 4: Manual smoke checklist (report to the user — cannot be run headlessly without a live DB/browser)**

On a PENDING or CONFIRMED order in `/admin/orders/[id]`:
1. Add a charge (e.g. "Rush fee", 500) and confirm Total increases by 500 and the Adjustments totals line appears.
2. Add a discount (e.g. "Loyalty discount", 200) and confirm Total decreases by 200.
3. Remove one adjustment and confirm Total recomputes correctly; remove the last one and confirm the Adjustments totals line disappears.
4. Click "+ Add product", search for a product, pick a color/size/quantity, add it — confirm the new line appears, stock decremented (check via the Inventory admin section), and Total updated.
5. Click "⇄ Change product" on an existing line, swap to a different product/color/size — confirm the old line's stock is restored, the new selection's stock is decremented, and the line updates in place (same row, not a duplicate).
6. Book the order with Curfox (or, in a non-prod DB, manually set `courierBookedAt`) and confirm all five actions (add/remove adjustment, quantity/size edit, add product, change product) now reject with "Order already sent to Curfox — cancel/rebook there to make changes."
7. Click "Resend confirmation email" and confirm the email (check server logs / a test SMTP sink) itemizes the adjustments between the item list and the Subtotal line.

- [ ] **Step 5: Report status to the user**

Summarize: all automated checks passed (`tsc`, `npm run test`), migration is committed and awaiting deploy, manual browser verification is outstanding and needs to be done by the user (or a follow-up session with DB/browser access).
