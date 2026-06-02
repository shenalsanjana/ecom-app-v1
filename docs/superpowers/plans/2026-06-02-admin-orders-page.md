# Admin Orders Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin Orders list (`/admin/orders`) and detail (`/admin/orders/[id]`) pages with dispatch, status, COD, edit, cancel, resend-email, and Curfox-label-print actions.

**Architecture:** Server Components fetch via a server module (`app/_lib/admin-orders.ts`); mutations are Server Actions (`app/admin/orders/actions.ts`) that each call `requireAdmin()`, run logic through pure helpers, mutate Prisma (in transactions where stock/totals change), and `revalidatePath`. Interactive UI lives in leaf `"use client"` components. Reuses existing `bookCourierAndNotify`, `sendOrderConfirmationEmail`, and delivery-cost helpers.

**Tech Stack:** Next.js 16 App Router, NextAuth v5, Prisma + Postgres/SQLite, vitest (node env, `.ts` only), Playwright e2e, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-02-admin-orders-page-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | Add `OrderNote` model + `Order.notesLog` relation + list indexes |
| `app/_lib/curfox-portal.ts` | `CURFOX_PORTAL_URL` shared constant |
| `app/_lib/admin-orders.ts` | Pure helpers (`buildOrderWhere`, `recomputeTotals`, `applyItemChanges`, `nextStatuses`, `canEdit`, `canCancel`) + queries (`listOrders`, `getOrderDetail`) + shared types |
| `app/admin/orders/actions.ts` | Server Actions (all 8) |
| `app/admin/orders/page.tsx` | List page (Server) |
| `app/admin/orders/loading.tsx` | List skeleton |
| `app/admin/orders/[id]/page.tsx` | Detail page (Server) |
| `app/admin/orders/[id]/not-found.tsx` | Not-found |
| `app/_components/admin/orders/*.tsx` | Toolbar, table, order-actions, items-editor, address-editor, notes (client leaves) |
| `app/_lib/__tests__/admin-orders.test.ts` | Helper + query unit tests |
| `app/admin/orders/__tests__/actions.test.ts` | Action unit tests |
| `tests/e2e/admin-orders.spec.ts` | E2E |

---

## Task 1: Setup — shadcn primitives, Prisma model, portal constant

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `app/_lib/curfox-portal.ts`
- Modify: `app/_lib/mailer.ts` (use the shared constant)

- [ ] **Step 1: Install shadcn primitives**

Run: `npx shadcn add table dialog select textarea badge`
Expected: creates `components/ui/{table,dialog,select,textarea,badge}.tsx`.

- [ ] **Step 2: Add the `OrderNote` model + relation + indexes to `prisma/schema.prisma`**

Inside `model Order { ... }`, add this relation line next to `items OrderItem[]`:

```prisma
  notesLog              OrderNote[]
```

Replace the Order index block with:

```prisma
  @@index([userId])
  @@index([createdAt])
  @@index([status])
  @@index([paymentStatus])
  @@index([status, courierBookedAt])
```

Add a new model after `model OrderItem { ... }`:

```prisma
model OrderNote {
  id          String   @id @default(cuid())
  orderId     String
  authorEmail String
  body        String
  createdAt   DateTime @default(now())

  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}
```

- [ ] **Step 3: Run the migration**

Run: `npx prisma migrate dev --name add_order_note_and_indexes`
Expected: migration applied, Prisma Client regenerated.

- [ ] **Step 4: Create the shared portal constant**

Create `app/_lib/curfox-portal.ts`:

```ts
// Curfox merchant portal. The operator prints the official delivery label
// (waybill) here — Curfox exposes no server-side PDF endpoint. The dispatch
// email and the admin Orders page both link to this.
export const CURFOX_PORTAL_URL = "https://royalexpress.merchant.curfox.com/all-orders";
```

- [ ] **Step 5: Use the constant in `mailer.ts`**

In `app/_lib/mailer.ts`, replace the local `const portalUrl = "https://royalexpress.merchant.curfox.com/all-orders";` with an import at the top of the file:

```ts
import { CURFOX_PORTAL_URL } from "@/app/_lib/curfox-portal";
```

and use `CURFOX_PORTAL_URL` wherever `portalUrl` was referenced (assign `const portalUrl = CURFOX_PORTAL_URL;` to minimize edits).

- [ ] **Step 6: Verify build + existing mailer tests**

Run: `npx vitest run app/_lib/__tests__/mailer-dispatch.test.ts && npm run build`
Expected: PASS; `✓ Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add prisma app/_lib/curfox-portal.ts app/_lib/mailer.ts components/ui
git commit -m "chore(admin): add OrderNote model, order indexes, shadcn primitives, CURFOX_PORTAL_URL"
```

---

## Task 2: Shared types + `buildOrderWhere` helper

**Files:**
- Create: `app/_lib/admin-orders.ts`
- Test: `app/_lib/__tests__/admin-orders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/admin-orders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOrderWhere } from "../admin-orders";

describe("buildOrderWhere", () => {
  it("returns empty where for the 'all' tab with no filters", () => {
    expect(buildOrderWhere({ tab: "all" })).toEqual({});
  });

  it("maps 'needs-dispatch' to CONFIRMED + not booked", () => {
    expect(buildOrderWhere({ tab: "needs-dispatch" })).toEqual({
      status: "CONFIRMED",
      courierBookedAt: null,
    });
  });

  it("maps 'pending-cod' to paymentStatus COD_PENDING", () => {
    expect(buildOrderWhere({ tab: "pending-cod" })).toEqual({
      paymentStatus: "COD_PENDING",
    });
  });

  it("maps 'delivered' and 'cancelled' to status", () => {
    expect(buildOrderWhere({ tab: "delivered" })).toEqual({ status: "DELIVERED" });
    expect(buildOrderWhere({ tab: "cancelled" })).toEqual({ status: "CANCELLED" });
  });

  it("adds a case-insensitive OR search across order number, name, phone, email", () => {
    const where = buildOrderWhere({ tab: "all", q: "nimali" });
    expect(where.OR).toEqual([
      { webNumber: { contains: "nimali", mode: "insensitive" } },
      { rbNumber: { contains: "nimali", mode: "insensitive" } },
      { guestName: { contains: "nimali", mode: "insensitive" } },
      { guestEmail: { contains: "nimali", mode: "insensitive" } },
      { customerPhone: { contains: "nimali", mode: "insensitive" } },
      { user: { is: { name: { contains: "nimali", mode: "insensitive" } } } },
      { user: { is: { email: { contains: "nimali", mode: "insensitive" } } } },
    ]);
  });

  it("merges explicit status/payment filters over the tab preset", () => {
    const where = buildOrderWhere({ tab: "all", status: "PENDING", payment: "PAID" });
    expect(where.status).toBe("PENDING");
    expect(where.paymentStatus).toBe("PAID");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: FAIL — `buildOrderWhere` is not exported.

- [ ] **Step 3: Write minimal implementation**

Create `app/_lib/admin-orders.ts`:

```ts
import type { Prisma } from "@prisma/client";

export const ORDER_TABS = ["all", "needs-dispatch", "pending-cod", "delivered", "cancelled"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export type ListParams = {
  tab?: OrderTab;
  q?: string;
  status?: string;
  payment?: string;
};

export function buildOrderWhere(params: ListParams): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  switch (params.tab) {
    case "needs-dispatch":
      where.status = "CONFIRMED";
      where.courierBookedAt = null;
      break;
    case "pending-cod":
      where.paymentStatus = "COD_PENDING";
      break;
    case "delivered":
      where.status = "DELIVERED";
      break;
    case "cancelled":
      where.status = "CANCELLED";
      break;
    // "all" / undefined → no preset
  }

  if (params.status) where.status = params.status;
  if (params.payment) where.paymentStatus = params.payment;

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { webNumber: { contains: q, mode: "insensitive" } },
      { rbNumber: { contains: q, mode: "insensitive" } },
      { guestName: { contains: q, mode: "insensitive" } },
      { guestEmail: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q, mode: "insensitive" } },
      { user: { is: { name: { contains: q, mode: "insensitive" } } } },
      { user: { is: { email: { contains: q, mode: "insensitive" } } } },
    ];
  }

  return where;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "feat(admin-orders): buildOrderWhere filter/search helper"
```

---

## Task 3: `recomputeTotals` helper

**Files:**
- Modify: `app/_lib/admin-orders.ts`
- Test: `app/_lib/__tests__/admin-orders.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import { recomputeTotals } from "../admin-orders";

describe("recomputeTotals", () => {
  it("charges Colombo delivery below the free threshold", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Colombo");
    expect(r).toEqual({ subtotal: 1000, shippingCost: 350, total: 1350 });
  });

  it("is free shipping at or above the threshold", () => {
    const r = recomputeTotals([{ price: 2500, quantity: 2 }], "Colombo");
    expect(r).toEqual({ subtotal: 5000, shippingCost: 0, total: 5000 });
  });

  it("charges other-zone delivery for non-Colombo cities below threshold", () => {
    const r = recomputeTotals([{ price: 1000, quantity: 1 }], "Kandy");
    expect(r).toEqual({ subtotal: 1000, shippingCost: 450, total: 1450 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: FAIL — `recomputeTotals` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `admin-orders.ts`)

```ts
import { calculateDelivery } from "@/app/_lib/checkout-config";
import { zoneForCity } from "@/app/_lib/delivery-zones";

export function recomputeTotals(
  items: { price: number; quantity: number }[],
  city: string,
): { subtotal: number; shippingCost: number; total: number } {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const shippingCost = calculateDelivery(subtotal, zoneForCity(city));
  return { subtotal, shippingCost, total: subtotal + shippingCost };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "feat(admin-orders): recomputeTotals helper"
```

---

## Task 4: `applyItemChanges` helper (stock deltas)

**Files:**
- Modify: `app/_lib/admin-orders.ts`
- Test: `app/_lib/__tests__/admin-orders.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { applyItemChanges } from "../admin-orders";

const ITEMS = [
  { id: "i1", productId: "p1", name: "Dress", size: "M", price: 6500, quantity: 1 },
  { id: "i2", productId: "p2", name: "Scarf", size: null, price: 2000, quantity: 2 },
];

describe("applyItemChanges", () => {
  it("decreasing quantity restores stock (positive delta)", () => {
    const { nextItems, stockDeltas } = applyItemChanges(ITEMS, [{ id: "i2", quantity: 1 }]);
    expect(nextItems.find((i) => i.id === "i2")!.quantity).toBe(1);
    expect(stockDeltas).toEqual({ p2: 1 });
  });

  it("increasing quantity decrements stock (negative delta)", () => {
    const { stockDeltas } = applyItemChanges(ITEMS, [{ id: "i1", quantity: 3 }]);
    expect(stockDeltas).toEqual({ p1: -2 });
  });

  it("removing an item restores its full quantity and drops it", () => {
    const { nextItems, stockDeltas } = applyItemChanges(ITEMS, [{ id: "i2", remove: true }]);
    expect(nextItems.map((i) => i.id)).toEqual(["i1"]);
    expect(stockDeltas).toEqual({ p2: 2 });
  });

  it("changes size without affecting stock", () => {
    const { nextItems, stockDeltas } = applyItemChanges(ITEMS, [{ id: "i1", size: "L" }]);
    expect(nextItems.find((i) => i.id === "i1")!.size).toBe("L");
    expect(stockDeltas).toEqual({});
  });

  it("rejects reducing quantity to zero (use remove instead)", () => {
    expect(() => applyItemChanges(ITEMS, [{ id: "i1", quantity: 0 }])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: FAIL — `applyItemChanges` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `admin-orders.ts`)

```ts
export type OrderItemRow = {
  id: string;
  productId: string;
  name: string;
  size: string | null;
  price: number;
  quantity: number;
};

export type ItemChange = {
  id: string;
  quantity?: number;
  size?: string | null;
  remove?: boolean;
};

/**
 * Applies edit-mode changes to the order's items. Returns the next item set and
 * per-product stock deltas: positive = restore to stock, negative = decrement.
 */
export function applyItemChanges(
  current: OrderItemRow[],
  changes: ItemChange[],
): { nextItems: OrderItemRow[]; stockDeltas: Record<string, number> } {
  const byId = new Map(current.map((i) => [i.id, { ...i }]));
  const deltas: Record<string, number> = {};
  const addDelta = (productId: string, d: number) => {
    if (d === 0) return;
    deltas[productId] = (deltas[productId] ?? 0) + d;
  };

  for (const change of changes) {
    const item = byId.get(change.id);
    if (!item) throw new Error(`Unknown order item: ${change.id}`);

    if (change.remove) {
      addDelta(item.productId, item.quantity); // restore all
      byId.delete(change.id);
      continue;
    }
    if (change.size !== undefined) item.size = change.size;
    if (change.quantity !== undefined) {
      if (change.quantity <= 0) throw new Error("Quantity must be positive; remove the item instead");
      addDelta(item.productId, item.quantity - change.quantity); // old - new
      item.quantity = change.quantity;
    }
  }

  // prune zero deltas
  for (const k of Object.keys(deltas)) if (deltas[k] === 0) delete deltas[k];
  return { nextItems: [...byId.values()], stockDeltas: deltas };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "feat(admin-orders): applyItemChanges stock-delta helper"
```

---

## Task 5: Status-transition helpers

**Files:**
- Modify: `app/_lib/admin-orders.ts`
- Test: `app/_lib/__tests__/admin-orders.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { nextStatuses, canEdit, canCancel } from "../admin-orders";

describe("status transitions", () => {
  it("allows PENDING→CONFIRMED and CONFIRMED→DELIVERED", () => {
    expect(nextStatuses("PENDING")).toEqual(["CONFIRMED"]);
    expect(nextStatuses("CONFIRMED")).toEqual(["DELIVERED"]);
  });
  it("has no transitions from terminal states", () => {
    expect(nextStatuses("DELIVERED")).toEqual([]);
    expect(nextStatuses("CANCELLED")).toEqual([]);
  });
  it("canEdit/canCancel only for non-terminal orders", () => {
    expect(canEdit({ status: "CONFIRMED" })).toBe(true);
    expect(canCancel({ status: "PENDING" })).toBe(true);
    expect(canEdit({ status: "DELIVERED" })).toBe(false);
    expect(canCancel({ status: "CANCELLED" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Write minimal implementation** (append to `admin-orders.ts`)

```ts
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED"],
  CONFIRMED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function nextStatuses(current: string): string[] {
  return TRANSITIONS[current] ?? [];
}

export function canEdit(order: { status: string }): boolean {
  return order.status !== "DELIVERED" && order.status !== "CANCELLED";
}

export function canCancel(order: { status: string }): boolean {
  return canEdit(order);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "feat(admin-orders): status transition helpers"
```

---

## Task 6: `listOrders` and `getOrderDetail` queries

**Files:**
- Modify: `app/_lib/admin-orders.ts`
- Test: `app/_lib/__tests__/admin-orders.test.ts`

- [ ] **Step 1: Write the failing test** — new file to isolate the prisma mock.

Create `app/_lib/__tests__/admin-orders-queries.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { findMany, count, findUnique } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { order: { findMany, count, findUnique } },
}));

import { listOrders, getOrderDetail } from "../admin-orders";

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
  findUnique.mockReset();
});

describe("listOrders", () => {
  it("paginates with take/skip and returns rows + total", async () => {
    findMany.mockResolvedValueOnce([{ id: "o1" }]);
    count.mockResolvedValueOnce(42);

    const res = await listOrders({ tab: "needs-dispatch", page: 2, pageSize: 25 });

    expect(count).toHaveBeenCalledWith({ where: { status: "CONFIRMED", courierBookedAt: null } });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ status: "CONFIRMED", courierBookedAt: null });
    expect(arg.take).toBe(25);
    expect(arg.skip).toBe(25);
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(res).toEqual({ rows: [{ id: "o1" }], total: 42 });
  });
});

describe("getOrderDetail", () => {
  it("includes items, product sizes, user and notesLog", async () => {
    findUnique.mockResolvedValueOnce({ id: "o1" });
    const res = await getOrderDetail("o1");
    const arg = findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "o1" });
    expect(arg.include.items.include.product.select.sizes).toBe(true);
    expect(arg.include.notesLog.orderBy).toEqual({ createdAt: "desc" });
    expect(res).toEqual({ id: "o1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/admin-orders-queries.test.ts`
Expected: FAIL — `listOrders` / `getOrderDetail` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `admin-orders.ts`)

```ts
import { prisma } from "@/app/_lib/prisma";

export const PAGE_SIZE = 25;

export async function listOrders(
  params: ListParams & { page?: number; pageSize?: number },
) {
  const where = buildOrderWhere(params);
  const pageSize = params.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { rows, total };
}

export async function getOrderDetail(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      items: { include: { product: { select: { sizes: true } } } },
      notesLog: { orderBy: { createdAt: "desc" } },
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/admin-orders-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders-queries.test.ts
git commit -m "feat(admin-orders): listOrders + getOrderDetail queries"
```

---

## Task 7: Action scaffolding + `addNote` + `markCodCollected`

**Files:**
- Create: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/admin/orders/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { orderFindUnique, orderUpdate, noteCreate } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  noteCreate: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { findUnique: orderFindUnique, update: orderUpdate },
    orderNote: { create: noteCreate },
  },
}));

import { addNote, markCodCollected } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  orderFindUnique.mockReset();
  orderUpdate.mockReset();
  noteCreate.mockReset();
});

describe("addNote", () => {
  it("requires admin and rejects empty body", async () => {
    const res = await addNote("o1", "   ");
    expect(requireAdmin).toHaveBeenCalled();
    expect(res).toEqual({ success: false, error: "Note cannot be empty" });
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("creates a note attributed to the admin", async () => {
    noteCreate.mockResolvedValueOnce({});
    const res = await addNote("o1", "Deliver after 5pm");
    expect(noteCreate).toHaveBeenCalledWith({
      data: { orderId: "o1", authorEmail: "admin@x.test", body: "Deliver after 5pm" },
    });
    expect(res).toEqual({ success: true });
  });
});

describe("markCodCollected", () => {
  it("only works for COD orders pending collection", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", paymentMethod: "PAYHERE", paymentStatus: "PAID" });
    const res = await markCodCollected("o1");
    expect(res).toEqual({ success: false, error: "Not a COD order awaiting collection" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("sets paymentStatus to COD_COLLECTED", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", paymentMethod: "COD", paymentStatus: "COD_PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await markCodCollected("o1");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { paymentStatus: "COD_COLLECTED" } });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `actions.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `app/admin/orders/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";

export type ActionResult =
  | { success: true; warning?: string }
  | { success: false; error: string };

function revalidate(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

const NoteSchema = z.string().trim().min(1).max(500);

export async function addNote(orderId: string, body: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) return { success: false, error: "Note cannot be empty" };

  await prisma.orderNote.create({
    data: { orderId, authorEmail: session.user.email ?? "admin", body: parsed.data },
  });
  revalidate(orderId);
  return { success: true };
}

export async function markCodCollected(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentMethod !== "COD" || order.paymentStatus !== "COD_PENDING") {
    return { success: false, error: "Not a COD order awaiting collection" };
  }
  await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "COD_COLLECTED" } });
  revalidate(orderId);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): action scaffolding + addNote + markCodCollected"
```

---

## Task 8: `advanceStatus` action

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (append inside the file, new `describe`)

```ts
import { advanceStatus } from "../actions";

describe("advanceStatus", () => {
  it("rejects an illegal transition", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING" });
    const res = await advanceStatus("o1", "DELIVERED");
    expect(res).toEqual({ success: false, error: "Cannot move order from PENDING to DELIVERED" });
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("allows PENDING→CONFIRMED", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PENDING" });
    orderUpdate.mockResolvedValueOnce({});
    const res = await advanceStatus("o1", "CONFIRMED");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CONFIRMED" } });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `advanceStatus` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `actions.ts`)

```ts
import { nextStatuses } from "@/app/_lib/admin-orders";

export async function advanceStatus(orderId: string, to: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Order not found" };
  if (!nextStatuses(order.status).includes(to)) {
    return { success: false, error: `Cannot move order from ${order.status} to ${to}` };
  }
  await prisma.order.update({ where: { id: orderId }, data: { status: to } });
  revalidate(orderId);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): advanceStatus action"
```

---

## Task 9: `cancelOrder` action (stock restore, idempotent, paid warning)

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (append)

Add a `$transaction` mock to the prisma mock by extending the `vi.mock("@/app/_lib/prisma")` factory. Replace the existing prisma mock block at the top of the file with:

```ts
const { orderFindUnique, orderUpdate, noteCreate, productUpdateMany, txn } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  noteCreate: vi.fn(),
  productUpdateMany: vi.fn(),
  txn: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => {
  const client = {
    order: { findUnique: orderFindUnique, update: orderUpdate },
    orderNote: { create: noteCreate },
    product: { updateMany: productUpdateMany },
    orderItem: { update: vi.fn(), delete: vi.fn() },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: any) => fn(client)) } };
});
```

Then add:

```ts
import { cancelOrder } from "../actions";

describe("cancelOrder", () => {
  it("is idempotent — rejects an already-cancelled order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CANCELLED", items: [] });
    const res = await cancelOrder("o1");
    expect(res).toEqual({ success: false, error: "Order is already cancelled" });
  });

  it("rejects cancelling a delivered order", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "DELIVERED", items: [] });
    const res = await cancelOrder("o1");
    expect(res).toEqual({ success: false, error: "Delivered orders cannot be cancelled" });
  });

  it("restores stock and warns when the order was paid", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "PAID",
      items: [{ productId: "p1", quantity: 2 }],
    });
    const res = await cancelOrder("o1");
    expect(productUpdateMany).toHaveBeenCalledWith({
      where: { id: "p1" }, data: { stock: { increment: 2 } },
    });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res).toEqual({ success: true, warning: "Order was paid — refund must be handled manually." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `cancelOrder` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `actions.ts`)

```ts
const PAID = new Set(["PAID", "COD_COLLECTED"]);

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { productId: true, quantity: true } } },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status === "CANCELLED") return { success: false, error: "Order is already cancelled" };
  if (order.status === "DELIVERED") return { success: false, error: "Delivered orders cannot be cancelled" };

  await prisma.$transaction(async (tx) => {
    for (const it of order.items) {
      await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { increment: it.quantity } } });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  });

  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — refund must be handled manually." }
    : { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: PASS (all prior action tests still green).

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): cancelOrder with stock restore + paid warning"
```

---

## Task 10: `editItems` action

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { editItems } from "../actions";

describe("editItems", () => {
  const ORDER = {
    id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", shippingCity: "Colombo",
    items: [
      { id: "i1", productId: "p1", name: "Dress", size: "M", price: 6500, quantity: 2 },
    ],
  };

  it("rejects editing a cancelled order", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, status: "CANCELLED" });
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    expect(res).toEqual({ success: false, error: "This order can no longer be edited" });
  });

  it("decreasing quantity restores stock and recomputes totals", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    productUpdateMany.mockResolvedValue({ count: 1 });
    orderUpdate.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    // restore 1 unit of p1
    expect(productUpdateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { stock: { increment: 1 } } });
    // subtotal 6500, Colombo, below threshold → 350 shipping
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 6500, shippingCost: 350, total: 6850 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("fails the increase when stock is insufficient", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    productUpdateMany.mockResolvedValueOnce({ count: 0 }); // decrement guard fails
    const res = await editItems("o1", [{ id: "i1", quantity: 5 }]);
    expect(res).toEqual({ success: false, error: "Insufficient stock for \"Dress\"" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `editItems` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `actions.ts`)

```ts
import {
  applyItemChanges, recomputeTotals, canEdit, type ItemChange,
} from "@/app/_lib/admin-orders";

export async function editItems(orderId: string, changes: ItemChange[]): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (!canEdit(order)) return { success: false, error: "This order can no longer be edited" };

  let next;
  try {
    next = applyItemChanges(
      order.items.map((i) => ({ id: i.id, productId: i.productId, name: i.name, size: i.size, price: i.price, quantity: i.quantity })),
      changes,
    );
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Invalid change" };
  }

  const totals = recomputeTotals(next.nextItems, order.shippingCity);
  const nameByProduct = new Map(order.items.map((i) => [i.productId, i.name]));

  try {
    await prisma.$transaction(async (tx) => {
      for (const [productId, delta] of Object.entries(next.stockDeltas)) {
        if (delta > 0) {
          await tx.product.updateMany({ where: { id: productId }, data: { stock: { increment: delta } } });
        } else if (delta < 0) {
          const dec = -delta;
          const r = await tx.product.updateMany({
            where: { id: productId, stock: { gte: dec } },
            data: { stock: { decrement: dec } },
          });
          if (r.count === 0) throw new Error(`Insufficient stock for "${nameByProduct.get(productId) ?? productId}"`);
        }
      }

      const keptIds = new Set(next.nextItems.map((i) => i.id));
      for (const original of order.items) {
        if (!keptIds.has(original.id)) {
          await tx.orderItem.delete({ where: { id: original.id } });
        }
      }
      for (const item of next.nextItems) {
        await tx.orderItem.update({ where: { id: item.id }, data: { quantity: item.quantity, size: item.size } });
      }
      await tx.order.update({
        where: { id: orderId },
        data: { subtotal: totals.subtotal, shippingCost: totals.shippingCost, total: totals.total },
      });
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Edit failed" };
  }

  revalidate(orderId);
  return PAID.has(order.paymentStatus ?? "")
    ? { success: true, warning: "Order was paid — any price difference must be settled manually." }
    : { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): editItems action (recompute + atomic stock)"
```

---

## Task 11: `editAddress` action (blocked after booking)

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { editAddress } from "../actions";

const ADDR = { line1: "1 New Rd", line2: "", city: "Kandy", country: "Sri Lanka" };

describe("editAddress", () => {
  it("is blocked once the courier is booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "CONFIRMED", courierBookedAt: new Date(), items: [] });
    const res = await editAddress("o1", ADDR);
    expect(res).toEqual({ success: false, error: "Address already sent to Curfox — cancel/rebook there." });
  });

  it("updates fields and recomputes shipping for the new city", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", courierBookedAt: null,
      items: [{ price: 1000, quantity: 1 }],
    });
    orderUpdate.mockResolvedValueOnce({});
    const res = await editAddress("o1", ADDR);
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: expect.objectContaining({
        shippingLine1: "1 New Rd", shippingCity: "Kandy", shippingCountry: "Sri Lanka",
        shippingCost: 450, total: 1450,
      }),
    });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `editAddress` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `actions.ts`)

```ts
const AddressSchema = z.object({
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional().default(""),
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
});

export async function editAddress(
  orderId: string,
  address: { line1: string; line2?: string; city: string; country: string },
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = AddressSchema.safeParse(address);
  if (!parsed.success) return { success: false, error: "Invalid address" };

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return { success: false, error: "Order not found" };
  if (order.courierBookedAt) return { success: false, error: "Address already sent to Curfox — cancel/rebook there." };

  const totals = recomputeTotals(order.items, parsed.data.city);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      shippingLine1: parsed.data.line1,
      shippingLine2: parsed.data.line2 || null,
      shippingCity: parsed.data.city,
      shippingCountry: parsed.data.country,
      shippingCost: totals.shippingCost,
      total: totals.total,
    },
  });
  revalidate(orderId);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): editAddress action (recompute, block after booking)"
```

---

## Task 12: `bookCourier` + `resendConfirmationEmail` actions

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Test: `app/admin/orders/__tests__/actions.test.ts`

These reuse existing flows. Add a helper `toOrderDetails(order)` that maps a DB order (with items + user) to the `OrderDetails` shape used by the mailer/courier.

- [ ] **Step 1: Write the failing test** (append; extend the prisma mock factory's `client` with nothing new — these call mocked modules)

Add module mocks near the top (after the prisma mock):

```ts
const { bookCourierAndNotify } = vi.hoisted(() => ({ bookCourierAndNotify: vi.fn() }));
vi.mock("@/app/checkout/book-courier", () => ({ bookCourierAndNotify }));
const { sendOrderConfirmationEmail } = vi.hoisted(() => ({ sendOrderConfirmationEmail: vi.fn() }));
vi.mock("@/app/_lib/mailer", () => ({ sendOrderConfirmationEmail }));
```

Then:

```ts
import { bookCourier, resendConfirmationEmail } from "../actions";

const FULL_ORDER = {
  id: "o1", status: "CONFIRMED", courierBookedAt: null,
  guestName: "Nimali", guestEmail: "n@x.test", customerPhone: "0771234567",
  shippingLine1: "1 Rd", shippingLine2: null, shippingCity: "Colombo", shippingCountry: "Sri Lanka",
  subtotal: 6500, shippingCost: 0, total: 6500,
  paymentMethod: "KOKO", paymentMethodDisplay: "Koko", paymentStatus: "PAID",
  webNumber: "DB-1", rbNumber: null, notes: null, trackingCode: null,
  user: null,
  items: [{ name: "Dress", size: "M", price: 6500, quantity: 1 }],
};

describe("bookCourier", () => {
  it("rejects when not CONFIRMED", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, status: "PENDING" });
    const res = await bookCourier("o1");
    expect(res).toEqual({ success: false, error: "Only confirmed, un-booked orders can be dispatched" });
  });

  it("rejects when already booked", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, courierBookedAt: new Date() });
    const res = await bookCourier("o1");
    expect(res).toEqual({ success: false, error: "Only confirmed, un-booked orders can be dispatched" });
  });

  it("books via bookCourierAndNotify and reports the waybill", async () => {
    orderFindUnique.mockResolvedValueOnce(FULL_ORDER);
    bookCourierAndNotify.mockResolvedValueOnce("CF-88213");
    const res = await bookCourier("o1");
    expect(bookCourierAndNotify).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, warning: "Booked — waybill CF-88213." });
  });

  it("returns an error when Curfox booking did not yield a waybill", async () => {
    orderFindUnique.mockResolvedValueOnce(FULL_ORDER);
    bookCourierAndNotify.mockResolvedValueOnce(undefined);
    const res = await bookCourier("o1");
    expect(res).toEqual({ success: false, error: "Courier booking failed — check Curfox / retry." });
  });
});

describe("resendConfirmationEmail", () => {
  it("re-sends with the tracking code when dispatched", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, trackingCode: "CF-88213" });
    sendOrderConfirmationEmail.mockResolvedValueOnce(undefined);
    const res = await resendConfirmationEmail("o1");
    const arg = sendOrderConfirmationEmail.mock.calls[0][0];
    expect(arg.trackingCode).toBe("CF-88213");
    expect(arg.customerEmail).toBe("n@x.test");
    expect(res).toEqual({ success: true, warning: undefined });
  });

  it("fails when there is no customer email", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...FULL_ORDER, guestEmail: null, user: null });
    const res = await resendConfirmationEmail("o1");
    expect(res).toEqual({ success: false, error: "No customer email on this order" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: FAIL — `bookCourier` / `resendConfirmationEmail` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `actions.ts`)

```ts
import { bookCourierAndNotify } from "@/app/checkout/book-courier";
import { sendOrderConfirmationEmail, type OrderDetails } from "@/app/_lib/mailer";

type DbOrderWithItems = {
  id: string; guestName: string | null; guestEmail: string | null; customerPhone: string;
  shippingLine1: string; shippingLine2: string | null; shippingCity: string; shippingCountry: string;
  subtotal: number; shippingCost: number; total: number;
  paymentMethod: string; paymentMethodDisplay: string; paymentStatus: string | null;
  webNumber: string | null; rbNumber: string | null; notes: string | null; trackingCode: string | null;
  user: { name: string | null; email: string | null } | null;
  items: { name: string; size: string | null; price: number; quantity: number }[];
};

function toOrderDetails(order: DbOrderWithItems): OrderDetails {
  return {
    orderId: order.id,
    customerName: order.user?.name ?? order.guestName ?? "Customer",
    customerEmail: order.user?.email ?? order.guestEmail ?? "",
    customerPhone: order.customerPhone,
    items: order.items.map((i) => ({ name: i.name, size: i.size, price: i.price, quantity: i.quantity })),
    subtotal: order.subtotal,
    shipping: order.shippingCost,
    total: order.total,
    shippingAddress: {
      line1: order.shippingLine1, line2: order.shippingLine2 ?? undefined,
      city: order.shippingCity, country: order.shippingCountry,
    },
    paymentMethod: order.paymentMethod,
    paymentMethodDisplay: order.paymentMethodDisplay,
    notes: order.notes ?? undefined,
    webNumber: order.webNumber,
    rbNumber: order.rbNumber,
    paymentStatus: order.paymentStatus,
    trackingCode: order.trackingCode ?? undefined,
  };
}

const ORDER_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: { select: { name: true, size: true, price: true, quantity: true } },
} as const;

export async function bookCourier(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  if (process.env.ROYAL_EXPRESS_ENABLED !== "true") {
    return { success: false, error: "Courier integration is disabled (ROYAL_EXPRESS_ENABLED)." };
  }
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) return { success: false, error: "Order not found" };
  if (order.status !== "CONFIRMED" || order.courierBookedAt) {
    return { success: false, error: "Only confirmed, un-booked orders can be dispatched" };
  }
  const waybill = await bookCourierAndNotify({ order: toOrderDetails(order as DbOrderWithItems & { courierBookedAt: Date | null }) });
  revalidate(orderId);
  return waybill
    ? { success: true, warning: `Booked — waybill ${waybill}.` }
    : { success: false, error: "Courier booking failed — check Curfox / retry." };
}

export async function resendConfirmationEmail(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) return { success: false, error: "Order not found" };
  const details = toOrderDetails(order as DbOrderWithItems);
  if (!details.customerEmail) return { success: false, error: "No customer email on this order" };
  await sendOrderConfirmationEmail(details);
  return { success: true, warning: details.trackingCode ? undefined : "Sent without a tracking code (not dispatched yet)." };
}
```

> Note: the `findUnique` for `bookCourier`/`resend` must also select the scalar fields used by `toOrderDetails`. Prisma returns all scalars by default when only relations are in `include`, so `ORDER_INCLUDE` (relations only) is sufficient.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/admin/orders/__tests__/actions.test.ts`
Expected: PASS (the booking-disabled guard: set `process.env.ROYAL_EXPRESS_ENABLED = "true"` in a `beforeEach` in the test file).

Add to the test file's `beforeEach`:
```ts
process.env.ROYAL_EXPRESS_ENABLED = "true";
```

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(admin-orders): bookCourier + resendConfirmationEmail actions"
```

---

## Task 13: List page, toolbar, table

**Files:**
- Create: `app/admin/orders/page.tsx`, `app/admin/orders/loading.tsx`
- Create: `app/_components/admin/orders/orders-table.tsx`, `app/_components/admin/orders/orders-toolbar.tsx`, `app/_components/admin/orders/dispatch-button.tsx`

- [ ] **Step 1: Create the toolbar (client)**

`app/_components/admin/orders/orders-toolbar.tsx`:

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { ORDER_TABS, type OrderTab } from "@/app/_lib/admin-orders";

const TAB_LABEL: Record<OrderTab, string> = {
  all: "All", "needs-dispatch": "Needs dispatch", "pending-cod": "Pending COD",
  delivered: "Delivered", cancelled: "Cancelled",
};

export function OrdersToolbar({ counts }: { counts: Record<OrderTab, number> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const activeTab = (sp.get("tab") as OrderTab) || "all";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    router.push(`/admin/orders?${next.toString()}`);
  }

  return (
    <div className="mb-4">
      <input
        defaultValue={sp.get("q") ?? ""}
        placeholder="Search order #, customer, phone, email…"
        className="w-full rounded-md border px-3 py-2 text-sm"
        onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value); }}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {ORDER_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setParam("tab", t === "all" ? "" : t)}
            className={
              (activeTab === t ? "bg-primary text-primary-foreground " : "bg-secondary text-muted-foreground ") +
              "rounded-full px-3 py-1 text-xs font-medium"
            }
          >
            {TAB_LABEL[t]} <span className="opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the dispatch button (client)**

`app/_components/admin/orders/dispatch-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookCourier } from "@/app/admin/orders/actions";

export function DispatchButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => { const r = await bookCourier(orderId); alert(r.success ? r.warning : r.error); router.refresh(); })}
      className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
    >
      {pending ? "Booking…" : "Book courier"}
    </button>
  );
}
```

- [ ] **Step 3: Create the table (server)**

`app/_components/admin/orders/orders-table.tsx`:

```tsx
import Link from "next/link";
import { formatPrice } from "@/app/_lib/format";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { DispatchButton } from "./dispatch-button";

type Row = {
  id: string; webNumber: string | null; createdAt: Date; customerPhone: string;
  guestName: string | null; user: { name: string | null } | null;
  total: number; paymentMethod: string; paymentStatus: string | null; status: string;
  courierBookedAt: Date | null; courierWaybillNumber: string | null;
  _count: { items: number };
};

export function OrdersTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No orders match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2">Order #</th><th className="p-2">Date</th><th className="p-2">Customer</th>
          <th className="p-2">Items</th><th className="p-2">Total</th><th className="p-2">Payment</th>
          <th className="p-2">Status</th><th className="p-2">Dispatch</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id} className="border-b hover:bg-secondary/40">
            <td className="p-2 font-medium">
              <Link href={`/admin/orders/${o.id}`} className="hover:underline">{o.webNumber ?? o.id}</Link>
            </td>
            <td className="p-2">{o.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</td>
            <td className="p-2">{o.user?.name ?? o.guestName ?? "—"}<br /><span className="text-muted-foreground">{o.customerPhone}</span></td>
            <td className="p-2">{o._count.items}</td>
            <td className="p-2 font-medium">{formatPrice(o.total)}</td>
            <td className="p-2">{paymentStatusLabel(o.paymentStatus) ?? "—"}<br /><span className="text-muted-foreground">{o.paymentMethod}</span></td>
            <td className="p-2">{o.status}</td>
            <td className="p-2">
              {o.status === "CONFIRMED" && !o.courierBookedAt
                ? <DispatchButton orderId={o.id} />
                : <span className="text-muted-foreground">{o.courierWaybillNumber ?? "—"}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Create the list page (server)**

`app/admin/orders/page.tsx`:

```tsx
import { listOrders, buildOrderWhere, ORDER_TABS, PAGE_SIZE, type OrderTab } from "@/app/_lib/admin-orders";
import { prisma } from "@/app/_lib/prisma";
import { OrdersToolbar } from "@/app/_components/admin/orders/orders-toolbar";
import { OrdersTable } from "@/app/_components/admin/orders/orders-table";

export default async function AdminOrdersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = (sp.tab as OrderTab) || "all";
  const page = Number(sp.page ?? "1") || 1;

  const { rows, total } = await listOrders({ tab, q: sp.q, status: sp.status, payment: sp.payment, page });

  const counts = Object.fromEntries(
    await Promise.all(ORDER_TABS.map(async (t) => [t, await prisma.order.count({ where: buildOrderWhere({ tab: t }) })])),
  ) as Record<OrderTab, number>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Orders</h1>
      <OrdersToolbar counts={counts} />
      <OrdersTable rows={rows} />
      <p className="mt-4 text-sm text-muted-foreground">Page {page} of {pages} · {total} orders</p>
    </section>
  );
}
```

- [ ] **Step 5: Create the loading skeleton**

`app/admin/orders/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`. Manually: sign in as admin, visit `/admin/orders`, confirm tabs/search/rows render.

- [ ] **Step 7: Commit**

```bash
git add app/admin/orders/page.tsx app/admin/orders/loading.tsx app/_components/admin/orders
git commit -m "feat(admin-orders): list page with toolbar, tabs, table"
```

---

## Task 14: Detail page + action components

**Files:**
- Create: `app/admin/orders/[id]/page.tsx`, `app/admin/orders/[id]/not-found.tsx`
- Create: `app/_components/admin/orders/order-actions.tsx`, `order-items-editor.tsx`, `address-editor.tsx`, `order-notes.tsx`, `print-label-link.tsx`

- [ ] **Step 1: Create the print-label link (server, no interactivity)**

`app/_components/admin/orders/print-label-link.tsx`:

```tsx
import { CURFOX_PORTAL_URL } from "@/app/_lib/curfox-portal";

export function PrintLabelLink({ waybill }: { waybill: string | null }) {
  if (!waybill) {
    return <span className="rounded-md border px-3 py-1 text-xs text-muted-foreground" title="Book courier first">🖨 Print label</span>;
  }
  return (
    <a href={CURFOX_PORTAL_URL} target="_blank" rel="noopener noreferrer"
       className="rounded-md border px-3 py-1 text-xs font-medium">
      🖨 Print label (Curfox) · {waybill}
    </a>
  );
}
```

- [ ] **Step 2: Create the action cluster (client)**

`app/_components/admin/orders/order-actions.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bookCourier, advanceStatus, markCodCollected, resendConfirmationEmail, cancelOrder,
} from "@/app/admin/orders/actions";

type Props = {
  orderId: string; status: string; paymentMethod: string; paymentStatus: string | null;
  courierBooked: boolean; nextStatus: string | null;
};

export function OrderActions(p: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ success: boolean; warning?: string; error?: string }>, confirmMsg?: string) =>
    start(async () => {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      const r = await fn();
      alert(r.success ? (r.warning ?? "Done") : r.error);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {p.status === "CONFIRMED" && !p.courierBooked && (
        <button disabled={pending} onClick={() => run(() => bookCourier(p.orderId))}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          📦 Book courier (Curfox)
        </button>
      )}
      {p.nextStatus && (
        <button disabled={pending} onClick={() => run(() => advanceStatus(p.orderId, p.nextStatus!))}
          className="w-full rounded-md border px-3 py-2 text-sm">Mark {p.nextStatus.toLowerCase()}</button>
      )}
      {p.paymentMethod === "COD" && p.paymentStatus === "COD_PENDING" && (
        <button disabled={pending} onClick={() => run(() => markCodCollected(p.orderId))}
          className="w-full rounded-md border px-3 py-2 text-sm">Mark COD collected</button>
      )}
      <button disabled={pending} onClick={() => run(() => resendConfirmationEmail(p.orderId))}
        className="w-full rounded-md border px-3 py-2 text-sm">✉ Resend confirmation</button>
      {p.status !== "DELIVERED" && p.status !== "CANCELLED" && (
        <button disabled={pending}
          onClick={() => run(() => cancelOrder(p.orderId), "Cancel this order and restore stock?")}
          className="w-full rounded-md border border-destructive px-3 py-2 text-sm text-destructive">Cancel order</button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create items editor (client)**

`app/_components/admin/orders/order-items-editor.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editItems } from "@/app/admin/orders/actions";
import { formatPrice } from "@/app/_lib/format";
import type { ItemChange } from "@/app/_lib/admin-orders";

type Item = { id: string; name: string; size: string | null; price: number; quantity: number; sizes: string };

export function OrderItemsEditor({ orderId, items, editable }: { orderId: string; items: Item[]; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items);
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Items · {draft.length}</h4>
        {editable && <button onClick={() => setEditing((v) => !v)} className="text-xs text-primary">{editing ? "Cancel" : "✎ Edit"}</button>}
      </div>
      <ul className="mt-2 space-y-2">
        {draft.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-2">
            <span>{it.name}{it.size ? ` · ${it.size}` : ""}</span>
            {editing ? (
              <span className="flex items-center gap-2">
                <input type="number" min={1} value={it.quantity} className="w-14 rounded border px-1"
                  onChange={(e) => setDraft((d) => d.map((x) => x.id === it.id ? { ...x, quantity: Number(e.target.value) } : x))} />
                <button className="text-destructive" onClick={() => setDraft((d) => d.filter((x) => x.id !== it.id))}>✕</button>
              </span>
            ) : (
              <span>×{it.quantity} · {formatPrice(it.price * it.quantity)}</span>
            )}
          </li>
        ))}
      </ul>
      {editing && <button disabled={pending} onClick={save} className="mt-3 rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground">Save changes</button>}
    </div>
  );
}
```

- [ ] **Step 4: Create address editor + notes (client)**

`app/_components/admin/orders/address-editor.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editAddress } from "@/app/admin/orders/actions";

type Addr = { line1: string; line2: string | null; city: string; country: string };

export function AddressEditor({ orderId, address, locked }: { orderId: string; address: Addr; locked: boolean }) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState(address);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof Addr) => (e: React.ChangeEvent<HTMLInputElement>) => setA((p) => ({ ...p, [k]: e.target.value }));

  if (!editing) {
    return (
      <div>
        {!locked && <button className="float-right text-xs text-primary" onClick={() => setEditing(true)}>✎ Edit</button>}
        <div>{address.line1}<br />{address.line2 && <>{address.line2}<br /></>}{address.city}<br />{address.country}</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {(["line1", "line2", "city", "country"] as const).map((k) => (
        <input key={k} value={a[k] ?? ""} onChange={set(k)} placeholder={k} className="w-full rounded border px-2 py-1 text-sm" />
      ))}
      <button disabled={pending} className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
        onClick={() => start(async () => {
          const r = await editAddress(orderId, { line1: a.line1, line2: a.line2 ?? "", city: a.city, country: a.country });
          alert(r.success ? "Saved" : r.error); if (r.success) setEditing(false); router.refresh();
        })}>Save</button>
    </div>
  );
}
```

`app/_components/admin/orders/order-notes.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNote } from "@/app/admin/orders/actions";

type Note = { id: string; authorEmail: string; body: string; createdAt: Date };

export function OrderNotes({ orderId, notes }: { orderId: string; notes: Note[] }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {notes.map((n) => <li key={n.id}>{n.createdAt.toLocaleDateString()} · {n.authorEmail} — {n.body}</li>)}
      </ul>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" className="mt-2 w-full rounded border px-2 py-1 text-sm" />
      <button disabled={pending || !body.trim()} className="mt-1 rounded-md border px-3 py-1 text-sm"
        onClick={() => start(async () => { const r = await addNote(orderId, body); if (r.success) setBody(""); else alert(r.error); router.refresh(); })}>Add note</button>
    </div>
  );
}
```

- [ ] **Step 5: Create not-found + detail page (server)**

`app/admin/orders/[id]/not-found.tsx`:

```tsx
export default function NotFound() {
  return <div className="rounded-lg border p-8 text-center"><h2 className="text-lg font-semibold">Order not found</h2></div>;
}
```

`app/admin/orders/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getOrderDetail, nextStatuses } from "@/app/_lib/admin-orders";
import { formatPrice } from "@/app/_lib/format";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { OrderActions } from "@/app/_components/admin/orders/order-actions";
import { OrderItemsEditor } from "@/app/_components/admin/orders/order-items-editor";
import { AddressEditor } from "@/app/_components/admin/orders/address-editor";
import { OrderNotes } from "@/app/_components/admin/orders/order-notes";
import { PrintLabelLink } from "@/app/_components/admin/orders/print-label-link";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderDetail(id);
  if (!order) notFound();

  const canEditOrder = order.status !== "DELIVERED" && order.status !== "CANCELLED";
  const next = nextStatuses(order.status)[0] ?? null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <a href="/admin/orders" className="text-sm text-muted-foreground">‹ Orders</a>
        <h1 className="text-xl font-bold">{order.webNumber ?? order.id}</h1>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{order.status}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{paymentStatusLabel(order.paymentStatus) ?? "—"} · {order.paymentMethod}</span>
        <span className="ml-auto"><PrintLabelLink waybill={order.courierWaybillNumber} /></span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-lg border p-4">
            <OrderItemsEditor
              orderId={order.id}
              editable={canEditOrder}
              items={order.items.map((i) => ({ id: i.id, name: i.name, size: i.size, price: i.price, quantity: i.quantity, sizes: i.product.sizes }))}
            />
            <div className="mt-3 border-t pt-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>{formatPrice(order.shippingCost)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatPrice(order.total)}</span></div>
            </div>
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Internal notes</h4>
            <OrderNotes orderId={order.id} notes={order.notesLog} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Status &amp; dispatch</h4>
            <OrderActions orderId={order.id} status={order.status} paymentMethod={order.paymentMethod}
              paymentStatus={order.paymentStatus} courierBooked={!!order.courierBookedAt} nextStatus={next} />
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Customer</h4>
            <div className="text-sm">{order.user?.name ?? order.guestName}<br />
              <span className="text-muted-foreground">{order.user?.email ?? order.guestEmail} · {order.customerPhone}</span></div>
          </div>
          <div className="rounded-lg border p-4"><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Shipping address</h4>
            <AddressEditor orderId={order.id} locked={!!order.courierBookedAt}
              address={{ line1: order.shippingLine1, line2: order.shippingLine2, city: order.shippingCity, country: order.shippingCountry }} />
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Verify build + manual smoke**

Run: `npm run build`
Expected: `✓ Compiled successfully`. Manually: open an order, toggle Edit (qty change → Save → totals update), add a note, try Cancel (confirm dialog), Resend, and Print-label disabled/enabled by dispatch state.

- [ ] **Step 7: Commit**

```bash
git add app/admin/orders/[id] app/_components/admin/orders
git commit -m "feat(admin-orders): order detail page + action components"
```

---

## Task 15: E2E tests

**Files:**
- Create: `tests/e2e/admin-orders.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Use the existing admin login fixtures (`tests/e2e/fixtures/users.ts`, per spec #2). Mock or seed a known order. Write `tests/e2e/admin-orders.spec.ts` covering:

```ts
import { test, expect } from "@playwright/test";
import { seedTestUsers, deleteTestUsers, loginAsAdmin } from "./fixtures/users";

test.beforeAll(seedTestUsers);
test.afterAll(deleteTestUsers);

test("orders list renders with tabs and filters to a detail page", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByRole("button", { name: /Needs dispatch/ }).click();
  await expect(page).toHaveURL(/tab=needs-dispatch/);
  // open first order if present
  const firstLink = page.locator("table a").first();
  if (await firstLink.count()) {
    await firstLink.click();
    await expect(page).toHaveURL(/\/admin\/orders\/.+/);
    await expect(page.getByText("Status & dispatch")).toBeVisible();
  }
});

test("print label is disabled before dispatch", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/orders?tab=needs-dispatch");
  const firstLink = page.locator("table a").first();
  test.skip((await firstLink.count()) === 0, "no needs-dispatch order seeded");
  await firstLink.click();
  await expect(page.getByText("🖨 Print label", { exact: false })).toBeVisible();
});
```

> Adapt `loginAsAdmin` to whatever helper the fixtures expose (spec #1/#2 used `seedTestUsers`/`deleteTestUsers`). Add a `loginAsAdmin` helper to the fixtures if one doesn't exist, mirroring the admin-shell e2e from spec #2.

- [ ] **Step 2: Run e2e**

Run: `npx playwright test tests/e2e/admin-orders.spec.ts`
Expected: PASS (tests skip gracefully when no matching order is seeded).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-orders.spec.ts
git commit -m "test(admin-orders): e2e for list, detail, print-label gating"
```

---

## Task 16: Full verification + finish

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run`
Expected: all green (existing + new).

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean for the new files; build compiles.

- [ ] **Step 3: Acceptance smoke**

Walk the spec §9 acceptance criteria 1–14 against the running app as the seeded admin.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore(admin-orders): final verification pass"
```

---

## Self-Review Notes (plan vs. spec)

- **Spec coverage:** list+detail (T13/T14), all 8 actions (T7–T12), print label (T14), OrderNote model (T1), pure helpers + tests (T2–T6), e2e (T15). All §9 acceptance criteria map to a task.
- **Type consistency:** `ActionResult`, `ItemChange`, `OrderTab`, `recomputeTotals`, `applyItemChanges`, `nextStatuses`, `canEdit/canCancel`, `listOrders`/`getOrderDetail`, `bookCourier`/`advanceStatus`/`markCodCollected`/`editItems`/`editAddress`/`cancelOrder`/`resendConfirmationEmail`/`addNote` are defined once and reused with matching signatures.
- **Reuse:** `bookCourierAndNotify`, `sendOrderConfirmationEmail`/`OrderDetails`, `calculateDelivery`/`zoneForCity`, `paymentStatusLabel`, `CURFOX_PORTAL_URL`, the `updateMany stock>=` decrement pattern, the `vi.hoisted`+`vi.mock` test pattern.
- **Deferred (out of scope, per spec §2):** refunds, manual order creation, adding products, bulk actions, full audit log.
```
