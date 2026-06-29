# Admin Product Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin permanently delete a product, but only when it has no order history.

**Architecture:** A new `deleteProduct(id)` Server Action guards on `OrderItem` count before hard-deleting (cascade relations clean up images/reviews/wishlist). A small `DeleteProductButton` client component in each admin products table row triggers it with a `confirm()` dialog.

**Tech Stack:** Next.js 16 App Router, React Server/Client Components, Prisma (PostgreSQL), NextAuth v5, Vitest.

**Spec:** [docs/superpowers/specs/2026-06-29-admin-delete-product-design.md](../specs/2026-06-29-admin-delete-product-design.md)

## Global Constraints

- All admin mutations call `await requireAdmin()` first (from `@/app/_lib/admin-auth`).
- Server Actions return the `ActionResult` shape: `{ success: true } | { success: false; error: string }`.
- After a successful mutation, call the existing `revalidate(id?)` helper in `app/admin/products/actions.ts` (it runs `revalidatePath("/admin/products")` + `revalidateTag("catalog", "max")`).
- Client components surface errors with `alert(r.error)` and refresh via `router.refresh()`, matching `stock-quick-edit.tsx` / `product-form.tsx`.
- No Prisma schema change — deletion is blocked before any `OrderItem` could be orphaned.
- Test command: `npm run test`. Build command: `npm run build`.

---

### Task 1: `deleteProduct` Server Action

**Files:**
- Modify: `app/admin/products/actions.ts` (add the action after `unarchiveProduct`, around line 51)
- Test: `app/admin/products/__tests__/actions.test.ts` (add `orderItem.count` + `product.delete` to the prisma mock; add a `deleteProduct` describe block)

**Interfaces:**
- Consumes: `requireAdmin()`, `revalidate(id?)`, `prisma` (all already in `actions.ts`); `ActionResult` type (defined at top of `actions.ts`).
- Produces: `export async function deleteProduct(id: string): Promise<ActionResult>` — used by Task 2.

- [ ] **Step 1: Extend the prisma mock with `orderItem.count` and `product.delete`**

In `app/admin/products/__tests__/actions.test.ts`, add the two mock fns to the existing `vi.hoisted` block (lines 4-9) so it reads:

```typescript
const { productUpdate, productFindUnique, productCreate, productDelete, orderItemCount, categoryCreate, categoryFindUnique, imageCreateMany, imageDeleteMany, txn } =
  vi.hoisted(() => ({
    productUpdate: vi.fn(), productFindUnique: vi.fn(), productCreate: vi.fn(),
    productDelete: vi.fn(), orderItemCount: vi.fn(),
    categoryCreate: vi.fn(), categoryFindUnique: vi.fn(),
    imageCreateMany: vi.fn(), imageDeleteMany: vi.fn(), txn: vi.fn(),
  }));
```

Add `delete: productDelete` to the `product` mock and an `orderItem` mock in the `vi.mock("@/app/_lib/prisma", ...)` client (lines 14-18):

```typescript
  const client = {
    product: { update: productUpdate, findUnique: productFindUnique, create: productCreate, delete: productDelete },
    category: { create: categoryCreate, findUnique: categoryFindUnique },
    productImage: { createMany: imageCreateMany, deleteMany: imageDeleteMany },
    orderItem: { count: orderItemCount },
  };
```

Add their resets to `beforeEach` (after line 26):

```typescript
  productDelete.mockReset(); orderItemCount.mockReset();
```

- [ ] **Step 2: Write the failing tests**

Append to `app/admin/products/__tests__/actions.test.ts`:

```typescript
import { deleteProduct } from "../actions";

describe("deleteProduct", () => {
  it("blocks deletion when the product has order history", async () => {
    orderItemCount.mockResolvedValueOnce(3);
    const res = await deleteProduct("cat-white");
    expect(orderItemCount).toHaveBeenCalledWith({ where: { productId: "cat-white" } });
    expect(productDelete).not.toHaveBeenCalled();
    expect(res).toEqual({
      success: false,
      error: "This product has order history and can't be deleted. Archive it instead.",
    });
  });
  it("deletes a product with no order history", async () => {
    orderItemCount.mockResolvedValueOnce(0);
    productDelete.mockResolvedValueOnce({});
    const res = await deleteProduct("cat-white");
    expect(requireAdmin).toHaveBeenCalled();
    expect(productDelete).toHaveBeenCalledWith({ where: { id: "cat-white" } });
    expect(res).toEqual({ success: true });
  });
  it("returns a generic error when the delete throws", async () => {
    orderItemCount.mockResolvedValueOnce(0);
    productDelete.mockRejectedValueOnce(new Error("db down"));
    const res = await deleteProduct("cat-white");
    expect(res).toEqual({ success: false, error: "Something went wrong. Please try again." });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- actions.test.ts`
Expected: FAIL — `deleteProduct` is not exported (`"deleteProduct" is not defined` / import error).

- [ ] **Step 4: Implement `deleteProduct`**

In `app/admin/products/actions.ts`, after `unarchiveProduct` (line 51), add:

```typescript
export async function deleteProduct(id: string): Promise<ActionResult> {
  await requireAdmin();
  const orderCount = await prisma.orderItem.count({ where: { productId: id } });
  if (orderCount > 0) {
    return {
      success: false,
      error: "This product has order history and can't be deleted. Archive it instead.",
    };
  }
  try {
    await prisma.product.delete({ where: { id } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(id);
  return { success: true };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- actions.test.ts`
Expected: PASS (all `deleteProduct` tests green, existing tests still green).

- [ ] **Step 6: Commit**

```bash
git add app/admin/products/actions.ts app/admin/products/__tests__/actions.test.ts
git commit -m "feat(admin): add deleteProduct server action with order-history guard"
```

---

### Task 2: `DeleteProductButton` + wire into the products table

**Files:**
- Create: `app/_components/admin/products/delete-product-button.tsx`
- Modify: `app/_components/admin/products/products-table.tsx` (add an Actions column header + cell)

**Interfaces:**
- Consumes: `deleteProduct(id)` from Task 1.
- Produces: `DeleteProductButton` React component — `{ id: string; name: string }`.

- [ ] **Step 1: Create the client button component**

Create `app/_components/admin/products/delete-product-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProduct } from "@/app/admin/products/actions";

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function onClick() {
    if (!confirm(`Delete '${name}'? This cannot be undone.`)) return;
    start(async () => {
      const r = await deleteProduct(id);
      if (!r.success) { alert(r.error); return; }
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="rounded-md border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
    >
      Delete
    </button>
  );
}
```

- [ ] **Step 2: Add an Actions column to the products table**

In `app/_components/admin/products/products-table.tsx`:

Add the import after line 5:

```tsx
import { DeleteProductButton } from "./delete-product-button";
```

Add a trailing header cell to the `<thead>` row (line 20), after the `Status` `<th>`:

```tsx
          <th className="p-2">Status</th><th className="p-2 text-right">Actions</th>
```

Add a trailing body cell to each row, after the Status `<td>` (line 35):

```tsx
            <td className="p-2 text-right"><DeleteProductButton id={p.id} name={p.name} /></td>
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: PASS — no type errors; `/admin/products` builds.

- [ ] **Step 4: Manual verification (record result)**

Start the app (`npm run dev`), sign in as an admin, open `/admin/products`:
- A product with no orders → click **Delete** → confirm → row disappears.
- A product that has been ordered → click **Delete** → confirm → an alert appears: "This product has order history and can't be deleted. Archive it instead." and the row stays.

Note the observed outcome of both cases before committing.

- [ ] **Step 5: Commit**

```bash
git add app/_components/admin/products/delete-product-button.tsx app/_components/admin/products/products-table.tsx
git commit -m "feat(admin): add Delete button to products table rows"
```

---

## Self-Review

**Spec coverage:**
- Server Action `deleteProduct` with order-history guard → Task 1. ✓
- Cascade cleanup of images/reviews/wishlist → relies on existing `onDelete: Cascade` (no code needed); covered by the note in Task 1 and exercised in manual verification. ✓
- `requireAdmin` rejection → enforced in the action; the existing suite already mocks `requireAdmin`. The action calls it first, same as every sibling action. ✓
- Delete button in every table row, both tabs → Task 2 (the table component renders both Active and Archived rows). ✓
- `confirm()` / `alert()` UX → Task 2. ✓
- `revalidate()` after success → Task 1 Step 4. ✓
- No schema change → confirmed in Global Constraints. ✓

**Placeholder scan:** No TBD/TODO; all steps show concrete code and exact commands. ✓

**Type consistency:** `deleteProduct(id: string): Promise<ActionResult>` defined in Task 1, consumed with the same signature in Task 2's button. `ActionResult` is the existing type in `actions.ts`. ✓

**Note (correction vs. spec wording):** The spec said the Delete button sits "next to Archive/Unarchive" in the table. In reality Archive/Unarchive live on the product **edit form**, not the table. The button is still placed in each table row (as the user chose — table row, all products); it simply stands alone in a new Actions column rather than beside an Archive button.
