# Admin Orders List: Show T-Shirt Size — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the T-shirt size to each line item shown in the admin Orders list (`/admin/orders`) ITEMS column, so admins can see size without opening the order detail page.

**Architecture:** `OrderItem.size` already exists in Postgres and is populated at checkout. The list query (`listOrders()`) simply never selects it, and the shared line formatter (`formatOrderItemLine`) never renders it. This plan (1) extends the formatter + its type with TDD, then (2) wires `size` through the Prisma select and the table component's row type so the new formatter field actually gets data.

**Tech Stack:** Next.js 16 (App Router), Prisma + PostgreSQL, Vitest, TypeScript.

## Global Constraints

- No schema/migration change — `OrderItem.size String?` already exists (`prisma/schema.prisma:226`).
- Missing/blank `size` renders as `—`, exactly mirroring the existing `color` fallback rule (admin views always show the slot; never omit it).
- Line format: `"{name} - {color} - {size} x{quantity}"` (size sits immediately before quantity).
- Out of scope: SMS (`app/_lib/sms.ts`), email (`app/_lib/mailer.ts`), and the order detail page (`app/admin/orders/[id]/page.tsx`, already shows size via `OrderItemsEditor`) — do not touch these files.
- This dev environment has no `DATABASE_URL` / live Postgres. Do **not** run `npm run build` (it fails at static-prerender for DB-backed pages for environment reasons, not code defects) or any `prisma migrate` / `db:*` script. Use `npx tsc --noEmit` as the compile/type gate, and `npm run test` (full suite — avoid file-path-filtered invocations, they intermittently misreport "no tests") for unit tests. Manual browser verification of `/admin/orders` is deferred to the user.

---

### Task 1: Extend `formatOrderItemLine` to render size (TDD)

**Files:**
- Modify: `app/_lib/order-item-display.ts`
- Test: `app/_lib/__tests__/order-item-display.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OrderItemSummaryInput` gains `size?: string | null`. `formatOrderItemLine(item: OrderItemSummaryInput): string` now returns `"{name} - {color-or-—} - {size-or-—} x{quantity}"`. Task 2 passes objects with a `size: string | null` field into this function.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `app/_lib/__tests__/order-item-display.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import { formatOrderItemLine, omittedItemCount } from "../order-item-display";

describe("formatOrderItemLine", () => {
  it("renders product, color, size, and quantity as 'Product - Color - Size xN'", () => {
    expect(formatOrderItemLine({ name: "Cat Tee", color: "White", size: "M", quantity: 2 })).toBe(
      "Cat Tee - White - M x2",
    );
  });

  it("falls back to an em dash when color is missing (admin views never omit the field)", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: null, size: "L", quantity: 1 })).toBe(
      "Bear Cap - — - L x1",
    );
  });

  it("falls back to an em dash when color is undefined", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", size: "L", quantity: 1 })).toBe("Bear Cap - — - L x1");
  });

  it("falls back to an em dash when color is blank/whitespace", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "   ", size: "L", quantity: 1 })).toBe(
      "Bear Cap - — - L x1",
    );
  });

  it("falls back to an em dash when size is missing", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "Black", size: null, quantity: 1 })).toBe(
      "Bear Cap - Black - — x1",
    );
  });

  it("falls back to an em dash when size is undefined", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "Black", quantity: 1 })).toBe(
      "Bear Cap - Black - — x1",
    );
  });

  it("falls back to an em dash when size is blank/whitespace", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "Black", size: "  ", quantity: 1 })).toBe(
      "Bear Cap - Black - — x1",
    );
  });

  it("falls back to an em dash for both when color and size are missing", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", quantity: 1 })).toBe("Bear Cap - — - — x1");
  });
});

describe("omittedItemCount", () => {
  it("returns 0 when every item is shown", () => {
    expect(omittedItemCount(2, 2)).toBe(0);
  });

  it("returns the difference when more items exist than are shown", () => {
    expect(omittedItemCount(5, 2)).toBe(3);
  });

  it("never goes negative", () => {
    expect(omittedItemCount(1, 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm run test -- app/_lib/__tests__/order-item-display.test.ts`
Expected: the pre-existing `omittedItemCount` tests PASS; the `formatOrderItemLine` tests FAIL (actual strings lack the `- {size}` segment), since the current implementation doesn't accept or render `size` yet.

- [ ] **Step 3: Implement the minimal change**

Replace the full contents of `app/_lib/order-item-display.ts` with:

```typescript
export type OrderItemSummaryInput = {
  name: string;
  color?: string | null;
  size?: string | null;
  quantity: number;
};

/** Admin views always show the color and size slots (unlike customer copy, which omits
 *  missing attributes); a missing/blank value renders as an em dash. */
export function formatOrderItemLine(item: OrderItemSummaryInput): string {
  const color = item.color?.trim();
  const size = item.size?.trim();
  return `${item.name} - ${color && color.length > 0 ? color : "—"} - ${size && size.length > 0 ? size : "—"} x${item.quantity}`;
}

export function omittedItemCount(totalCount: number, shownCount: number): number {
  return Math.max(0, totalCount - shownCount);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- app/_lib/__tests__/order-item-display.test.ts`
Expected: PASS (11 tests: 8 in `formatOrderItemLine`, 3 in `omittedItemCount`).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/order-item-display.ts app/_lib/__tests__/order-item-display.test.ts
git commit -m "feat(admin): render T-shirt size in order item summary line"
```

---

### Task 2: Wire `size` through the orders list query and table

**Files:**
- Modify: `app/_lib/admin-orders.ts:191`
- Modify: `app/_components/admin/orders/orders-table.tsx:18`

**Interfaces:**
- Consumes: `formatOrderItemLine` and `OrderItemSummaryInput` from Task 1 (`app/_lib/order-item-display.ts`) — unchanged signatures, now accepting `size`.
- Produces: `listOrders()`'s returned `rows[].items[]` elements now include `size: string | null`, matching the `Row.items` element type in `orders-table.tsx`. No other module consumes these shapes.

- [ ] **Step 1: Add `size` to the list query's item select**

In `app/_lib/admin-orders.ts`, in `listOrders()`, find this line:

```typescript
        items: { take: 2, orderBy: { id: "asc" }, select: { id: true, name: true, color: true, quantity: true } },
```

Replace it with:

```typescript
        items: { take: 2, orderBy: { id: "asc" }, select: { id: true, name: true, color: true, size: true, quantity: true } },
```

- [ ] **Step 2: Add `size` to the table row type**

In `app/_components/admin/orders/orders-table.tsx`, find this line:

```typescript
  items: { id: string; name: string; color: string | null; quantity: number }[];
```

Replace it with:

```typescript
  items: { id: string; name: string; color: string | null; size: string | null; quantity: number }[];
```

No other change is needed in this file: `formatOrderItemLine(it)` (line 151) already passes the whole `it` object, which now includes `size` and satisfies the updated `OrderItemSummaryInput` from Task 1.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. This is the step that actually verifies the wiring — `Row.items[].size` must line up with what `formatOrderItemLine` expects and with what the new Prisma `select` returns.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS, same file/test count as Task 1's run plus the rest of the suite unaffected (this task touches no tested logic — only a Prisma select and a type).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_components/admin/orders/orders-table.tsx
git commit -m "feat(admin): select order item size for the orders list"
```

- [ ] **Step 6: Hand off manual verification (no local DB in this environment)**

This environment has no `DATABASE_URL`, so the change can't be exercised against real data here. Note for the user: after pulling this change, load `/admin/orders` and confirm each ITEMS row reads `Name - Color - Size xQty`, with `—` in the size slot for any item that has none.

---

## Self-Review Notes

- **Spec coverage:** design's three file changes (select field, formatter/type, row type) → Task 1 (formatter/type) + Task 2 (select, row type). Testing section → Task 1's unit tests + Task 2's tsc/build gate + manual smoke handoff. Out-of-scope list (SMS/email/detail page) → explicitly called out in Global Constraints, no task touches those files.
- **Placeholder scan:** no TBD/TODO; every step has literal code.
- **Type consistency:** `OrderItemSummaryInput.size?: string | null` (Task 1) matches `Row.items[].size: string | null` (Task 2) and the Prisma `select`'s `size: true` (Task 2) — same shape end to end.
