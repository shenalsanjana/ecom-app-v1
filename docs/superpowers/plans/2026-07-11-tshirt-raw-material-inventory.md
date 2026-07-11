# T-Shirt Raw-Material Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split T-shirt stock into two shared, admin-managed raw-material pools — `PlainTshirtStock` (color+size) and `DtfDesign` (print design) — so finished-product availability is derived from both pools instead of independent per-product stock counts, with checkout/cancel/edit/payment-failure all deducting and restoring from the exact raw-material rows an order consumed.

**Architecture:** `VariantSizeStock` keeps its name but drops its `stock` column, becoming a pure "this color offers this size" declaration; quantity now lives in `PlainTshirtStock` (shared by `colorSlug`+`size`) and `DtfDesign` (shared by `Product.dtfDesignId`). `OrderItem` snapshots the exact `plainTshirtStockId`/`dtfDesignId` a line consumed so every restore path targets that frozen identity, never the product's current state. Two shared transaction helpers (`acquireItemPools`/`restoreItemPools`) back every stock-touching path — checkout, admin cancel, admin edit, and the payment-failure webhook — so the math never diverges between them.

**Tech Stack:** Next.js 16 App Router, Prisma/PostgreSQL, Vitest, TypeScript, Zod.

**Design doc:** `docs/superpowers/specs/2026-07-11-tshirt-raw-material-inventory-design.md`

## Global Constraints

- **No local database.** Never run `prisma migrate dev`/`db push`/`db seed` locally — there is no `DATABASE_URL`. Schema changes are hand-authored SQL under `prisma/migrations/`. After any `schema.prisma` edit, run `npx prisma generate` (works without a DB) then `npx tsc --noEmit` as the compile gate. Applying the migration and any browser verification is deferred to the user.
- **Test runner:** always `npm run test` (Vitest). Do not use directory-prefixed filters or `npx vitest` directly — they trip a "no tests found" globalSetup quirk in this repo.
- **Fixed 1:1 consumption.** One unit sold always consumes exactly 1 matching `PlainTshirtStock` unit and 1 `DtfDesign` unit. No per-product multiplier.
- **Null/missing means unavailable, never throw.** A `null` `dtfDesignId`, a missing `PlainTshirtStock` row, or a missing `DtfDesign` row must always be treated as zero/unavailable by every availability, validation, feed, and JSON-LD code path — not as an error. Every existing product ships with `dtfDesignId = null` and both pools empty on day one (the "start at zero" rollout decision), so this is the default state the whole catalog runs in until an admin does the one-time stock-count + design-assignment pass.
- **`LOW_STOCK_THRESHOLD = 5`** (existing constant in `app/_lib/admin-products.ts`) is reused for both new pools — do not redefine it elsewhere.
- **Commit after every task**, per this repo's convention (Conventional Commits: `feat(inventory): ...`, `test(inventory): ...`).

---

## File Structure

**New files:**
- `prisma/migrations/20260711120000_add_tshirt_raw_material_inventory/migration.sql` — additive schema change (Migration A).
- `prisma/migrations/20260711130000_drop_variant_size_stock_stock/migration.sql` — cleanup (Migration B, last task, ships only after everything else is live).
- `app/_lib/inventory-pools.ts` — the two shared transaction helpers (`acquireItemPools`, `restoreItemPools`) every stock-touching path calls.
- `app/_lib/__tests__/inventory-pools.test.ts`
- `app/_lib/admin-inventory.ts` — read queries for the admin Inventory section (list stock, list designs with product counts, low-stock product id resolution helpers used by KPIs).
- `app/_lib/__tests__/admin-inventory.test.ts`
- `app/admin/inventory/actions.ts` — server actions: upsert/delete `PlainTshirtStock` rows, create/update/delete `DtfDesign` rows.
- `app/admin/inventory/__tests__/actions.test.ts`
- `app/admin/inventory/page.tsx` — the Inventory admin page (Plain T-Shirt Stock grid + DTF Designs table).
- `app/_components/admin/inventory/plain-stock-grid.tsx` — client leaf, color×size quantity grid.
- `app/_components/admin/inventory/dtf-designs-table.tsx` — client leaf, designs table.

**Modified files:**
- `prisma/schema.prisma` — new models, `Product.dtfDesignId`, `OrderItem` snapshot columns, drop `VariantSizeStock.stock`.
- `app/_lib/variants.ts` + `app/_lib/__tests__/variants.test.ts` — derived two-pool availability helpers.
- `app/_lib/order-validation.ts` + `app/checkout/__tests__/variant-stock.test.ts` — pool-aware cart validation.
- `app/checkout/actions.ts` + `app/checkout/__tests__/actions.test.ts` — dual guarded acquire + snapshot.
- `app/_lib/admin-orders.ts` + `app/_lib/__tests__/admin-orders.test.ts` — `applyItemChanges` simplified to pure item math (no stock deltas).
- `app/admin/orders/actions.ts` + `app/admin/orders/__tests__/actions.test.ts` — `cancelOrderTx`/`editItems` rewired onto the shared helpers.
- `app/_lib/payments/order-finalization.ts` + `app/_lib/payments/__tests__/order-finalization.test.ts` — `finalizeFailedPayment` rewired.
- `app/_lib/admin-products.ts` + `app/_lib/__tests__/admin-products.test.ts` + `app/_lib/__tests__/admin-products-queries.test.ts` — `dtfDesignId` plumbing, low-stock tab becomes an in-app id resolution.
- `app/admin/products/page.tsx` — per-tab count loop uses the new async where-resolver.
- `app/admin/products/actions.ts` + `app/admin/products/__tests__/actions.test.ts` — `dtfDesignId` in schema/create/update; drop `stock` from the size-input schema.
- `app/_components/admin/products/product-form.tsx` — DTF Design dropdown.
- `app/_components/admin/products/variant-editor.tsx` — remove per-size stock input, add color datalist.
- `app/_components/admin/products/variant-draft.ts` + `app/_components/admin/products/__tests__/variant-draft.test.ts` — drop `stock` from the size-cell shape.
- `app/admin/products/new/page.tsx`, `app/admin/products/[id]/edit/page.tsx` — fetch + pass the designs list and initial `dtfDesignId`.
- `app/_lib/admin-kpis.ts` + `app/_lib/__tests__/admin-kpis.test.ts` — `lowStock` KPI from the two pools.
- `app/_lib/products.ts` + `app/_lib/__tests__/reviews-approved-filter.test.ts` — `cardSelect`/`attachAggregates`/`getProductDetail`/`getProducts` rewired onto the two-pool helpers (`products-archived-filter.test.ts` and `featured-products.test.ts` need no changes — both exercise the empty-rows early-return path).
- `app/_components/product/buy-box-client.tsx` — PDP size selector wired to the new helpers.
- `app/_components/product/product-jsonld.tsx` — availability wired to the new helpers.
- `app/products/[id]/page.tsx` — passes the two new pool-row props through to `ProductJsonLd`/`BuyBoxClient`.
- `app/feed/meta-catalog.csv/route.ts` — feed `inStock` computed from the two pools.
- `app/_components/admin/admin-sidebar.tsx` — add "Inventory" nav entry.
- `prisma/seed.ts`, `app/_data/mock.ts` — seed both pools with demo data; assign a design per mock product.

---

### Task 1: Schema + Migration A

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260711120000_add_tshirt_raw_material_inventory/migration.sql`

**Interfaces:**
- Produces: `PlainTshirtStock { id, color, colorSlug, size, quantity, createdAt, updatedAt }`, `DtfDesign { id, name, slug, quantity, createdAt, updatedAt, products: Product[], orderItems: OrderItem[] }`, `Product.dtfDesignId: string | null`, `OrderItem.plainTshirtStockId: string | null`, `OrderItem.dtfDesignId: string | null`. Every later task's Prisma calls rely on these exact field names.

- [ ] **Step 1: Add the two new models and the new columns to `prisma/schema.prisma`**

Add these two new models anywhere after `ProductVariant`:

```prisma
model PlainTshirtStock {
  id        String   @id @default(cuid())
  color     String                     // display, e.g. "White"
  colorSlug String                     // matches ProductVariant.colorSlug
  size      String
  quantity  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  orderItems OrderItem[]

  @@unique([colorSlug, size])
}

model DtfDesign {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  quantity  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  products   Product[]
  orderItems OrderItem[]
}
```

In `model Product`, add a field and a relation, plus an index:

```prisma
model Product {
  id            String   @id
  name          String
  price         Float
  originalPrice Float?
  description   String
  categorySlug  String
  archived      Boolean  @default(false)
  dtfDesignId   String?

  category      Category       @relation(fields: [categorySlug], references: [slug])
  dtfDesign     DtfDesign?     @relation(fields: [dtfDesignId], references: [id], onDelete: Restrict)
  wishlistItems WishlistItem[]
  reviews       Review[]
  orderItems    OrderItem[]
  slugHistory   ProductSlugHistory[]
  variants      ProductVariant[]

  @@index([categorySlug])
  @@index([archived])
  @@index([dtfDesignId])
}
```

In `model VariantSizeStock`, delete the `stock` line entirely (it stays deleted from the Prisma schema now; the DB column drop is Migration B, the last task in this plan):

```prisma
model VariantSizeStock {
  id        String @id @default(cuid())
  variantId String
  size      String

  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([variantId, size])
  @@index([variantId])
}
```

In `model OrderItem`, add two nullable snapshot columns and their relations, plus indexes:

```prisma
model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  productId String?
  variantId String?
  color     String?
  sku       String?
  name      String
  size      String?
  price     Float
  quantity  Int
  plainTshirtStockId String?
  dtfDesignId        String?

  order            Order             @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product          Product?          @relation(fields: [productId], references: [id], onDelete: SetNull)
  variant          ProductVariant?   @relation(fields: [variantId], references: [id], onDelete: SetNull)
  plainTshirtStock PlainTshirtStock? @relation(fields: [plainTshirtStockId], references: [id], onDelete: SetNull)
  dtfDesign        DtfDesign?        @relation(fields: [dtfDesignId], references: [id], onDelete: SetNull)

  @@index([orderId])
  @@index([productId])
  @@index([variantId])
  @@index([plainTshirtStockId])
  @@index([dtfDesignId])
}
```

- [ ] **Step 2: Regenerate the Prisma client and type-check**

Run: `npx prisma generate`
Expected: `Generated Prisma Client ...` with no errors (this works without a live DB).

Run: `npx tsc --noEmit`
Expected: pre-existing errors only, from code that hasn't been updated yet for the removed `VariantSizeStock.stock` field (e.g. `app/_lib/variants.ts`, `app/checkout/actions.ts`). This is expected at this point in the plan — later tasks fix each one. If `tsc` reports errors in files *not* touched by later tasks in this plan, stop and investigate before continuing.

- [ ] **Step 3: Write the hand-authored migration SQL**

Create `prisma/migrations/20260711120000_add_tshirt_raw_material_inventory/migration.sql`:

```sql
-- Add T-shirt raw-material inventory: PlainTshirtStock + DtfDesign pools, plus
-- Product.dtfDesignId and OrderItem raw-material snapshot columns. Additive &
-- re-runnable per this repo's deploy convention. VariantSizeStock.stock is
-- retained here — a later migration (B) drops it once the new code is live.

CREATE TABLE IF NOT EXISTS "PlainTshirtStock" (
  "id"        TEXT NOT NULL,
  "color"     TEXT NOT NULL,
  "colorSlug" TEXT NOT NULL,
  "size"      TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlainTshirtStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlainTshirtStock_colorSlug_size_key" ON "PlainTshirtStock"("colorSlug", "size");

CREATE TABLE IF NOT EXISTS "DtfDesign" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DtfDesign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DtfDesign_slug_key" ON "DtfDesign"("slug");

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "dtfDesignId" TEXT;
CREATE INDEX IF NOT EXISTS "Product_dtfDesignId_idx" ON "Product"("dtfDesignId");

ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "plainTshirtStockId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "dtfDesignId" TEXT;
CREATE INDEX IF NOT EXISTS "OrderItem_plainTshirtStockId_idx" ON "OrderItem"("plainTshirtStockId");
CREATE INDEX IF NOT EXISTS "OrderItem_dtfDesignId_idx" ON "OrderItem"("dtfDesignId");

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_dtfDesignId_fkey"
    FOREIGN KEY ("dtfDesignId") REFERENCES "DtfDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_plainTshirtStockId_fkey"
    FOREIGN KEY ("plainTshirtStockId") REFERENCES "PlainTshirtStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dtfDesignId_fkey"
    FOREIGN KEY ("dtfDesignId") REFERENCES "DtfDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260711120000_add_tshirt_raw_material_inventory
git commit -m "feat(inventory): add PlainTshirtStock + DtfDesign schema (migration A)"
```

---

### Task 2: Shared pool restore/acquire helpers

**Files:**
- Create: `app/_lib/inventory-pools.ts`
- Test: `app/_lib/__tests__/inventory-pools.test.ts`

**Interfaces:**
- Consumes: nothing beyond `Prisma.TransactionClient` (from `@prisma/client`, produced by Task 1's `prisma generate`).
- Produces: `restoreItemPools(tx, item: { plainTshirtStockId: string | null; dtfDesignId: string | null; quantity: number }): Promise<void>` and `acquireItemPools(tx, item: { plainTshirtStockId: string | null; dtfDesignId: string | null; quantity: number; name: string }): Promise<void>` (throws `Error` on insufficient stock). Tasks 5, 7, and 8 call these directly.

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/inventory-pools.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { restoreItemPools, acquireItemPools } from "../inventory-pools";

function makeTx() {
  return {
    plainTshirtStock: { updateMany: vi.fn(async () => ({ count: 1 })) },
    dtfDesign: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
}

describe("restoreItemPools", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => { tx = makeTx(); });

  it("increments both pools when both ids are present", async () => {
    await restoreItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: "d1", quantity: 2 });
    expect(tx.plainTshirtStock.updateMany).toHaveBeenCalledWith({
      where: { id: "p1" }, data: { quantity: { increment: 2 } },
    });
    expect(tx.dtfDesign.updateMany).toHaveBeenCalledWith({
      where: { id: "d1" }, data: { quantity: { increment: 2 } },
    });
  });

  it("skips the plain pool when plainTshirtStockId is null", async () => {
    await restoreItemPools(tx as never, { plainTshirtStockId: null, dtfDesignId: "d1", quantity: 1 });
    expect(tx.plainTshirtStock.updateMany).not.toHaveBeenCalled();
    expect(tx.dtfDesign.updateMany).toHaveBeenCalledOnce();
  });

  it("skips the design pool when dtfDesignId is null", async () => {
    await restoreItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: null, quantity: 1 });
    expect(tx.plainTshirtStock.updateMany).toHaveBeenCalledOnce();
    expect(tx.dtfDesign.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when both ids are null (sizeless or pre-migration order item)", async () => {
    await restoreItemPools(tx as never, { plainTshirtStockId: null, dtfDesignId: null, quantity: 1 });
    expect(tx.plainTshirtStock.updateMany).not.toHaveBeenCalled();
    expect(tx.dtfDesign.updateMany).not.toHaveBeenCalled();
  });
});

describe("acquireItemPools", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => { tx = makeTx(); });

  it("guarded-decrements both pools when both ids are present", async () => {
    await acquireItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: "d1", quantity: 2, name: "Cat Tee" });
    expect(tx.plainTshirtStock.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } },
    });
    expect(tx.dtfDesign.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } },
    });
  });

  it("throws with the item name when the plain pool has insufficient stock", async () => {
    tx.plainTshirtStock.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      acquireItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: "d1", quantity: 5, name: "Cat Tee" }),
    ).rejects.toThrow('Insufficient stock for "Cat Tee"');
    expect(tx.dtfDesign.updateMany).not.toHaveBeenCalled();
  });

  it("throws with the item name when the design pool has insufficient stock", async () => {
    tx.dtfDesign.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      acquireItemPools(tx as never, { plainTshirtStockId: "p1", dtfDesignId: "d1", quantity: 5, name: "Cat Tee" }),
    ).rejects.toThrow('Insufficient stock for "Cat Tee"');
  });

  it("skips a pool whose id is null without throwing", async () => {
    await acquireItemPools(tx as never, { plainTshirtStockId: null, dtfDesignId: "d1", quantity: 1, name: "Gift Card" });
    expect(tx.plainTshirtStock.updateMany).not.toHaveBeenCalled();
    expect(tx.dtfDesign.updateMany).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- inventory-pools`
Expected: FAIL — `Cannot find module '../inventory-pools'`

- [ ] **Step 3: Write the implementation**

Create `app/_lib/inventory-pools.ts`:

```typescript
// Shared raw-material pool restore/acquire helpers used by every path that
// creates, cancels, edits, or fails an order: checkout, admin cancel/edit,
// and the payment-failure webhook all call these two functions so stock
// math never diverges between paths. Both skip a pool whose id is null —
// a sizeless line, an order predating this feature, or a pool row since
// deleted (OrderItem.plainTshirtStockId/dtfDesignId is onDelete: SetNull).
import type { Prisma } from "@prisma/client";

export type PoolItem = {
  plainTshirtStockId: string | null;
  dtfDesignId: string | null;
  quantity: number;
};

export type AcquireItem = PoolItem & { name: string };

export async function restoreItemPools(tx: Prisma.TransactionClient, item: PoolItem): Promise<void> {
  if (item.plainTshirtStockId) {
    await tx.plainTshirtStock.updateMany({
      where: { id: item.plainTshirtStockId },
      data: { quantity: { increment: item.quantity } },
    });
  }
  if (item.dtfDesignId) {
    await tx.dtfDesign.updateMany({
      where: { id: item.dtfDesignId },
      data: { quantity: { increment: item.quantity } },
    });
  }
}

// Guarded-decrements both pools. Throws if either has insufficient quantity,
// so the caller's transaction rolls back any prior work in the same batch.
export async function acquireItemPools(tx: Prisma.TransactionClient, item: AcquireItem): Promise<void> {
  if (item.plainTshirtStockId) {
    const r = await tx.plainTshirtStock.updateMany({
      where: { id: item.plainTshirtStockId, quantity: { gte: item.quantity } },
      data: { quantity: { decrement: item.quantity } },
    });
    if (r.count === 0) throw new Error(`Insufficient stock for "${item.name}"`);
  }
  if (item.dtfDesignId) {
    const r = await tx.dtfDesign.updateMany({
      where: { id: item.dtfDesignId, quantity: { gte: item.quantity } },
      data: { quantity: { decrement: item.quantity } },
    });
    if (r.count === 0) throw new Error(`Insufficient stock for "${item.name}"`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- inventory-pools`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add app/_lib/inventory-pools.ts app/_lib/__tests__/inventory-pools.test.ts
git commit -m "feat(inventory): add shared restore/acquire pool helpers"
```

---

### Task 3: Derived two-pool availability helpers (`app/_lib/variants.ts`)

**Files:**
- Modify: `app/_lib/variants.ts`
- Modify (full rewrite of the "stock helpers" describe block): `app/_lib/__tests__/variants.test.ts`

**Interfaces:**
- Produces: `PlainStockEntry = { id: string; quantity: number }`, `PlainStockMap = Map<string, PlainStockEntry>` (key: `` `${colorSlug}::${size}` ``), `DesignStockMap = Map<string, number>` (key: `dtfDesignId`), `plainStockKey(colorSlug, size): string`, `buildPlainStockMap(rows): PlainStockMap`, `buildDesignStockMap(rows): DesignStockMap`, `stockForSize(colorSlug, size, dtfDesignId, plainStock, designStock): number`, `designAvailable(dtfDesignId, designStock): boolean`, `availableSizes(sizes, colorSlug, dtfDesignId, plainStock, designStock): string[]`, `variantInStock(sizes, colorSlug, dtfDesignId, plainStock, designStock): boolean`, `productInStock(variants, dtfDesignId, plainStock, designStock): boolean`. `effectivePrice`, `effectiveOriginalPrice`, `resolveDefaultVariant`, `pickVariantBySlug`, `sizeRank`, `sortSizeStocks` are unchanged — every later task that imports them keeps the same signatures.
- Consumes: nothing external.

This replaces the old single-variant `sizeStocks: {size,stock}[]` model with the two-pool derived model: `stockForSize` is the fundamental primitive (design must be available, then it's `min(plain quantity, design quantity)`); every other helper is built on top of it.

- [ ] **Step 1: Write the failing tests**

In `app/_lib/__tests__/variants.test.ts`, replace the entire `describe("stock helpers", ...)` block (and its `grid` fixture) with:

```typescript
describe("plainStockKey / buildPlainStockMap / buildDesignStockMap", () => {
  it("keys plain stock by colorSlug::size", () => {
    expect(plainStockKey("white", "M")).toBe("white::M");
  });
  it("builds a map from rows keyed by colorSlug::size, carrying id + quantity", () => {
    const map = buildPlainStockMap([{ id: "ps1", colorSlug: "white", size: "M", quantity: 4 }]);
    expect(map.get("white::M")).toEqual({ id: "ps1", quantity: 4 });
  });
  it("builds a design map keyed by id", () => {
    const map = buildDesignStockMap([{ id: "d1", quantity: 3 }]);
    expect(map.get("d1")).toBe(3);
  });
});

describe("stockForSize (two-pool derived quantity)", () => {
  const plainStock = buildPlainStockMap([
    { id: "ps-white-s", colorSlug: "white", size: "S", quantity: 0 },
    { id: "ps-white-m", colorSlug: "white", size: "M", quantity: 4 },
  ]);
  const designStock = buildDesignStockMap([{ id: "d-cats", quantity: 2 }]);

  it("is zero when the design pool is missing or zero", () => {
    expect(stockForSize("white", "M", null, plainStock, designStock)).toBe(0);
    expect(stockForSize("white", "M", "unknown-design", plainStock, designStock)).toBe(0);
    expect(stockForSize("white", "M", "d-cats", plainStock, buildDesignStockMap([{ id: "d-cats", quantity: 0 }]))).toBe(0);
  });
  it("is zero when the plain pool is missing or zero", () => {
    expect(stockForSize("white", "S", "d-cats", plainStock, designStock)).toBe(0);
    expect(stockForSize("white", "XL", "d-cats", plainStock, designStock)).toBe(0);
  });
  it("is the minimum of the two pools when both are available", () => {
    expect(stockForSize("white", "M", "d-cats", plainStock, designStock)).toBe(2); // min(4, 2)
  });
});

describe("designAvailable", () => {
  const designStock = buildDesignStockMap([{ id: "d-cats", quantity: 2 }, { id: "d-empty", quantity: 0 }]);
  it("false for null, unknown, or zero-quantity design ids", () => {
    expect(designAvailable(null, designStock)).toBe(false);
    expect(designAvailable("unknown", designStock)).toBe(false);
    expect(designAvailable("d-empty", designStock)).toBe(false);
  });
  it("true when the design has quantity > 0", () => {
    expect(designAvailable("d-cats", designStock)).toBe(true);
  });
});

describe("availableSizes / variantInStock / productInStock (two-pool)", () => {
  const plainStock = buildPlainStockMap([
    { id: "ps1", colorSlug: "white", size: "S", quantity: 0 },
    { id: "ps2", colorSlug: "white", size: "M", quantity: 4 },
    { id: "ps3", colorSlug: "pink", size: "M", quantity: 3 },
  ]);
  const designStock = buildDesignStockMap([{ id: "d-cats", quantity: 2 }]);

  it("availableSizes returns only sizes with stock in both pools", () => {
    expect(availableSizes([{ size: "S" }, { size: "M" }], "white", "d-cats", plainStock, designStock)).toEqual(["M"]);
  });
  it("availableSizes is empty when the design is unavailable, regardless of plain stock", () => {
    expect(availableSizes([{ size: "M" }], "white", null, plainStock, designStock)).toEqual([]);
  });
  it("variantInStock is true iff at least one size clears both pools", () => {
    expect(variantInStock([{ size: "S" }, { size: "M" }], "white", "d-cats", plainStock, designStock)).toBe(true);
    expect(variantInStock([{ size: "S" }], "white", "d-cats", plainStock, designStock)).toBe(false);
  });
  it("productInStock is true iff any variant has an available size", () => {
    const variants = [
      { colorSlug: "white", sizes: [{ size: "S" }] },  // out of plain stock
      { colorSlug: "pink", sizes: [{ size: "M" }] },   // in stock
    ];
    expect(productInStock(variants, "d-cats", plainStock, designStock)).toBe(true);
    expect(productInStock([variants[0]], "d-cats", plainStock, designStock)).toBe(false);
  });
  it("productInStock is false for every variant when the design is unavailable", () => {
    const variants = [{ colorSlug: "pink", sizes: [{ size: "M" }] }];
    expect(productInStock(variants, null, plainStock, designStock)).toBe(false);
  });
});
```

And update the top-of-file import list to include the new exports:

```typescript
import {
  effectivePrice,
  effectiveOriginalPrice,
  plainStockKey,
  buildPlainStockMap,
  buildDesignStockMap,
  stockForSize,
  designAvailable,
  availableSizes,
  variantInStock,
  productInStock,
  resolveDefaultVariant,
  pickVariantBySlug,
  sortSizeStocks,
} from "../variants";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- variants.test`
Expected: FAIL — the old `stockForSize`/`availableSizes`/`variantInStock`/`productInStock` signatures don't match; `plainStockKey`/`buildPlainStockMap`/`buildDesignStockMap`/`designAvailable` don't exist yet.

- [ ] **Step 3: Rewrite the implementation**

In `app/_lib/variants.ts`, replace the four functions `variantInStock`, `productInStock`, `availableSizes`, `stockForSize` (lines 18–32 in the current file) with:

```typescript
export type PlainStockEntry = { id: string; quantity: number };
export type PlainStockMap = Map<string, PlainStockEntry>; // key: plainStockKey(colorSlug, size)
export type DesignStockMap = Map<string, number>;         // key: dtfDesignId -> quantity

export function plainStockKey(colorSlug: string, size: string): string {
  return `${colorSlug}::${size}`;
}

export function buildPlainStockMap(
  rows: { id: string; colorSlug: string; size: string; quantity: number }[],
): PlainStockMap {
  return new Map(rows.map((r) => [plainStockKey(r.colorSlug, r.size), { id: r.id, quantity: r.quantity }]));
}

export function buildDesignStockMap(rows: { id: string; quantity: number }[]): DesignStockMap {
  return new Map(rows.map((r) => [r.id, r.quantity]));
}

export function designAvailable(dtfDesignId: string | null, designStock: DesignStockMap): boolean {
  if (!dtfDesignId) return false;
  return (designStock.get(dtfDesignId) ?? 0) > 0;
}

// The fundamental two-pool primitive: how many units of this exact
// color+size+design combination can actually be fulfilled right now. Zero
// whenever the design is unavailable (a design hitting zero takes every size
// of every variant of that product out of stock, by construction).
export function stockForSize(
  colorSlug: string,
  size: string,
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): number {
  if (!designAvailable(dtfDesignId, designStock)) return 0;
  const designQty = designStock.get(dtfDesignId as string) ?? 0;
  const plainQty = plainStock.get(plainStockKey(colorSlug, size))?.quantity ?? 0;
  return Math.min(plainQty, designQty);
}

export function availableSizes(
  sizes: { size: string }[],
  colorSlug: string,
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): string[] {
  return sizes
    .filter((s) => stockForSize(colorSlug, s.size, dtfDesignId, plainStock, designStock) > 0)
    .map((s) => s.size);
}

export function variantInStock(
  sizes: { size: string }[],
  colorSlug: string,
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): boolean {
  return availableSizes(sizes, colorSlug, dtfDesignId, plainStock, designStock).length > 0;
}

export function productInStock(
  variants: { colorSlug: string; sizes: { size: string }[] }[],
  dtfDesignId: string | null,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): boolean {
  return variants.some((v) => variantInStock(v.sizes, v.colorSlug, dtfDesignId, plainStock, designStock));
}
```

Leave `effectivePrice`, `effectiveOriginalPrice`, `resolveDefaultVariant`, `pickVariantBySlug`, `sizeRank`, `sortSizeStocks`, and the `SIZE_ORDER` constant untouched. `sortSizeStocks` still operates on `{ size: string }[]` (it no longer needs `stock` since it only sorts) — no signature change needed there since it never read `.stock`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- variants.test`
Expected: PASS (all cases, including the untouched `effectivePrice`/`resolveDefaultVariant`/`pickVariantBySlug`/`sortSizeStocks` describes)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in files not yet updated (checkout, admin orders, products.ts, buy-box-client, product-jsonld, meta feed route) — all fixed by later tasks.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/variants.ts app/_lib/__tests__/variants.test.ts
git commit -m "feat(inventory): derive size availability from two raw-material pools"
```

---

### Task 4: Pool-aware cart validation (`app/_lib/order-validation.ts`)

**Files:**
- Modify: `app/_lib/order-validation.ts`
- Modify (full rewrite): `app/checkout/__tests__/variant-stock.test.ts`

**Interfaces:**
- Consumes: `stockForSize`, `PlainStockMap`, `DesignStockMap` from `app/_lib/variants.ts` (Task 3).
- Produces: `VariantStock = { colorSlug: string; dtfDesignId: string | null; sizes: { size: string }[] }`, `validateCartItems(items, variantMap, plainStock, designStock): string | null`. Task 5 (checkout) calls this with the exact same signature.

- [ ] **Step 1: Write the failing tests**

Replace `app/checkout/__tests__/variant-stock.test.ts` entirely:

```typescript
import { describe, it, expect } from "vitest";
import { validateCartItems, type VariantStock } from "@/app/_lib/order-validation";
import { buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";

const variantMap = (): Map<string, VariantStock> =>
  new Map([
    ["v-white", { colorSlug: "white", dtfDesignId: "d-cats", sizes: [{ size: "S" }, { size: "M" }] }],
    ["v-pink", { colorSlug: "pink", dtfDesignId: "d-cats", sizes: [{ size: "M" }] }],
    ["v-no-design", { colorSlug: "white", dtfDesignId: null, sizes: [{ size: "M" }] }],
  ]);

const plainStock = () => buildPlainStockMap([
  { id: "ps1", colorSlug: "white", size: "S", quantity: 0 },
  { id: "ps2", colorSlug: "white", size: "M", quantity: 3 },
  { id: "ps3", colorSlug: "pink", size: "M", quantity: 5 },
]);
const designStock = () => buildDesignStockMap([{ id: "d-cats", quantity: 10 }]);

describe("validateCartItems", () => {
  it("passes when both pools have enough stock", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 2 }], variantMap(), plainStock(), designStock())).toBeNull();
  });
  it("rejects an unknown variant", () => {
    expect(validateCartItems([{ variantId: "v-x", size: "M", name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/Unknown item/);
  });
  it("requires a size when the variant offers sizes", () => {
    expect(validateCartItems([{ variantId: "v-white", size: null, name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/select a size/);
  });
  it("rejects a size the variant does not offer", () => {
    expect(validateCartItems([{ variantId: "v-pink", size: "S", name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/not available/);
  });
  it("rejects when requested quantity exceeds the plain-tee pool", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 4 }], variantMap(), plainStock(), designStock())).toMatch(/Insufficient stock/);
  });
  it("rejects a size with zero plain-tee stock", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "S", name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/Insufficient stock/);
  });
  it("rejects when the product has no design assigned (null dtfDesignId)", () => {
    expect(validateCartItems([{ variantId: "v-no-design", size: "M", name: "Tee", quantity: 1 }], variantMap(), plainStock(), designStock())).toMatch(/Insufficient stock/);
  });
  it("rejects when the design pool is empty even though the plain-tee pool has stock", () => {
    const emptyDesigns = buildDesignStockMap([{ id: "d-cats", quantity: 0 }]);
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 1 }], variantMap(), plainStock(), emptyDesigns)).toMatch(/Insufficient stock/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- variant-stock`
Expected: FAIL — `validateCartItems` still takes the old 2-arg signature and `VariantStock` still has `sizeStocks: {size,stock}[]`.

- [ ] **Step 3: Rewrite the implementation**

Replace `app/_lib/order-validation.ts` entirely:

```typescript
// Pure cart-vs-inventory validation. No DB — the caller supplies a variant map
// plus the two raw-material stock maps. Kept separate from the "use server"
// action file so it can be unit-tested and so the action can import a
// non-async helper.
import { stockForSize, type PlainStockMap, type DesignStockMap } from "@/app/_lib/variants";

export type ValidatableItem = {
  variantId: string;
  size: string | null;
  name: string;
  quantity: number;
};

export type VariantStock = {
  colorSlug: string;
  dtfDesignId: string | null;
  sizes: { size: string }[]; // offered sizes (VariantSizeStock rows — no quantity on the row itself)
};

export function validateCartItems(
  items: ValidatableItem[],
  variantMap: Map<string, VariantStock>,
  plainStock: PlainStockMap,
  designStock: DesignStockMap,
): string | null {
  for (const item of items) {
    const v = variantMap.get(item.variantId);
    if (!v) return `Unknown item "${item.name}"`;
    const sizes = v.sizes.map((s) => s.size);
    if (sizes.length > 0) {
      if (!item.size) return `Please select a size for "${item.name}"`;
      if (!sizes.includes(item.size)) return `Size "${item.size}" is not available for "${item.name}"`;
      const available = stockForSize(v.colorSlug, item.size, v.dtfDesignId, plainStock, designStock);
      if (available < item.quantity) return `Insufficient stock for "${item.name}"`;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- variant-stock`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-validation.ts app/checkout/__tests__/variant-stock.test.ts
git commit -m "feat(inventory): validate cart items against the two raw-material pools"
```

---

### Task 5: Checkout dual-acquire + snapshot (`app/checkout/actions.ts`)

**Files:**
- Modify: `app/checkout/actions.ts`
- Modify: `app/checkout/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `acquireItemPools` (Task 2), `buildPlainStockMap`/`buildDesignStockMap`/`plainStockKey` (Task 3), `validateCartItems` (Task 4).
- Produces: `OrderItem` rows now carry `plainTshirtStockId`/`dtfDesignId`, which Tasks 6–8 read back for restores.

- [ ] **Step 1: Update the failing test mocks**

In `app/checkout/__tests__/actions.test.ts`, update the `vi.hoisted` mock data and the `prisma` mock:

```typescript
const { txOrderCreate, productVariantFindMany, plainStockFindMany, designFindMany } = vi.hoisted(() => ({
  txOrderCreate: vi.fn(async () => ({})),
  productVariantFindMany: vi.fn(async () => [
    {
      id: "V1",
      productId: "P1",
      color: "White",
      colorSlug: "white",
      sku: "DB-TEE-WHT-M",
      sizeStocks: [{ size: "S" }, { size: "M" }, { size: "L" }],
      product: { dtfDesignId: "D1" },
    },
  ]),
  plainStockFindMany: vi.fn(async () => [
    { id: "PS1", colorSlug: "white", size: "S", quantity: 5 },
    { id: "PS2", colorSlug: "white", size: "M", quantity: 5 },
    { id: "PS3", colorSlug: "white", size: "L", quantity: 5 },
  ]),
  designFindMany: vi.fn(async () => [{ id: "D1", quantity: 5 }]),
}));

vi.mock("@/app/_lib/auth", () => ({
  auth: vi.fn(async () => null),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(),
      update: vi.fn(async () => ({})),
    },
    productVariant: {
      findMany: productVariantFindMany,
    },
    plainTshirtStock: { findMany: plainStockFindMany },
    dtfDesign: { findMany: designFindMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        plainTshirtStock: {
          updateMany: async () => ({ count: 1 }),
        },
        dtfDesign: {
          updateMany: async () => ({ count: 1 }),
        },
        order: {
          create: txOrderCreate,
        },
        $queryRaw: vi.fn().mockResolvedValue([{ next: 42n }]),
      }),
    ),
  },
}));
```

And update `beforeEach` to reset/reseed the two new fetch mocks alongside the existing `productVariantFindMany` reset:

```typescript
beforeEach(() => {
  vi.mocked(bookCourierAndNotify).mockClear();
  vi.mocked(sendOrderConfirmationEmail).mockClear();
  vi.mocked(sendPendingPrepaidNotificationEmail).mockClear();
  vi.mocked(notifyOrderConfirmed).mockClear();
  txOrderCreate.mockClear();
  productVariantFindMany.mockReset();
  productVariantFindMany.mockResolvedValue([
    {
      id: "V1", productId: "P1", color: "White", colorSlug: "white", sku: "DB-TEE-WHT-M",
      sizeStocks: [{ size: "S" }, { size: "M" }, { size: "L" }],
      product: { dtfDesignId: "D1" },
    },
  ]);
  plainStockFindMany.mockReset().mockResolvedValue([
    { id: "PS1", colorSlug: "white", size: "S", quantity: 5 },
    { id: "PS2", colorSlug: "white", size: "M", quantity: 5 },
    { id: "PS3", colorSlug: "white", size: "L", quantity: 5 },
  ]);
  designFindMany.mockReset().mockResolvedValue([{ id: "D1", quantity: 5 }]);
});
```

No other test bodies in this file need to change — every existing assertion targets `txOrderCreate`'s `data.items.create[...].color`/`.sku`/order-level fields, none of which move. Only the "rejects a cart line when the selected variant belongs to another product" test's inline `productVariantFindMany.mockResolvedValueOnce([...])` payload needs the same shape update (add `colorSlug`, `product: { dtfDesignId: ... }`, drop `.stock` from `sizeStocks`):

```typescript
    productVariantFindMany.mockResolvedValueOnce([
      {
        id: "V1", productId: "OTHER-PRODUCT", color: "White", colorSlug: "white", sku: "DB-TEE-WHT-M",
        sizeStocks: [{ size: "M" }],
        product: { dtfDesignId: "D1" },
      },
    ]);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- checkout/__tests__/actions`
Expected: FAIL — `app/checkout/actions.ts` still calls the old `validateCartItems(items, variantMap)` 2-arg form and decrements `variantSizeStock`, which no longer exists on the transaction mock.

- [ ] **Step 3: Rewrite `app/checkout/actions.ts`**

Add to the imports at the top:

```typescript
import { acquireItemPools } from "@/app/_lib/inventory-pools";
import { buildPlainStockMap, buildDesignStockMap, plainStockKey } from "@/app/_lib/variants";
```

Replace the variant-fetch + validation block (currently starting at `// Validate each line against its variant's size-stock grid.`) with:

```typescript
  // Validate each line against the two raw-material pools its variant/design draw from.
  const variantIds = Array.from(new Set(items.map((i) => i.variantId)));
  const dbVariants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      productId: true,
      color: true,
      colorSlug: true,
      sku: true,
      sizeStocks: { select: { size: true } },
      product: { select: { dtfDesignId: true } },
    },
  });
  const variantMap = new Map<
    string,
    VariantStock & { productId: string; color: string; colorSlug: string; sku: string | null }
  >(
    dbVariants.map((v) => [
      v.id,
      {
        productId: v.productId,
        color: v.color,
        colorSlug: v.colorSlug,
        sku: v.sku,
        dtfDesignId: v.product.dtfDesignId,
        sizes: v.sizeStocks,
      },
    ]),
  );
  for (const item of items) {
    const variant = variantMap.get(item.variantId);
    if (variant && variant.productId !== item.productId) {
      return { success: false, error: `Selected variant does not belong to "${item.name}"` };
    }
  }
  const [plainStockRows, designStockRows] = await Promise.all([
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
  ]);
  const plainStock = buildPlainStockMap(plainStockRows);
  const designStock = buildDesignStockMap(designStockRows);
  const validationError = validateCartItems(
    items.map((item) => ({ ...item, size: item.size ?? null })),
    variantMap,
    plainStock,
    designStock,
  );
  if (validationError) return { success: false, error: validationError };
```

Replace the transaction body's stock-decrement loop and the `order.create` call:

```typescript
  // Create the order + acquire both raw-material pools atomically. Each
  // guarded decrement re-checks the row's current quantity, so concurrent
  // purchases of the last unit can't oversell.
  let created: { webNumber: string | null; paymentStatus: string | null };
  try {
    created = await prisma.$transaction(async (tx) => {
      const poolByIndex = new Map<number, { plainTshirtStockId: string | null; dtfDesignId: string | null }>();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.size) continue; // sizeless variants carry no per-size pool
        const variant = variantMap.get(item.variantId)!;
        const plainEntry = plainStock.get(plainStockKey(variant.colorSlug, item.size));
        const pool = { plainTshirtStockId: plainEntry?.id ?? null, dtfDesignId: variant.dtfDesignId };
        await acquireItemPools(tx, { ...pool, quantity: item.quantity, name: item.name });
        poolByIndex.set(i, pool);
      }

      const webNumber = await nextWebNumber(tx);
      const paymentStatus = initialPaymentStatus(paymentMethod);

      return tx.order.create({
        data: {
          id: orderId,
          userId,
          guestName,
          guestEmail,
          customerPhone: contactPhone,
          alternatePhone: alternatePhone ?? null,
          shippingLine1: shippingAddress.line1,
          shippingLine2: shippingAddress.line2 ?? null,
          shippingCity: shippingAddress.city,
          shippingCountry: shippingAddress.country,
          subtotal,
          shippingCost,
          total,
          paymentMethod,
          paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
          status: "PENDING",
          paymentStatus,
          webNumber,
          idempotencyKey: idempotencyKey ?? null,
          notes: notes && notes.length > 0 ? notes : null,
          items: {
            create: items.map((item, i) => ({
              productId: item.productId,
              variantId: item.variantId,
              color: variantMap.get(item.variantId)?.color ?? null,
              sku: variantMap.get(item.variantId)?.sku ?? null,
              name: item.name,
              size: item.size ?? null,
              price: item.price,
              quantity: item.quantity,
              plainTshirtStockId: poolByIndex.get(i)?.plainTshirtStockId ?? null,
              dtfDesignId: poolByIndex.get(i)?.dtfDesignId ?? null,
            })),
          },
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create order";
    return { success: false, error: message };
  }
```

Everything below this (the email/notification branching) is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- checkout/__tests__/actions`
Expected: PASS (all existing cases)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in admin orders/products, products.ts, buy-box-client, product-jsonld, meta feed route — fixed by later tasks.

- [ ] **Step 6: Commit**

```bash
git add app/checkout/actions.ts app/checkout/__tests__/actions.test.ts
git commit -m "feat(inventory): acquire both raw-material pools at checkout"
```

---

### Task 6: Simplify `applyItemChanges` to pure item math (`app/_lib/admin-orders.ts`)

**Files:**
- Modify: `app/_lib/admin-orders.ts`
- Modify: `app/_lib/__tests__/admin-orders.test.ts`

**Interfaces:**
- Produces: `OrderItemRow = { id, variantId, name, size, price, quantity, plainTshirtStockId, dtfDesignId }`, `NextItem = OrderItemRow & { sizeChanged: boolean }`, `applyItemChanges(current: OrderItemRow[], changes: ItemChange[]): { nextItems: NextItem[] }`. `ItemChange`, `recomputeTotals`, `buildOrderWhere`, `nextStatuses`, `canEdit`, `canCancel`, `canConfirm`, `listOrders`, `getOrderDetail`, `PAGE_SIZE`, `ORDER_TABS` are all unchanged. Task 7 (`editItems`) is the sole consumer of the new shape.

`applyItemChanges` no longer computes stock deltas at all — it stops being the place stock math happens. It only replays the requested quantity/size/removal changes onto the item list and flags which surviving items had their size changed, so the caller (Task 7) knows which items need a new `plainTshirtStockId` resolved. All stock math now lives in the shared `restoreItemPools`/`acquireItemPools` helpers (Task 2), called by `editItems` in a restore-everything-then-reacquire-everything pattern.

- [ ] **Step 1: Write the failing tests**

In `app/_lib/__tests__/admin-orders.test.ts`, replace the entire `describe("applyItemChanges", ...)` block (and its `makeItems` fixture) with:

```typescript
import { applyItemChanges } from "../admin-orders";

const makeItems = () => [
  { id: "i1", variantId: "v1", name: "Dress", size: "M", price: 6500, quantity: 1, plainTshirtStockId: "ps1", dtfDesignId: "d1" },
  { id: "i2", variantId: "v2", name: "Scarf", size: "S", price: 2000, quantity: 2, plainTshirtStockId: "ps2", dtfDesignId: "d2" },
];

describe("applyItemChanges", () => {
  it("changes quantity in place, unflagged as a size change", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i2", quantity: 1 }]);
    const i2 = nextItems.find((i) => i.id === "i2")!;
    expect(i2.quantity).toBe(1);
    expect(i2.sizeChanged).toBe(false);
    expect(i2.plainTshirtStockId).toBe("ps2"); // frozen id carried through unchanged
  });

  it("removing an item drops it from nextItems", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i2", remove: true }]);
    expect(nextItems.map((i) => i.id)).toEqual(["i1"]);
  });

  it("a size-only change flags sizeChanged and carries the frozen plainTshirtStockId forward for the caller to re-resolve", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i1", size: "L" }]);
    const i1 = nextItems.find((i) => i.id === "i1")!;
    expect(i1.size).toBe("L");
    expect(i1.sizeChanged).toBe(true);
    expect(i1.plainTshirtStockId).toBe("ps1"); // still the OLD id — caller resolves the new one
  });

  it("a combined size+quantity change applies both and still flags sizeChanged", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i1", size: "L", quantity: 3 }]);
    const i1 = nextItems.find((i) => i.id === "i1")!;
    expect(i1.size).toBe("L");
    expect(i1.quantity).toBe(3);
    expect(i1.sizeChanged).toBe(true);
  });

  it("no size change leaves sizeChanged false even when quantity also changes", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i1", quantity: 5 }]);
    expect(nextItems.find((i) => i.id === "i1")!.sizeChanged).toBe(false);
  });

  it("rejects reducing quantity to zero (use remove instead)", () => {
    expect(() => applyItemChanges(makeItems(), [{ id: "i1", quantity: 0 }])).toThrow();
  });

  it("rejects an unknown item id", () => {
    expect(() => applyItemChanges(makeItems(), [{ id: "does-not-exist", quantity: 1 }])).toThrow("Unknown order item: does-not-exist");
  });

  it("an unchanged item passes through with sizeChanged false", () => {
    const { nextItems } = applyItemChanges(makeItems(), [{ id: "i2", quantity: 2 }]);
    const i1 = nextItems.find((i) => i.id === "i1")!;
    expect(i1).toMatchObject({ size: "M", quantity: 1, sizeChanged: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- admin-orders.test`
Expected: FAIL — `applyItemChanges` still returns `{ nextItems, stockDeltas }` keyed on `(variantId, size)`, and `OrderItemRow` doesn't have `plainTshirtStockId`/`dtfDesignId`/the fixture doesn't have `sizeChanged`.

- [ ] **Step 3: Rewrite the implementation**

In `app/_lib/admin-orders.ts`, replace `OrderItemRow`, `StockDelta`, and `applyItemChanges` (currently lines 67–142) with:

```typescript
export type OrderItemRow = {
  id: string;
  // Null when the referenced variant was hard-deleted (FK ON DELETE SET NULL).
  variantId: string | null;
  name: string;
  size: string | null;
  price: number;
  quantity: number;
  // Frozen raw-material pool ids this line consumed at order-creation time
  // (or the last time its size changed). Null for sizeless lines or orders
  // that predate this feature.
  plainTshirtStockId: string | null;
  dtfDesignId: string | null;
};

export type ItemChange = {
  id: string;
  quantity?: number;
  size?: string | null;
  remove?: boolean;
};

export type NextItem = OrderItemRow & { sizeChanged: boolean };

/**
 * Applies edit-mode changes to the order's items. Pure item-list math only —
 * it does NOT touch stock. The caller (editItems) restores every original
 * item's pools and reacquires every surviving item's pools via the shared
 * restoreItemPools/acquireItemPools helpers; unchanged lines net to zero.
 * `sizeChanged` tells the caller which surviving items need a NEW
 * plainTshirtStockId resolved (the design never changes on an edit, so
 * dtfDesignId is always carried through as-is).
 */
export function applyItemChanges(
  current: OrderItemRow[],
  changes: ItemChange[],
): { nextItems: NextItem[] } {
  const byId = new Map(current.map((i) => [i.id, { ...i }]));
  const originalSizeById = new Map(current.map((i) => [i.id, i.size]));

  for (const change of changes) {
    const item = byId.get(change.id);
    if (!item) throw new Error(`Unknown order item: ${change.id}`);
    if (change.remove) {
      byId.delete(change.id);
      continue;
    }
    if (change.quantity !== undefined) {
      if (change.quantity <= 0) throw new Error("Quantity must be positive; remove the item instead");
      item.quantity = change.quantity;
    }
    if (change.size !== undefined) item.size = change.size;
  }

  const nextItems: NextItem[] = [...byId.values()].map((item) => ({
    ...item,
    sizeChanged: item.size !== originalSizeById.get(item.id),
  }));
  return { nextItems };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- admin-orders.test`
Expected: PASS (all `applyItemChanges` cases, plus the untouched `buildOrderWhere`/`recomputeTotals`/status-transition/`canConfirm` describes below it in the same file)

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-orders.ts app/_lib/__tests__/admin-orders.test.ts
git commit -m "refactor(inventory): simplify applyItemChanges to pure item math"
```

---

### Task 7: Rewire admin cancel + edit onto the shared pool helpers (`app/admin/orders/actions.ts`)

**Files:**
- Modify: `app/admin/orders/actions.ts`
- Modify: `app/admin/orders/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `restoreItemPools`/`acquireItemPools` (Task 2), `applyItemChanges`/`NextItem` (Task 6).
- Produces: no new exports; `cancelOrder`, `bulkCancel`, `editItems` keep their existing signatures and `ActionResult` return type.

**Note on `getOrderDetail`** (`app/_lib/admin-orders.ts`): its `items.variant.sizeStocks` select only reads `{ size: true }` (confirmed by inspection — it never selected `.stock`), so the order-edit page's "change to size" dropdown needs no change; it already lists structurally-offered sizes, unfiltered by quantity, exactly as it does today. No task needed for it, but re-verify this after Task 1's schema edit by confirming `app/_lib/admin-orders.ts` still compiles clean under `tsc --noEmit`.

- [ ] **Step 1: Update the failing test mocks**

In `app/admin/orders/__tests__/actions.test.ts`, replace the top-of-file mock setup:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { orderFindUnique, orderUpdate, orderDelete, noteCreate, plainStockUpdateMany, plainStockFindUnique, dtfDesignUpdateMany, txn } = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderDelete: vi.fn(),
  noteCreate: vi.fn(),
  plainStockUpdateMany: vi.fn(),
  plainStockFindUnique: vi.fn(),
  dtfDesignUpdateMany: vi.fn(),
  txn: vi.fn(),
}));
const { orderItemUpdate, orderItemDelete } = vi.hoisted(() => ({
  orderItemUpdate: vi.fn(),
  orderItemDelete: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/store-settings", () => ({
  getDeliveryConfig: vi.fn().mockResolvedValue({ colombo: 350, other: 450, freeThreshold: 5000 }),
}));

const { bookCourierAndNotify } = vi.hoisted(() => ({ bookCourierAndNotify: vi.fn() }));
vi.mock("@/app/checkout/book-courier", () => ({ bookCourierAndNotify }));
const { sendOrderConfirmationEmail, sendCustomerDispatchEmail, sendCustomerCancellationEmail, logMailerError } = vi.hoisted(() => ({
  sendOrderConfirmationEmail: vi.fn(),
  sendCustomerDispatchEmail: vi.fn(),
  sendCustomerCancellationEmail: vi.fn(),
  logMailerError: vi.fn(),
}));
vi.mock("@/app/_lib/mailer", () => ({ sendOrderConfirmationEmail, sendCustomerDispatchEmail, sendCustomerCancellationEmail, logMailerError }));

const { notifyOrderDispatched, notifyOrderCancelled } = vi.hoisted(() => ({
  notifyOrderDispatched: vi.fn(),
  notifyOrderCancelled: vi.fn(),
}));
vi.mock("@/app/_lib/order-notifications", () => ({ notifyOrderDispatched, notifyOrderCancelled }));

vi.mock("@/app/_lib/prisma", () => {
  const client = {
    order: { findUnique: orderFindUnique, update: orderUpdate, delete: orderDelete },
    orderNote: { create: noteCreate },
    plainTshirtStock: { updateMany: plainStockUpdateMany, findUnique: plainStockFindUnique },
    dtfDesign: { updateMany: dtfDesignUpdateMany },
    orderItem: { update: orderItemUpdate, delete: orderItemDelete },
  };
  return { prisma: { ...client, $transaction: txn.mockImplementation(async (fn: (c: unknown) => unknown) => fn(client)) } };
});

import { addNote, markCodCollected } from "../actions";

beforeEach(() => {
  process.env.ROYAL_EXPRESS_ENABLED = "true";
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  orderFindUnique.mockReset();
  orderUpdate.mockReset();
  orderDelete.mockReset();
  noteCreate.mockReset();
  plainStockUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  plainStockFindUnique.mockReset();
  dtfDesignUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  orderItemUpdate.mockReset();
  orderItemDelete.mockReset();
  txn.mockReset().mockImplementation(async (fn: (c: unknown) => unknown) => {
    const client = {
      order: { findUnique: orderFindUnique, update: orderUpdate, delete: orderDelete },
      orderNote: { create: noteCreate },
      plainTshirtStock: { updateMany: plainStockUpdateMany, findUnique: plainStockFindUnique },
      dtfDesign: { updateMany: dtfDesignUpdateMany },
      orderItem: { update: orderItemUpdate, delete: orderItemDelete },
    };
    return fn(client);
  });
  bookCourierAndNotify.mockReset();
  sendOrderConfirmationEmail.mockReset();
  sendCustomerDispatchEmail.mockReset();
  sendCustomerCancellationEmail.mockReset();
  logMailerError.mockReset();
  notifyOrderDispatched.mockReset();
  notifyOrderCancelled.mockReset();
});
```

`addNote`, `markCodCollected`, `advanceStatus`, `editAddress`, `bookCourier`, `dispatchManually`, `updateTrackingNumber`, `resendConfirmationEmail`, `bulkConfirm`, `bulkDispatch` tests are all untouched by this rename — leave every describe block for those exactly as-is.

Replace the `describe("cancelOrder", ...)` block:

```typescript
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

  it("restores both pools and warns when the order was paid", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "PAID",
      items: [{ plainTshirtStockId: "ps1", dtfDesignId: "d1", quantity: 2 }],
    });
    const res = await cancelOrder("o1");
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { quantity: { increment: 2 } } });
    expect(dtfDesignUpdateMany).toHaveBeenCalledWith({ where: { id: "d1" }, data: { quantity: { increment: 2 } } });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res).toEqual({ success: true, warning: "Order was paid — refund must be handled manually." });
  });

  it("skips a pool whose id is null (sizeless item, or an order predating this feature)", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "PENDING",
      guestName: null, guestEmail: null, user: null,
      items: [
        { plainTshirtStockId: null, dtfDesignId: null, name: "Gone", size: "M", price: 6500, quantity: 2 },
        { plainTshirtStockId: null, dtfDesignId: "d2", name: "Scarf", size: null, price: 2000, quantity: 3 },
        { plainTshirtStockId: "ps1", dtfDesignId: "d1", name: "Dress", size: "M", price: 1000, quantity: 1 },
      ],
    });
    const res = await cancelOrder("o1");
    expect(plainStockUpdateMany).toHaveBeenCalledTimes(1);
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { quantity: { increment: 1 } } });
    expect(dtfDesignUpdateMany).toHaveBeenCalledTimes(2); // items 2 and 3 both carry a dtfDesignId
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "CANCELLED" } });
    expect(res).toEqual({ success: true });
  });

  it("emails the customer that their order was cancelled", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "COD_PENDING",
      guestName: "Nimali", guestEmail: "n@x.test", user: null,
      webNumber: "WEB1", rbNumber: null, trackingCode: null,
      items: [{ plainTshirtStockId: "ps1", dtfDesignId: "d1", name: "Dress", size: "M", price: 1000, quantity: 1 }],
    });
    const res = await cancelOrder("o1");
    expect(notifyOrderCancelled).toHaveBeenCalledTimes(1);
    expect(notifyOrderCancelled.mock.calls[0][0].customerEmail).toBe("n@x.test");
    expect(res).toEqual({ success: true });
  });

  it("does not email when the order has no customer email", async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: "o1", status: "CONFIRMED", paymentStatus: "COD_PENDING",
      guestName: null, guestEmail: null, user: null,
      items: [{ plainTshirtStockId: "ps1", dtfDesignId: "d1", name: "Dress", size: "M", price: 1000, quantity: 1 }],
    });
    await cancelOrder("o1");
    expect(notifyOrderCancelled).toHaveBeenCalledTimes(1);
  });
});
```

Replace the `describe("editItems", ...)` block:

```typescript
describe("editItems", () => {
  const ORDER = {
    id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", shippingCity: "Colombo",
    items: [
      { id: "i1", variantId: "v1", name: "Dress", size: "M", price: 2000, quantity: 2, plainTshirtStockId: "ps1", dtfDesignId: "d1" },
    ],
  };

  it("rejects editing a cancelled order", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, status: "CANCELLED" });
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    expect(res).toEqual({ success: false, error: "This order can no longer be edited" });
  });

  it("decreasing quantity restores the full original quantity then reacquires the new one, recomputing totals", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    orderUpdate.mockResolvedValueOnce({});
    orderItemUpdate.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", quantity: 1 }]);
    expect(plainStockUpdateMany).toHaveBeenNthCalledWith(1, { where: { id: "ps1" }, data: { quantity: { increment: 2 } } });
    expect(plainStockUpdateMany).toHaveBeenNthCalledWith(2, { where: { id: "ps1", quantity: { gte: 1 } }, data: { quantity: { decrement: 1 } } });
    expect(orderItemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { quantity: 1, size: "M", plainTshirtStockId: "ps1" } });
    // subtotal 2000 (qty 2→1 at price 2000), Colombo, below the 5000 free-shipping threshold → 350 shipping
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 2000, shippingCost: 350, total: 2350 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("remove path: deletes the item and restores its full quantity, recomputing totals to zero subtotal", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    orderUpdate.mockResolvedValueOnce({});
    orderItemDelete.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", remove: true }]);
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { quantity: { increment: 2 } } });
    expect(dtfDesignUpdateMany).toHaveBeenCalledWith({ where: { id: "d1" }, data: { quantity: { increment: 2 } } });
    expect(orderItemDelete).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "o1" },
      data: expect.objectContaining({ subtotal: 0 }),
    }));
    expect(res).toEqual({ success: true });
  });

  it("fails the increase when the reacquire has insufficient plain-tee stock", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    plainStockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // the restore call always succeeds
      .mockResolvedValueOnce({ count: 0 }); // the reacquire at the higher quantity fails
    const res = await editItems("o1", [{ id: "i1", quantity: 10 }]);
    expect(res).toEqual({ success: false, error: 'Insufficient stock for "Dress"' });
    expect(orderItemUpdate).not.toHaveBeenCalled();
  });

  it("a size change resolves the new color+size pool from the frozen row's colorSlug, not the variant's current color", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    plainStockFindUnique
      .mockResolvedValueOnce({ colorSlug: "white" }) // lookup of the OLD pool row's colorSlug, by id "ps1"
      .mockResolvedValueOnce({ id: "ps-white-l" });   // lookup of the NEW (white, L) pool row
    orderUpdate.mockResolvedValueOnce({});
    orderItemUpdate.mockResolvedValueOnce({});
    const res = await editItems("o1", [{ id: "i1", size: "L" }]);
    expect(plainStockFindUnique).toHaveBeenNthCalledWith(1, { where: { id: "ps1" }, select: { colorSlug: true } });
    expect(plainStockFindUnique).toHaveBeenNthCalledWith(2, { where: { colorSlug_size: { colorSlug: "white", size: "L" } }, select: { id: true } });
    expect(orderItemUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { quantity: 2, size: "L", plainTshirtStockId: "ps-white-l" } });
    expect(res).toEqual({ success: true });
  });

  it("rejects a size change when the target color+size has no matching pool row", async () => {
    orderFindUnique.mockResolvedValueOnce(ORDER);
    plainStockFindUnique
      .mockResolvedValueOnce({ colorSlug: "white" })
      .mockResolvedValueOnce(null); // no (white, XXL) pool row exists
    const res = await editItems("o1", [{ id: "i1", size: "XXL" }]);
    expect(res).toEqual({ success: false, error: 'Size "XXL" is not available for "Dress"' });
    expect(orderItemUpdate).not.toHaveBeenCalled();
  });
});
```

In `describe("bulkCancel", ...)`, replace the single test:

```typescript
describe("bulkCancel", () => {
  it("cancels eligible orders, restores both pools, and skips terminal ones", async () => {
    orderFindUnique
      .mockResolvedValueOnce({ id: "o1", status: "CONFIRMED", paymentStatus: "PENDING", items: [{ plainTshirtStockId: "ps1", dtfDesignId: "d1", quantity: 2 }] })
      .mockResolvedValueOnce({ id: "o2", status: "CANCELLED", paymentStatus: "PENDING", items: [] })
      .mockResolvedValueOnce({ id: "o3", status: "DELIVERED", paymentStatus: "PAID", items: [{ plainTshirtStockId: "ps9", dtfDesignId: "d9", quantity: 1 }] });
    orderUpdate.mockResolvedValue({});

    const res = await bulkCancel(["o1", "o2", "o3"]);

    expect(plainStockUpdateMany).toHaveBeenCalledTimes(1);
    expect(plainStockUpdateMany).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { quantity: { increment: 2 } } });
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

In `describe("deleteOrder", ...)`, replace every `expect(variantSizeStockUpdateMany).not.toHaveBeenCalled();` with `expect(plainStockUpdateMany).not.toHaveBeenCalled(); expect(dtfDesignUpdateMany).not.toHaveBeenCalled();` (both `it` blocks). Same substitution in `describe("bulkDelete", ...)`'s `expect(variantSizeStockUpdateMany).not.toHaveBeenCalled(); // delete must never restore stock` line.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- admin/orders/__tests__/actions`
Expected: FAIL — `app/admin/orders/actions.ts` still references `tx.variantSizeStock`, which the new mock no longer provides.

- [ ] **Step 3: Rewrite `app/admin/orders/actions.ts`**

Add to the imports:

```typescript
import { restoreItemPools, acquireItemPools } from "@/app/_lib/inventory-pools";
```

Replace `cancelOrderTx` (currently lines 96–110):

```typescript
/**
 * Stock-restore + status flip for a cancellation, inside a caller-provided
 * transaction. Shared by cancelOrder (single) and bulkCancel (many) so the two
 * paths never diverge. Eligibility checks are the caller's responsibility.
 */
async function cancelOrderTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  items: { plainTshirtStockId: string | null; dtfDesignId: string | null; quantity: number }[],
): Promise<void> {
  for (const it of items) {
    await restoreItemPools(tx, it);
  }
  await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
}
```

Update `CANCEL_INCLUDE` (currently lines 278–291) to select the two new snapshot fields:

```typescript
const CANCEL_INCLUDE = {
  user: { select: { name: true, email: true } },
  items: {
    select: {
      variantId: true,
      plainTshirtStockId: true,
      dtfDesignId: true,
      name: true,
      color: true,
      sku: true,
      size: true,
      price: true,
      quantity: true,
    },
  },
} satisfies Prisma.OrderInclude;
```

Add a small resolver helper just above `editItems`:

```typescript
// Resolves the pool row for a NEW size, using the OLD pool row's frozen
// colorSlug (not the variant's current color) — the same freeze-at-order-time
// principle that motivates the OrderItem snapshot columns. Returns null when
// there's nothing to resolve from (sizeless/pre-migration item) or no pool
// row exists for that color+size.
async function resolveNewPlainPool(
  tx: Prisma.TransactionClient,
  oldPlainTshirtStockId: string | null,
  newSize: string,
): Promise<string | null> {
  if (!oldPlainTshirtStockId) return null;
  const oldRow = await tx.plainTshirtStock.findUnique({ where: { id: oldPlainTshirtStockId }, select: { colorSlug: true } });
  if (!oldRow) return null;
  const newRow = await tx.plainTshirtStock.findUnique({
    where: { colorSlug_size: { colorSlug: oldRow.colorSlug, size: newSize } },
    select: { id: true },
  });
  return newRow?.id ?? null;
}
```

Replace `editItems` (currently lines 175–234):

```typescript
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
      order.items.map((i) => ({
        id: i.id, variantId: i.variantId, name: i.name, size: i.size, price: i.price, quantity: i.quantity,
        plainTshirtStockId: i.plainTshirtStockId, dtfDesignId: i.dtfDesignId,
      })),
      changes,
    );
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Invalid change" };
  }

  const totals = recomputeTotals(next.nextItems, order.shippingCity, await getDeliveryConfig());

  try {
    await prisma.$transaction(async (tx) => {
      // Restore every original line's pools, then reacquire every surviving
      // line's pools at its new quantity/size. Unchanged lines net to zero; a
      // failed reacquire rolls back every restore/acquire in this transaction.
      for (const original of order.items) {
        await restoreItemPools(tx, original);
      }

      const keptIds = new Set(next.nextItems.map((i) => i.id));
      for (const original of order.items) {
        if (!keptIds.has(original.id)) {
          await tx.orderItem.delete({ where: { id: original.id } });
        }
      }

      for (const item of next.nextItems) {
        let plainTshirtStockId = item.plainTshirtStockId;
        if (item.sizeChanged) {
          plainTshirtStockId = item.size ? await resolveNewPlainPool(tx, item.plainTshirtStockId, item.size) : null;
          if (item.size && item.plainTshirtStockId && !plainTshirtStockId) {
            throw new Error(`Size "${item.size}" is not available for "${item.name}"`);
          }
        }
        await acquireItemPools(tx, {
          plainTshirtStockId, dtfDesignId: item.dtfDesignId, quantity: item.quantity, name: item.name,
        });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity, size: item.size, plainTshirtStockId },
        });
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- admin/orders/__tests__/actions`
Expected: PASS (all describe blocks, including the untouched `addNote`/`markCodCollected`/`advanceStatus`/`editAddress`/`bookCourier`/`dispatchManually`/`updateTrackingNumber`/`resendConfirmationEmail`/`bulkConfirm`/`bulkDispatch`/`deleteOrder`/`bulkDelete`)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in `payments/order-finalization.ts`, `admin-products.ts`, `admin/products/actions.ts`, product-form/variant-editor, `products.ts`, buy-box-client, product-jsonld, meta feed route, seed/mock — fixed by later tasks.

- [ ] **Step 6: Commit**

```bash
git add app/admin/orders/actions.ts app/admin/orders/__tests__/actions.test.ts
git commit -m "feat(inventory): rewire admin cancel/edit onto the shared pool helpers"
```

---

### Task 8: Rewire payment-failure restore (`app/_lib/payments/order-finalization.ts`)

**Files:**
- Modify: `app/_lib/payments/order-finalization.ts`
- Modify: `app/_lib/payments/__tests__/order-finalization.test.ts`

**Interfaces:**
- Consumes: `restoreItemPools` (Task 2).
- Produces: no signature change to `finalizeFailedPayment`/`finalizePaidPayment`.

- [ ] **Step 1: Update the failing test mocks**

In `app/_lib/payments/__tests__/order-finalization.test.ts`, replace the `vi.hoisted` block and `vi.mock("@/app/_lib/prisma", ...)`:

```typescript
const {
  orderFindUnique,
  orderUpdate,
  orderUpdateMany,
  plainStockUpdateMany,
  dtfDesignUpdateMany,
  orderItemFindMany,
  sendOrderConfirmationEmail,
  sendAdminFailureAlertEmail,
  bookCourierAndNotify,
} = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderUpdateMany: vi.fn(),
  plainStockUpdateMany: vi.fn(),
  dtfDesignUpdateMany: vi.fn(),
  orderItemFindMany: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  sendAdminFailureAlertEmail: vi.fn(),
  bookCourierAndNotify: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { findUnique: orderFindUnique, update: orderUpdate, updateMany: orderUpdateMany },
    orderItem: { findMany: orderItemFindMany },
    plainTshirtStock: { updateMany: plainStockUpdateMany },
    dtfDesign: { updateMany: dtfDesignUpdateMany },
    $transaction: vi.fn(async (fn) =>
      fn({
        order: { findUnique: orderFindUnique, update: orderUpdate, updateMany: orderUpdateMany },
        plainTshirtStock: { updateMany: plainStockUpdateMany },
        dtfDesign: { updateMany: dtfDesignUpdateMany },
      }),
    ),
  },
}));
```

Update the `ITEMS` fixture to carry the two frozen pool ids instead of only `variantId`:

```typescript
const ITEMS = [
  {
    variantId: "V1",
    plainTshirtStockId: "PS1",
    dtfDesignId: "D1",
    color: "White",
    sku: "DB-TEE-WHT-M",
    name: "Tee",
    size: "M",
    price: 1000,
    quantity: 2,
  },
];
```

Update the three assertions that reference `variantSizeStockUpdateMany`:

```typescript
  it("marks failed, cancels order, and restores both pools once", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "ORD-1",
        paymentStatus: { notIn: ["PAID", "PAYMENT_FAILED"] },
        status: { not: "CANCELLED" },
      },
      data: { paymentStatus: "PAYMENT_FAILED", status: "CANCELLED" },
    });
    expect(plainStockUpdateMany).toHaveBeenCalledWith({
      where: { id: "PS1" }, data: { quantity: { increment: 2 } },
    });
    expect(dtfDesignUpdateMany).toHaveBeenCalledWith({
      where: { id: "D1" }, data: { quantity: { increment: 2 } },
    });
    expect(notifyOrderConfirmed).not.toHaveBeenCalled();
  });

  it("does not restore stock when already failed", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, paymentStatus: "PAYMENT_FAILED", status: "CANCELLED", items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(plainStockUpdateMany).not.toHaveBeenCalled();
  });

  it("ignores failure when already paid", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, paymentStatus: "PAID", items: ITEMS });

    await finalizeFailedPayment("ORD-1", "KOKO", "cancelled");

    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(plainStockUpdateMany).not.toHaveBeenCalled();
  });
```

And the last test:

```typescript
  it("returns already_failed when failure claim is a no-op", async () => {
    orderFindUnique.mockResolvedValueOnce({ ...ORDER, items: ITEMS });
    orderUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await finalizeFailedPayment("ORD-1", "KOKO", "duplicate callback");

    expect(result).toEqual({ status: "already_failed" });
    expect(plainStockUpdateMany).not.toHaveBeenCalled();
  });
```

Every other test in the file (`finalizePaidPayment` cases) is untouched.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- order-finalization`
Expected: FAIL — `finalizeFailedPayment` still calls `tx.variantSizeStock.updateMany`, which the new mock no longer provides.

- [ ] **Step 3: Rewrite the implementation**

In `app/_lib/payments/order-finalization.ts`, add the import:

```typescript
import { restoreItemPools } from "@/app/_lib/inventory-pools";
```

Replace the `for` loop inside `finalizeFailedPayment`'s transaction (currently lines 128–134):

```typescript
    for (const item of order.items) {
      await restoreItemPools(tx, item);
    }
```

(`order.items` already carries every column, including the two new snapshot fields, since the outer `findUnique` uses `include: { items: true }` with no field-level `select` — no query change needed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- order-finalization`
Expected: PASS (all cases)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in admin-products, admin/products/actions, product-form/variant-editor, products.ts, buy-box-client, product-jsonld, meta feed route, seed/mock — fixed by later tasks.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/payments/order-finalization.ts app/_lib/payments/__tests__/order-finalization.test.ts
git commit -m "feat(inventory): rewire payment-failure restore onto the shared pool helpers"
```

---

### Task 9: Admin Inventory read queries (`app/_lib/admin-inventory.ts`)

**Files:**
- Create: `app/_lib/admin-inventory.ts`
- Test: `app/_lib/__tests__/admin-inventory.test.ts`

**Interfaces:**
- Consumes: `LOW_STOCK_THRESHOLD` from `app/_lib/admin-products.ts` (existing export).
- Produces: `listPlainTshirtStock(): Promise<PlainTshirtStock[]>`, `listDtfDesigns(): Promise<(DtfDesign & { productCount: number })[]>`. Tasks 10–11 (actions + UI) consume these.

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/admin-inventory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const { plainFindMany, designFindMany, productGroupBy } = vi.hoisted(() => ({
  plainFindMany: vi.fn(),
  designFindMany: vi.fn(),
  productGroupBy: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    plainTshirtStock: { findMany: plainFindMany },
    dtfDesign: { findMany: designFindMany },
    product: { groupBy: productGroupBy },
  },
}));

import { listPlainTshirtStock, listDtfDesigns } from "../admin-inventory";

beforeEach(() => {
  plainFindMany.mockReset();
  designFindMany.mockReset();
  productGroupBy.mockReset();
});

describe("listPlainTshirtStock", () => {
  it("orders by colorSlug then size", async () => {
    plainFindMany.mockResolvedValueOnce([{ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 3 }]);
    const rows = await listPlainTshirtStock();
    expect(plainFindMany).toHaveBeenCalledWith({ orderBy: [{ colorSlug: "asc" }, { size: "asc" }] });
    expect(rows).toEqual([{ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 3 }]);
  });
});

describe("listDtfDesigns", () => {
  it("attaches a productCount per design, defaulting to 0 when unused", async () => {
    designFindMany.mockResolvedValueOnce([
      { id: "d1", name: "Cats", slug: "cats", quantity: 5 },
      { id: "d2", name: "Dinos", slug: "dinos", quantity: 0 },
    ]);
    productGroupBy.mockResolvedValueOnce([{ dtfDesignId: "d1", _count: { _all: 3 } }]);
    const rows = await listDtfDesigns();
    expect(productGroupBy).toHaveBeenCalledWith({
      by: ["dtfDesignId"],
      where: { dtfDesignId: { not: null }, archived: false },
      _count: { _all: true },
    });
    expect(rows).toEqual([
      { id: "d1", name: "Cats", slug: "cats", quantity: 5, productCount: 3 },
      { id: "d2", name: "Dinos", slug: "dinos", quantity: 0, productCount: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- admin-inventory`
Expected: FAIL — `Cannot find module '../admin-inventory'`

- [ ] **Step 3: Write the implementation**

Create `app/_lib/admin-inventory.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function listPlainTshirtStock() {
  return prisma.plainTshirtStock.findMany({ orderBy: [{ colorSlug: "asc" }, { size: "asc" }] });
}

export async function listDtfDesigns() {
  const [designs, counts] = await Promise.all([
    prisma.dtfDesign.findMany({ orderBy: { name: "asc" } }),
    prisma.product.groupBy({
      by: ["dtfDesignId"],
      where: { dtfDesignId: { not: null }, archived: false },
      _count: { _all: true },
    }),
  ]);
  const countMap = new Map(counts.map((c) => [c.dtfDesignId as string, c._count._all]));
  return designs.map((d) => ({ ...d, productCount: countMap.get(d.id) ?? 0 }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- admin-inventory`
Expected: PASS (2 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/admin-inventory.ts app/_lib/__tests__/admin-inventory.test.ts
git commit -m "feat(inventory): add admin inventory read queries"
```

---

### Task 10: Admin Inventory server actions (`app/admin/inventory/actions.ts`)

**Files:**
- Create: `app/admin/inventory/actions.ts`
- Test: `app/admin/inventory/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `slugify`, `uniqueSlug` from `app/_lib/admin-products.ts` (existing exports, same as `app/admin/categories/actions.ts` already uses).
- Produces: `ActionResult = { success: true } | { success: false; error: string }`, `upsertPlainTshirtStock(input): Promise<ActionResult>`, `deletePlainTshirtStock(id): Promise<ActionResult>`, `createDtfDesign(input): Promise<ActionResult>`, `updateDtfDesign(id, input): Promise<ActionResult>`, `deleteDtfDesign(id): Promise<ActionResult>`. Task 11 (UI) calls these directly.

- [ ] **Step 1: Write the failing tests**

Create `app/admin/inventory/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { plainCreate, plainUpdate, plainDelete, designCreate, designUpdate, designDelete, designFindUnique, productCount } = vi.hoisted(() => ({
  plainCreate: vi.fn(),
  plainUpdate: vi.fn(),
  plainDelete: vi.fn(),
  designCreate: vi.fn(),
  designUpdate: vi.fn(),
  designDelete: vi.fn(),
  designFindUnique: vi.fn(),
  productCount: vi.fn(),
}));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    plainTshirtStock: { create: plainCreate, update: plainUpdate, delete: plainDelete },
    dtfDesign: { create: designCreate, update: designUpdate, delete: designDelete, findUnique: designFindUnique },
    product: { count: productCount },
  },
}));

import {
  upsertPlainTshirtStock, deletePlainTshirtStock,
  createDtfDesign, updateDtfDesign, deleteDtfDesign,
} from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { email: "admin@x.test" } });
  plainCreate.mockReset();
  plainUpdate.mockReset();
  plainDelete.mockReset();
  designCreate.mockReset();
  designUpdate.mockReset();
  designDelete.mockReset();
  designFindUnique.mockReset();
  productCount.mockReset();
});

describe("upsertPlainTshirtStock", () => {
  it("rejects a negative quantity", async () => {
    const res = await upsertPlainTshirtStock({ color: "White", colorSlug: "white", size: "M", quantity: -1 });
    expect(res).toEqual({ success: false, error: "Color, size and quantity are required" });
    expect(plainCreate).not.toHaveBeenCalled();
  });

  it("creates a new row when no id is given", async () => {
    plainCreate.mockResolvedValueOnce({});
    const res = await upsertPlainTshirtStock({ color: "White", colorSlug: "White ", size: "M", quantity: 5 });
    expect(plainCreate).toHaveBeenCalledWith({ data: { color: "White", colorSlug: "white", size: "M", quantity: 5 } });
    expect(res).toEqual({ success: true });
  });

  it("updates an existing row when an id is given", async () => {
    plainUpdate.mockResolvedValueOnce({});
    const res = await upsertPlainTshirtStock({ id: "ps1", color: "White", colorSlug: "white", size: "M", quantity: 8 });
    expect(plainUpdate).toHaveBeenCalledWith({ where: { id: "ps1" }, data: { color: "White", colorSlug: "white", size: "M", quantity: 8 } });
    expect(res).toEqual({ success: true });
  });

  it("reports a friendly error on a unique-constraint collision", async () => {
    plainCreate.mockRejectedValueOnce(new Error("Unique constraint failed"));
    const res = await upsertPlainTshirtStock({ color: "White", colorSlug: "white", size: "M", quantity: 1 });
    expect(res).toEqual({ success: false, error: "Could not save — this color+size may already exist." });
  });
});

describe("deletePlainTshirtStock", () => {
  it("deletes by id", async () => {
    plainDelete.mockResolvedValueOnce({});
    const res = await deletePlainTshirtStock("ps1");
    expect(plainDelete).toHaveBeenCalledWith({ where: { id: "ps1" } });
    expect(res).toEqual({ success: true });
  });
});

describe("createDtfDesign", () => {
  it("rejects a blank name", async () => {
    const res = await createDtfDesign({ name: "  ", quantity: 5 });
    expect(res).toEqual({ success: false, error: "Name and quantity are required" });
  });

  it("slugifies the name and creates the design", async () => {
    designFindUnique.mockResolvedValueOnce(null); // slug is free
    designCreate.mockResolvedValueOnce({});
    const res = await createDtfDesign({ name: "Cats", quantity: 5 });
    expect(designCreate).toHaveBeenCalledWith({ data: { name: "Cats", slug: "cats", quantity: 5 } });
    expect(res).toEqual({ success: true });
  });
});

describe("updateDtfDesign", () => {
  it("updates name and quantity", async () => {
    designUpdate.mockResolvedValueOnce({});
    const res = await updateDtfDesign("d1", { name: "Cats v2", quantity: 3 });
    expect(designUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { name: "Cats v2", quantity: 3 } });
    expect(res).toEqual({ success: true });
  });
});

describe("deleteDtfDesign", () => {
  it("blocks deletion when products still reference it", async () => {
    productCount.mockResolvedValueOnce(2);
    const res = await deleteDtfDesign("d1");
    expect(res).toEqual({ success: false, error: "This design is used by products. Reassign them first." });
    expect(designDelete).not.toHaveBeenCalled();
  });

  it("deletes when unused", async () => {
    productCount.mockResolvedValueOnce(0);
    designDelete.mockResolvedValueOnce({});
    const res = await deleteDtfDesign("d1");
    expect(designDelete).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- admin/inventory/__tests__/actions`
Expected: FAIL — `Cannot find module '../actions'`

- [ ] **Step 3: Write the implementation**

Create `app/admin/inventory/actions.ts`:

```typescript
"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { slugify, uniqueSlug } from "@/app/_lib/admin-products";

export type ActionResult = { success: true } | { success: false; error: string };

function revalidate() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidateTag("catalog", "max"); // bust the storefront unstable_cache readers
}

const PlainStockSchema = z.object({
  color: z.string().trim().min(1),
  colorSlug: z.string().trim().min(1),
  size: z.string().trim().min(1),
  quantity: z.number().int().min(0),
});

export async function upsertPlainTshirtStock(input: {
  id?: string; color: string; colorSlug: string; size: string; quantity: number;
}): Promise<ActionResult> {
  await requireAdmin();
  const parsed = PlainStockSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Color, size and quantity are required" };
  const { color, size, quantity } = parsed.data;
  const colorSlug = slugify(parsed.data.colorSlug || color);
  if (!colorSlug) return { success: false, error: "Color must contain letters or numbers" };
  try {
    if (input.id) {
      await prisma.plainTshirtStock.update({ where: { id: input.id }, data: { color, colorSlug, size, quantity } });
    } else {
      await prisma.plainTshirtStock.create({ data: { color, colorSlug, size, quantity } });
    }
  } catch {
    return { success: false, error: "Could not save — this color+size may already exist." };
  }
  revalidate();
  return { success: true };
}

export async function deletePlainTshirtStock(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.plainTshirtStock.delete({ where: { id } });
  } catch {
    return { success: false, error: "Could not delete." };
  }
  revalidate();
  return { success: true };
}

const DesignSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().int().min(0),
});

export async function createDtfDesign(input: { name: string; quantity: number }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = DesignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and quantity are required" };
  const baseSlug = slugify(parsed.data.name);
  if (!baseSlug) return { success: false, error: "Name must contain letters or numbers" };
  const slug = await uniqueSlug(baseSlug, async (s) => (await prisma.dtfDesign.findUnique({ where: { slug: s } })) !== null);
  try {
    await prisma.dtfDesign.create({ data: { name: parsed.data.name, slug, quantity: parsed.data.quantity } });
  } catch {
    return { success: false, error: "Could not create design." };
  }
  revalidate();
  return { success: true };
}

export async function updateDtfDesign(id: string, input: { name: string; quantity: number }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = DesignSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Name and quantity are required" };
  try {
    await prisma.dtfDesign.update({ where: { id }, data: { name: parsed.data.name, quantity: parsed.data.quantity } });
  } catch {
    return { success: false, error: "Could not update design." };
  }
  revalidate();
  return { success: true };
}

export async function deleteDtfDesign(id: string): Promise<ActionResult> {
  await requireAdmin();
  const productCount = await prisma.product.count({ where: { dtfDesignId: id } });
  if (productCount > 0) {
    return { success: false, error: "This design is used by products. Reassign them first." };
  }
  try {
    await prisma.dtfDesign.delete({ where: { id } });
  } catch {
    return { success: false, error: "Could not delete design." };
  }
  revalidate();
  return { success: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- admin/inventory/__tests__/actions`
Expected: PASS (11 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add app/admin/inventory/actions.ts app/admin/inventory/__tests__/actions.test.ts
git commit -m "feat(inventory): add admin inventory CRUD server actions"
```

---

### Task 11: Admin Inventory page + UI components

**Files:**
- Create: `app/admin/inventory/page.tsx`
- Create: `app/_components/admin/inventory/plain-stock-grid.tsx`
- Create: `app/_components/admin/inventory/dtf-designs-table.tsx`

**Interfaces:**
- Consumes: `listPlainTshirtStock`/`listDtfDesigns` (Task 9), `upsertPlainTshirtStock`/`deletePlainTshirtStock`/`createDtfDesign`/`updateDtfDesign`/`deleteDtfDesign` (Task 10), `LOW_STOCK_THRESHOLD` from `app/_lib/admin-products.ts`.
- Produces: the `/admin/inventory` route.

No dedicated unit tests for these three files — this repo's convention is to unit-test pure logic (server actions, query builders) and leave presentational client components to manual/e2e verification, matching `variant-editor.tsx`/`product-form.tsx` (no component-level tests; only `variant-draft.ts`'s pure helpers are tested). **Important:** `LOW_STOCK_THRESHOLD` must be passed down as a prop from the server page, not imported directly inside the `"use client"` components — `app/_lib/admin-products.ts` imports the real Prisma client at module scope, and a client component importing from it would pull server-only code into the browser bundle.

- [ ] **Step 1: Create the Plain T-Shirt Stock grid**

Create `app/_components/admin/inventory/plain-stock-grid.tsx`:

```typescript
"use client";
import { useState, useTransition } from "react";
import { upsertPlainTshirtStock, deletePlainTshirtStock } from "@/app/admin/inventory/actions";
import { slugify } from "@/app/_lib/product-helpers";

type Row = { id: string; color: string; colorSlug: string; size: string; quantity: number };

export function PlainStockGrid({ rows, lowStockThreshold }: { rows: Row[]; lowStockThreshold: number }) {
  const [pending, start] = useTransition();
  const [newColor, setNewColor] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newQty, setNewQty] = useState("0");

  const byColor = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byColor.get(r.colorSlug) ?? [];
    list.push(r);
    byColor.set(r.colorSlug, list);
  }

  function saveQuantity(row: Row, quantity: number) {
    start(async () => {
      const r = await upsertPlainTshirtStock({ id: row.id, color: row.color, colorSlug: row.colorSlug, size: row.size, quantity });
      if (!r.success) alert(r.error);
    });
  }

  function remove(row: Row) {
    if (!confirm(`Delete ${row.color} ${row.size}? Any product using this color+size will show unavailable.`)) return;
    start(async () => {
      const r = await deletePlainTshirtStock(row.id);
      if (!r.success) alert(r.error);
    });
  }

  function addCell() {
    const color = newColor.trim();
    const size = newSize.trim();
    const quantity = Math.max(0, Math.trunc(Number(newQty) || 0));
    if (!color || !size) return;
    start(async () => {
      const r = await upsertPlainTshirtStock({ color, colorSlug: slugify(color), size, quantity });
      if (!r.success) { alert(r.error); return; }
      setNewColor(""); setNewSize(""); setNewQty("0");
    });
  }

  return (
    <div className="space-y-4">
      {[...byColor.entries()].map(([colorSlug, cells]) => (
        <div key={colorSlug} className="rounded-lg border p-4 space-y-2">
          <strong className="text-sm">{cells[0].color}</strong>
          <div className="space-y-1">
            {cells.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <span className="w-16 text-sm text-muted-foreground">{row.size}</span>
                <input
                  type="number" min={0} defaultValue={row.quantity}
                  onBlur={(e) => saveQuantity(row, Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                  className={
                    "w-24 rounded border px-2 py-1 text-sm " +
                    (row.quantity <= 0 ? "border-destructive text-destructive" :
                      row.quantity <= lowStockThreshold ? "border-amber-500 text-amber-600" : "")
                  }
                  disabled={pending}
                />
                <button type="button" onClick={() => remove(row)} className="px-1 text-destructive">✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-dashed p-4">
        <strong className="mb-2 block text-sm">+ Add color/size</strong>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="Color (e.g. White)" className="rounded border px-2 py-1 text-sm" />
          <input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Size (e.g. M)" className="w-24 rounded border px-2 py-1 text-sm" />
          <input type="number" min={0} value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" />
          <button type="button" onClick={addCell} disabled={pending} className="rounded border px-3 py-1 text-sm">Add</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the DTF Designs table**

Create `app/_components/admin/inventory/dtf-designs-table.tsx`:

```typescript
"use client";
import { useState, useTransition } from "react";
import { createDtfDesign, updateDtfDesign, deleteDtfDesign } from "@/app/admin/inventory/actions";

type Design = { id: string; name: string; slug: string; quantity: number; productCount: number };

export function DtfDesignsTable({ designs, lowStockThreshold }: { designs: Design[]; lowStockThreshold: number }) {
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("0");

  function saveQuantity(d: Design, quantity: number) {
    start(async () => {
      const r = await updateDtfDesign(d.id, { name: d.name, quantity });
      if (!r.success) alert(r.error);
    });
  }

  function saveName(d: Design, name: string) {
    if (!name.trim() || name === d.name) return;
    start(async () => {
      const r = await updateDtfDesign(d.id, { name: name.trim(), quantity: d.quantity });
      if (!r.success) alert(r.error);
    });
  }

  function remove(d: Design) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    start(async () => {
      const r = await deleteDtfDesign(d.id);
      if (!r.success) alert(r.error);
    });
  }

  function add() {
    const name = newName.trim();
    const quantity = Math.max(0, Math.trunc(Number(newQty) || 0));
    if (!name) return;
    start(async () => {
      const r = await createDtfDesign({ name, quantity });
      if (!r.success) { alert(r.error); return; }
      setNewName(""); setNewQty("0");
    });
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 font-medium">Design</th>
            <th className="py-1.5 font-medium">Quantity</th>
            <th className="py-1.5 font-medium">Products using it</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody>
          {designs.map((d) => (
            <tr key={d.id} className="border-b last:border-0">
              <td className="py-1.5">
                <input defaultValue={d.name} onBlur={(e) => saveName(d, e.target.value)} className="rounded border px-2 py-1" disabled={pending} />
              </td>
              <td className="py-1.5">
                <input
                  type="number" min={0} defaultValue={d.quantity}
                  onBlur={(e) => saveQuantity(d, Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                  className={
                    "w-24 rounded border px-2 py-1 " +
                    (d.quantity <= 0 ? "border-destructive text-destructive" :
                      d.quantity <= lowStockThreshold ? "border-amber-500 text-amber-600" : "")
                  }
                  disabled={pending}
                />
              </td>
              <td className="py-1.5 text-muted-foreground">{d.productCount}</td>
              <td className="py-1.5">
                <button type="button" onClick={() => remove(d)} disabled={pending} className="text-destructive">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rounded-lg border border-dashed p-3">
        <strong className="mb-2 block text-sm">+ Add design</strong>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Design name (e.g. Cats)" className="rounded border px-2 py-1 text-sm" />
          <input type="number" min={0} value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" />
          <button type="button" onClick={add} disabled={pending} className="rounded border px-3 py-1 text-sm">Add</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the page**

Create `app/admin/inventory/page.tsx`:

```typescript
import { listPlainTshirtStock, listDtfDesigns } from "@/app/_lib/admin-inventory";
import { LOW_STOCK_THRESHOLD } from "@/app/_lib/admin-products";
import { PlainStockGrid } from "@/app/_components/admin/inventory/plain-stock-grid";
import { DtfDesignsTable } from "@/app/_components/admin/inventory/dtf-designs-table";

export default async function AdminInventoryPage() {
  const [plainStock, designs] = await Promise.all([listPlainTshirtStock(), listDtfDesigns()]);
  return (
    <section className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
      <div>
        <h2 className="mb-2 text-sm font-semibold">Plain T-Shirt Stock</h2>
        <PlainStockGrid rows={plainStock} lowStockThreshold={LOW_STOCK_THRESHOLD} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold">DTF Designs</h2>
        <DtfDesignsTable designs={designs} lowStockThreshold={LOW_STOCK_THRESHOLD} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from these three files.

- [ ] **Step 5: Commit**

```bash
git add app/admin/inventory/page.tsx app/_components/admin/inventory
git commit -m "feat(inventory): add the admin Inventory page"
```

---

### Task 12: Admin nav link

**Files:**
- Modify: `app/_components/admin/admin-sidebar.tsx`

**Interfaces:** none — pure UI addition to the existing exported `ADMIN_NAV` array.

- [ ] **Step 1: Add the nav entry**

In `app/_components/admin/admin-sidebar.tsx`, insert an `"Inventory"` entry into `ADMIN_NAV` right after `"Products"`:

```typescript
export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
] as const;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/_components/admin/admin-sidebar.tsx
git commit -m "feat(inventory): add Inventory to the admin nav"
```

---

### Task 13: Product create/update carries `dtfDesignId`, drops `stock` from size cells (`app/admin/products/actions.ts`)

**Files:**
- Modify: `app/admin/products/actions.ts`
- Modify: `app/admin/products/__tests__/actions.test.ts`

**Interfaces:**
- Produces: `ProductInputSchema` gains `dtfDesignId: string`; `VariantSizeInputSchema` drops `stock`. `product.create`/`product.update` write `dtfDesignId`; `variantSizeStock.createMany` writes only `{ variantId, size }`.

- [ ] **Step 1: Update the failing test fixture and assertions**

In `app/admin/products/__tests__/actions.test.ts`, update `NEW_INPUT`:

```typescript
const NEW_INPUT = {
  name: "Cat White", slug: "cat-white", categorySlug: "cat",
  price: 2190, originalPrice: null,
  description: "Soft tee",
  dtfDesignId: "d1",
  variants: [
    {
      color: "White", colorSlug: "white", swatchHex: "#FFFFFF", sku: "CAT-WHITE",
      price: null, originalPrice: null,
      cardImages: ["/products/cat-white/card/1.jpg"],
      detailImages: ["/products/cat-white/detail/1.jpg", "/products/cat-white/detail/2.jpg"],
      sizeStocks: [{ size: "S" }, { size: "M" }],
    },
  ],
};
```

In `describe("createProduct", ...)`'s `"generates a unique slug and writes variants + images + stock"` test, update the two assertions that reference `dtfDesignId`/`sizeStocks`:

```typescript
    expect(createArg.data).toMatchObject({
      id: "cat-white", name: "Cat White", categorySlug: "cat", dtfDesignId: "d1",
      price: 2190, originalPrice: null, description: "Soft tee", archived: false,
    });
    expect(createArg.data).not.toHaveProperty("image");
    expect(createArg.data).not.toHaveProperty("stock");
    expect(createArg.data).not.toHaveProperty("sizes");

    // ... (variantDeleteMany / variantCreate assertions unchanged) ...

    expect(variantSizeStockCreateMany).toHaveBeenCalledWith({
      data: [
        { variantId: "variant-1", size: "S" },
        { variantId: "variant-1", size: "M" },
      ],
    });
```

Add one new test to `describe("createProduct", ...)`:

```typescript
  it("rejects a missing dtfDesignId", async () => {
    const res = await createProduct({ ...NEW_INPUT, dtfDesignId: "" });
    expect(res.success).toBe(false);
    expect(productCreate).not.toHaveBeenCalled();
  });
```

No other test bodies in this file need to change — `updateProduct`/rename/`deleteProduct` tests never assert on `sizeStocks`' `.stock` field or on `dtfDesignId` specifically, and `NEW_INPUT` (now carrying `dtfDesignId`) flows through them unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- admin/products/__tests__/actions`
Expected: FAIL — `ProductInputSchema` doesn't have `dtfDesignId` yet; `VariantSizeInputSchema` still requires `stock`.

- [ ] **Step 3: Rewrite the implementation**

In `app/admin/products/actions.ts`, update `VariantSizeInputSchema` and `ProductInputSchema`:

```typescript
const VariantSizeInputSchema = z.object({
  size: z.string().trim().min(1),
});

const VariantInputSchema = z.object({
  id: z.string().optional(),
  color: z.string().trim().min(1),
  colorSlug: z.string().trim().min(1),
  swatchHex: z.string().trim().nullable().optional(),
  sku: z.string().trim().nullable().optional(),
  price: z.number().positive().nullable().optional(),
  originalPrice: z.number().positive().nullable().optional(),
  cardImages: z.array(z.string().trim().min(1)).min(1, "Each color needs at least one card image"),
  detailImages: z.array(z.string().trim().min(1)).min(1, "Each color needs at least one detail image"),
  sizeStocks: z.array(VariantSizeInputSchema).min(1, "Each color needs at least one size"),
});

const ProductInputSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  categorySlug: z.string().trim().min(1),
  price: z.number().positive(),
  originalPrice: z.number().positive().nullable().optional(),
  description: z.string().trim().min(1),
  dtfDesignId: z.string().trim().min(1, "Choose a DTF design"),
  variants: z.array(VariantInputSchema).min(1, "Add at least one color variant"),
});
export type VariantInput = z.infer<typeof VariantInputSchema>;
export type ProductInput = z.infer<typeof ProductInputSchema>;
```

In `writeVariants`, drop `.stock` from the `variantSizeStock.createMany` call:

```typescript
    await tx.variantSizeStock.createMany({
      data: v.sizeStocks.map((s) => ({ variantId: variant.id, size: s.size })),
    });
```

In `reconcileVariants`, drop `.stock` from the `sizeRows` push:

```typescript
    v.sizeStocks.forEach((s) => sizeRows.push({ variantId, size: s.size }));
```

In `createProduct`, add `dtfDesignId: d.dtfDesignId` to the `product.create` data:

```typescript
      await tx.product.create({
        data: {
          id: slug, name: d.name, categorySlug: d.categorySlug, dtfDesignId: d.dtfDesignId,
          price: d.price, originalPrice: d.originalPrice ?? null,
          description: d.description, archived: false,
        },
      });
```

In `updateProduct`, add `dtfDesignId: d.dtfDesignId` to **both** `product.update` calls (the field-only path and the rename path):

```typescript
        await tx.product.update({
          where: { id },
          data: {
            name: d.name, categorySlug: d.categorySlug, dtfDesignId: d.dtfDesignId,
            price: d.price, originalPrice: d.originalPrice ?? null,
            description: d.description,
          },
        });
```

```typescript
      await tx.product.update({
        where: { id },
        data: {
          id: newSlug, name: d.name, categorySlug: d.categorySlug, dtfDesignId: d.dtfDesignId,
          price: d.price, originalPrice: d.originalPrice ?? null,
          description: d.description,
        },
      });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- admin/products/__tests__/actions`
Expected: PASS (all cases, plus the new `dtfDesignId` rejection test)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in `product-form.tsx`/`variant-editor.tsx`/`variant-draft.ts` (Task 14), `admin-products.ts` (Task 15), products.ts/buy-box-client/product-jsonld/meta feed (Tasks 17–19), seed/mock (Task 20).

- [ ] **Step 6: Commit**

```bash
git add app/admin/products/actions.ts app/admin/products/__tests__/actions.test.ts
git commit -m "feat(inventory): products carry a required dtfDesignId; sizes lose their stock column"
```

---

### Task 14: Product editor UI — DTF design dropdown, drop per-size stock input, color datalist

**Files:**
- Modify: `app/_components/admin/products/variant-draft.ts`
- Modify: `app/_components/admin/products/__tests__/variant-draft.test.ts`
- Modify: `app/_components/admin/products/variant-editor.tsx`
- Modify: `app/_components/admin/products/product-form.tsx`
- Modify: `app/admin/products/new/page.tsx`
- Modify: `app/admin/products/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `listDtfDesigns`/`listPlainTshirtStock` (Task 9).
- Produces: `VariantDraft.sizeStocks: { size: string }[]` (no `stock` field); `ProductForm` takes new `designs: { id: string; name: string }[]` and `plainTeeColors: string[]` props alongside its existing `categories`/`initial`.

- [ ] **Step 1: Update the failing test**

In `app/_components/admin/products/__tests__/variant-draft.test.ts`, replace the first assertion block:

```typescript
  it("emptyVariant() returns a blank draft with the standard sizes", () => {
    const v = emptyVariant();
    expect(v).toMatchObject({ color: "", colorSlug: "", sku: "", cardImages: [], detailImages: [] });
    expect(v.sizeStocks).toEqual([{ size: "S" }, { size: "M" }, { size: "L" }, { size: "XL" }]);
    expect(v.id).toBeUndefined();
  });
```

The other two tests in that file (module-boundary and import-source checks) are untouched.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- variant-draft`
Expected: FAIL — `emptyVariant()`'s `sizeStocks` cells still carry `stock: "0"`.

- [ ] **Step 3: Update `variant-draft.ts`**

Replace the type and factory in `app/_components/admin/products/variant-draft.ts`:

```typescript
export type VariantDraft = {
  id?: string;
  color: string;
  colorSlug: string;
  swatchHex: string;
  sku: string;
  price: string;         // "" => no override
  originalPrice: string; // "" => no override
  cardImages: string[];
  detailImages: string[];
  sizeStocks: { size: string }[];
};

export const STD_SIZES = ["S", "M", "L", "XL"];

export function emptyVariant(): VariantDraft {
  return {
    color: "", colorSlug: "", swatchHex: "", sku: "", price: "", originalPrice: "",
    cardImages: [], detailImages: [],
    sizeStocks: STD_SIZES.map((size) => ({ size })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- variant-draft`
Expected: PASS (3 tests)

- [ ] **Step 5: Update `variant-editor.tsx`** — remove the per-size stock input, add a color datalist

Replace `app/_components/admin/products/variant-editor.tsx` entirely:

```typescript
"use client";
import { slugify } from "@/app/_lib/product-helpers";
import { GalleryEditor } from "./gallery-editor";
import { emptyVariant, type VariantDraft } from "./variant-draft";

// Re-export so existing client-side imports (product-form) keep working.
// Server components must import emptyVariant from ./variant-draft directly.
export { emptyVariant };
export type { VariantDraft };

export function VariantEditor({
  value,
  onChange,
  knownColors = [],
}: {
  value: VariantDraft[];
  onChange: (v: VariantDraft[]) => void;
  knownColors?: string[]; // Plain T-Shirt Stock colors — suggested, not enforced.
}) {
  const update = (i: number, patch: Partial<VariantDraft>) =>
    onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const duplicate = (i: number) => {
    const src = value[i];
    const copy: VariantDraft = { ...src, id: undefined, color: "", colorSlug: "", sku: "",
      cardImages: [...src.cardImages], detailImages: [...src.detailImages],
      sizeStocks: src.sizeStocks.map((s) => ({ ...s })) };
    onChange([...value.slice(0, i + 1), copy, ...value.slice(i + 1)]);
  };

  const addSize = (vi: number) =>
    update(vi, { sizeStocks: [...value[vi].sizeStocks, { size: "" }] });
  const setSizeName = (vi: number, si: number, size: string) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.map((s, j) => (j === si ? { ...s, size } : s)) });
  const removeSize = (vi: number, si: number) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.filter((_, j) => j !== si) });

  return (
    <div className="space-y-4">
      <datalist id="known-plain-tee-colors">
        {knownColors.map((c) => <option key={c} value={c} />)}
      </datalist>
      {value.map((v, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <strong className="text-sm">Color {i + 1}</strong>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => move(i, -1)} className="px-1 text-muted-foreground">↑</button>
              <button type="button" onClick={() => move(i, 1)} className="px-1 text-muted-foreground">↓</button>
              <button type="button" onClick={() => duplicate(i)} className="rounded border px-2 py-0.5 text-xs">Duplicate</button>
              <button type="button" onClick={() => remove(i)} className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive">Remove</button>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-muted-foreground">Color name</label>
              <input list="known-plain-tee-colors" value={v.color} onChange={(e) => update(i, { color: e.target.value, colorSlug: v.colorSlug || slugify(e.target.value) })} className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Color slug</label>
              <input value={v.colorSlug} onChange={(e) => update(i, { colorSlug: slugify(e.target.value) })} className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Swatch color</label>
              <input type="color" value={v.swatchHex || "#ffffff"} onChange={(e) => update(i, { swatchHex: e.target.value })} className="h-8 w-full rounded border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">SKU (optional)</label>
              <input value={v.sku} onChange={(e) => update(i, { sku: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Price override</label>
              <input value={v.price} onChange={(e) => update(i, { price: e.target.value })} placeholder="base price" className="w-full rounded border px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Original override</label>
              <input value={v.originalPrice} onChange={(e) => update(i, { originalPrice: e.target.value })} placeholder="optional" className="w-full rounded border px-2 py-1 text-sm" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Card images (shop slider)</label>
              <GalleryEditor urls={v.cardImages} onChange={(u) => update(i, { cardImages: u })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Detail images (PDP gallery)</label>
              <GalleryEditor urls={v.detailImages} onChange={(u) => update(i, { detailImages: u })} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Sizes offered (quantities are managed in Inventory)</label>
            <div className="space-y-1">
              {v.sizeStocks.map((s, si) => (
                <div key={si} className="flex items-center gap-2">
                  <input value={s.size} onChange={(e) => setSizeName(i, si, e.target.value)} placeholder="Size" className="w-20 rounded border px-2 py-1 text-sm" />
                  <button type="button" onClick={() => removeSize(i, si)} className="px-1 text-destructive">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => addSize(i)} className="rounded border px-2 py-1 text-xs">+ add size</button>
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, emptyVariant()])} className="rounded border px-3 py-1.5 text-sm">+ Add color variant</button>
    </div>
  );
}
```

- [ ] **Step 6: Update `product-form.tsx`** — DTF design dropdown, pass `plainTeeColors` through

Replace `app/_components/admin/products/product-form.tsx` entirely:

```typescript
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct, archiveProduct, unarchiveProduct } from "@/app/admin/products/actions";
import { slugify } from "@/app/_lib/product-helpers";
import { CategorySelect } from "./category-select";
import { VariantEditor } from "./variant-editor";
import { emptyVariant, type VariantDraft } from "./variant-draft";

type Cat = { slug: string; name: string };
type Design = { id: string; name: string };
type Initial = {
  id?: string; name: string; categorySlug: string; price: string; originalPrice: string;
  description: string; archived: boolean; dtfDesignId: string; variants: VariantDraft[];
};

function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ProductForm({
  mode, categories, designs, plainTeeColors, initial,
}: {
  mode: "create" | "edit"; categories: Cat[]; designs: Design[]; plainTeeColors: string[]; initial: Initial;
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState(initial.id ?? "");
  const [pending, start] = useTransition();
  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setF((p) => ({ ...p, [k]: v }));

  function submit() {
    const input = {
      name: f.name.trim(), slug, categorySlug: f.categorySlug,
      price: Number(f.price), originalPrice: toNum(f.originalPrice),
      description: f.description.trim(),
      dtfDesignId: f.dtfDesignId,
      variants: f.variants.map((v) => ({
        id: v.id,
        color: v.color.trim(),
        colorSlug: v.colorSlug.trim(),
        swatchHex: v.swatchHex.trim() || null,
        sku: v.sku.trim() || null,
        price: toNum(v.price),
        originalPrice: toNum(v.originalPrice),
        cardImages: v.cardImages.map((u) => u.trim()).filter(Boolean),
        detailImages: v.detailImages.map((u) => u.trim()).filter(Boolean),
        sizeStocks: v.sizeStocks.map((s) => ({ size: s.size.trim() })).filter((s) => s.size),
      })),
    };
    start(async () => {
      const r = mode === "create" ? await createProduct(input) : await updateProduct(f.id!, input);
      if (!r.success) { alert(r.error); return; }
      router.push("/admin/products"); router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{mode === "create" ? "New product" : `Edit · ${f.name}`}</h1>
        <span className="ml-auto flex gap-2">
          {mode === "edit" && (
            <a href={`/products/${f.id}`} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1.5 text-sm">View on storefront ↗</a>
          )}
          {mode === "edit" && (
            <button disabled={pending} onClick={() => start(async () => { const r = f.archived ? await unarchiveProduct(f.id!) : await archiveProduct(f.id!); if (r.success) { set("archived", !f.archived); router.refresh(); } else alert(r.error); })}
              className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive">{f.archived ? "Unarchive" : "Archive"}</button>
          )}
          <button onClick={() => router.push("/admin/products")} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
          <button disabled={pending} onClick={submit} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Save</button>
        </span>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <div><label className="text-xs text-muted-foreground">Name</label>
            <input value={f.name} className="w-full rounded border px-2 py-1.5 text-sm"
              onChange={(e) => { set("name", e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} /></div>
          <div><label className="text-xs text-muted-foreground">Slug (URL id)</label>
            <input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
          <div><label className="text-xs text-muted-foreground">Category</label>
            <CategorySelect categories={categories} value={f.categorySlug} onChange={(s) => set("categorySlug", s)} /></div>
          <div><label className="text-xs text-muted-foreground">DTF design</label>
            <select value={f.dtfDesignId} onChange={(e) => set("dtfDesignId", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
              <option value="">Select a design…</option>
              {designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-lg border p-4 grid grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Base price (LKR)</label><input value={f.price} onChange={(e) => set("price", e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" /></div>
          <div><label className="text-xs text-muted-foreground">Base original price</label><input value={f.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} placeholder="optional" className="w-full rounded border px-2 py-1.5 text-sm" /></div>
        </div>

        <div className="rounded-lg border p-4">
          <label className="text-xs text-muted-foreground">Description</label>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={4} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Color variants</h2>
          <VariantEditor value={f.variants} onChange={(v) => set("variants", v)} knownColors={plainTeeColors} />
        </div>
      </div>
    </section>
  );
}

export { emptyVariant };
export type { VariantDraft };
```

- [ ] **Step 7: Wire the new/edit pages** — fetch designs + plain-tee colors, pass `dtfDesignId`

Replace `app/admin/products/new/page.tsx`:

```typescript
import { listCategories } from "@/app/_lib/admin-products";
import { listDtfDesigns, listPlainTshirtStock } from "@/app/_lib/admin-inventory";
import { ProductForm } from "@/app/_components/admin/products/product-form";
import { emptyVariant } from "@/app/_components/admin/products/variant-draft";

export default async function NewProductPage() {
  const [categories, designs, plainStock] = await Promise.all([
    listCategories(), listDtfDesigns(), listPlainTshirtStock(),
  ]);
  const plainTeeColors = [...new Set(plainStock.map((s) => s.color))];
  return (
    <ProductForm
      mode="create"
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      designs={designs.map((d) => ({ id: d.id, name: d.name }))}
      plainTeeColors={plainTeeColors}
      initial={{ name: "", categorySlug: "", price: "", originalPrice: "", description: "", archived: false, dtfDesignId: "", variants: [emptyVariant()] }}
    />
  );
}
```

Replace `app/admin/products/[id]/edit/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { getProduct, listCategories } from "@/app/_lib/admin-products";
import { listDtfDesigns, listPlainTshirtStock } from "@/app/_lib/admin-inventory";
import { ProductForm } from "@/app/_components/admin/products/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, designs, plainStock] = await Promise.all([
    getProduct(id), listCategories(), listDtfDesigns(), listPlainTshirtStock(),
  ]);
  if (!product) notFound();
  const plainTeeColors = [...new Set(plainStock.map((s) => s.color))];
  return (
    <ProductForm
      mode="edit"
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      designs={designs.map((d) => ({ id: d.id, name: d.name }))}
      plainTeeColors={plainTeeColors}
      initial={{
        id: product.id, name: product.name, categorySlug: product.categorySlug,
        price: String(product.price),
        originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
        description: product.description, archived: product.archived,
        dtfDesignId: product.dtfDesignId ?? "",
        variants: product.variants.map((v) => ({
          id: v.id,
          color: v.color, colorSlug: v.colorSlug, swatchHex: v.swatchHex ?? "",
          sku: v.sku ?? "",
          price: v.price != null ? String(v.price) : "",
          originalPrice: v.originalPrice != null ? String(v.originalPrice) : "",
          cardImages: v.images.filter((im) => im.role === "CARD").map((im) => im.url),
          detailImages: v.images.filter((im) => im.role === "DETAIL").map((im) => im.url),
          sizeStocks: v.sizeStocks.map((s) => ({ size: s.size })),
        })),
      }}
    />
  );
}
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in `admin-products.ts` (Task 15), products.ts/buy-box-client/product-jsonld/meta feed (Tasks 17–19), seed/mock (Task 20).

- [ ] **Step 9: Commit**

```bash
git add app/_components/admin/products/variant-draft.ts app/_components/admin/products/__tests__/variant-draft.test.ts app/_components/admin/products/variant-editor.tsx app/_components/admin/products/product-form.tsx app/admin/products/new/page.tsx "app/admin/products/[id]/edit/page.tsx"
git commit -m "feat(inventory): product editor gets a DTF design dropdown, drops per-size stock input"
```

---

### Task 15: Dashboard low-stock KPI from the two pools (`app/_lib/admin-kpis.ts`)

**Files:**
- Modify: `app/_lib/admin-kpis.ts`
- Modify: `app/_lib/__tests__/admin-kpis.test.ts`

**Interfaces:**
- Consumes: `LOW_STOCK_THRESHOLD` from `app/_lib/admin-products.ts` (unchanged import).
- Produces: `DashboardKpis` keeps its exact shape (`{ ordersToConfirm, ordersToDispatch, todaysOrders, lowStock }`); `lowStock` is now `(low PlainTshirtStock rows) + (low DtfDesign rows)` instead of a product count.

- [ ] **Step 1: Update the failing test**

In `app/_lib/__tests__/admin-kpis.test.ts`, replace the mock setup and the low-stock test:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const { orderCount, plainStockCount, dtfDesignCount } = vi.hoisted(() => ({
  orderCount: vi.fn(),
  plainStockCount: vi.fn(),
  dtfDesignCount: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: { count: orderCount },
    plainTshirtStock: { count: plainStockCount },
    dtfDesign: { count: dtfDesignCount },
  },
}));

const FROZEN_TODAY = new Date("2026-05-28T00:00:00.000Z");
vi.mock("@/app/_lib/time", () => ({
  startOfTodaySLT: () => FROZEN_TODAY,
}));

import { getDashboardKpis } from "../admin-kpis";

beforeEach(() => {
  orderCount.mockReset();
  plainStockCount.mockReset();
  dtfDesignCount.mockReset();
});
```

Replace the `"queries low-stock via variants whose size-stock cells are <=5"` test and the final `"returns all four KPIs..."` test:

```typescript
  it("sums low-stock counts from both raw-material pools (threshold <=5)", async () => {
    orderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    plainStockCount.mockResolvedValueOnce(2);
    dtfDesignCount.mockResolvedValueOnce(1);

    const result = await getDashboardKpis();

    expect(plainStockCount).toHaveBeenCalledWith({ where: { quantity: { lte: 5 } } });
    expect(dtfDesignCount).toHaveBeenCalledWith({ where: { quantity: { lte: 5 } } });
    expect(result.lowStock).toBe(3);
  });

  it("returns all four KPIs in the expected shape", async () => {
    orderCount.mockResolvedValueOnce(5).mockResolvedValueOnce(7).mockResolvedValueOnce(12);
    plainStockCount.mockResolvedValueOnce(2);
    dtfDesignCount.mockResolvedValueOnce(1);

    const result = await getDashboardKpis();

    expect(result).toEqual({
      ordersToConfirm: 5,
      ordersToDispatch: 7,
      todaysOrders: 12,
      lowStock: 3,
    });
  });
```

The first three tests (orders-to-confirm, orders-to-dispatch, today's orders) are untouched.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- admin-kpis`
Expected: FAIL — `getDashboardKpis` still calls `prisma.product.count`, which the new mock no longer provides.

- [ ] **Step 3: Rewrite the implementation**

Replace `app/_lib/admin-kpis.ts` entirely:

```typescript
// Single source for admin dashboard KPI queries. Five COUNT queries in
// parallel; expected ~30-100ms on Prisma Postgres. No caching — the /admin
// route is dynamic via requireAdmin() reading cookies, and freshness wins
// over micro-latency on a low-traffic admin route.
import { prisma } from "@/app/_lib/prisma";
import { startOfTodaySLT } from "@/app/_lib/time";
import { LOW_STOCK_THRESHOLD } from "@/app/_lib/admin-products";

export type DashboardKpis = {
  ordersToConfirm: number;
  ordersToDispatch: number;
  todaysOrders: number;
  lowStock: number;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [ordersToConfirm, ordersToDispatch, todaysOrders, lowPlainStock, lowDesignStock] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "CONFIRMED", courierBookedAt: null } }),
    prisma.order.count({ where: { createdAt: { gte: startOfTodaySLT() } } }),
    prisma.plainTshirtStock.count({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } }),
    prisma.dtfDesign.count({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } } }),
  ]);
  return { ordersToConfirm, ordersToDispatch, todaysOrders, lowStock: lowPlainStock + lowDesignStock };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- admin-kpis`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/_lib/admin-kpis.ts app/_lib/__tests__/admin-kpis.test.ts
git commit -m "feat(inventory): dashboard low-stock KPI sums both raw-material pools"
```

---

### Task 16: Admin product list — low-stock tab + "Total stock" column become pool-derived

**Files:**
- Modify: `app/_lib/admin-products.ts`
- Modify: `app/_lib/__tests__/admin-products.test.ts`
- Modify: `app/_lib/__tests__/admin-products-queries.test.ts`
- Modify: `app/_components/admin/products/products-table.tsx`
- Modify: `app/admin/products/page.tsx`

**Interfaces:**
- Consumes: `buildPlainStockMap`/`buildDesignStockMap`/`productInStock` (Task 3).
- Produces: `getLowStockProductIds(): Promise<string[]>`, `resolveProductWhere(params): Promise<Prisma.ProductWhereInput>` (new); `listProducts(...)` now also returns `plainStock`/`designStock` maps. `buildProductWhere` keeps its existing synchronous signature but no longer special-cases `"low-stock"` as a DB clause.

The admin product list's per-row "Total stock" number can no longer be computed from the product's own rows (quantity isn't stored there anymore, and summing a *shared* pool across products would overstate real availability). It's replaced with a boolean "Available"/"Unavailable" badge, computed the same way the storefront now computes it.

- [ ] **Step 1: Update the failing tests**

In `app/_lib/__tests__/admin-products.test.ts`, replace the low-stock case in `describe("buildProductWhere", ...)`:

```typescript
  it("low-stock tab behaves like active (archived:false) — id filtering is layered on by resolveProductWhere, not this function", () => {
    expect(buildProductWhere({ tab: "low-stock" })).toEqual({ archived: false });
  });
```

In `app/_lib/__tests__/admin-products-queries.test.ts`, add `plainTshirtStock`/`dtfDesign` to the prisma mock:

```typescript
const { productFindMany, productCount, productFindUnique, categoryFindMany, plainFindMany, designFindMany } = vi.hoisted(() => ({
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  productFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  plainFindMany: vi.fn(),
  designFindMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    product: { findMany: productFindMany, count: productCount, findUnique: productFindUnique },
    category: { findMany: categoryFindMany },
    plainTshirtStock: { findMany: plainFindMany },
    dtfDesign: { findMany: designFindMany },
  },
}));

import { listProducts, getProduct, listCategories, getLowStockProductIds, resolveProductWhere } from "../admin-products";

beforeEach(() => {
  productFindMany.mockReset();
  productCount.mockReset();
  productFindUnique.mockReset();
  categoryFindMany.mockReset();
  plainFindMany.mockReset().mockResolvedValue([]);
  designFindMany.mockReset().mockResolvedValue([]);
});
```

Replace the `describe("listProducts", ...)` `"paginates and returns rows + total"` test — the low-stock where-clause assertion changes since low-stock is no longer a static clause:

```typescript
describe("listProducts", () => {
  it("paginates and returns rows + total", async () => {
    productFindMany.mockResolvedValueOnce([{ id: "cat-white" }]);
    productCount.mockResolvedValueOnce(42);
    const res = await listProducts({ tab: "active", page: 2, pageSize: 25 });
    expect(productCount).toHaveBeenCalledWith({ where: { archived: false } });
    const arg = productFindMany.mock.calls[0][0];
    expect(arg.where).toEqual({ archived: false });
    expect(arg.take).toBe(25);
    expect(arg.skip).toBe(25);
    expect(arg.orderBy).toEqual({ name: "asc" });
    expect(arg.include.variants.where).toEqual({ archived: false });
    expect(arg.include._count.select.variants).toEqual({ where: { archived: false } });
    expect(res.rows).toEqual([{ id: "cat-white" }]);
    expect(res.total).toBe(42);
  });

  it("clamps pageSize to 200 and floors page at 1 (skip 0)", async () => {
    productFindMany.mockResolvedValueOnce([]);
    productCount.mockResolvedValueOnce(0);
    await listProducts({ tab: "all", page: 0, pageSize: 300 });
    const arg = productFindMany.mock.calls[0][0];
    expect(arg.take).toBe(200);
    expect(arg.skip).toBe(0);
  });

  it("on the low-stock tab, resolves affected product ids first and filters by them", async () => {
    plainFindMany.mockResolvedValueOnce([{ colorSlug: "white", size: "M" }]);
    productFindMany
      .mockResolvedValueOnce([ // the getLowStockProductIds() scan
        { id: "p1", dtfDesignId: null, variants: [{ colorSlug: "white", sizeStocks: [{ size: "M" }] }] },
        { id: "p2", dtfDesignId: null, variants: [{ colorSlug: "pink", sizeStocks: [{ size: "M" }] }] },
      ])
      .mockResolvedValueOnce([{ id: "p1" }]); // the paginated listProducts() query
    productCount.mockResolvedValueOnce(1);

    const res = await listProducts({ tab: "low-stock" });

    const listArg = productFindMany.mock.calls[1][0];
    expect(listArg.where).toEqual({ archived: false, id: { in: ["p1"] } });
    expect(res.rows).toEqual([{ id: "p1" }]);
  });
});

describe("getLowStockProductIds", () => {
  it("returns an empty list when neither pool has a low row", async () => {
    plainFindMany.mockResolvedValueOnce([]);
    designFindMany.mockResolvedValueOnce([]);
    const ids = await getLowStockProductIds();
    expect(ids).toEqual([]);
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it("flags a product whose design is low, and one whose offered color+size is low, but not an unaffected product", async () => {
    plainFindMany.mockResolvedValueOnce([{ colorSlug: "white", size: "M" }]);
    designFindMany.mockResolvedValueOnce([{ id: "d-low" }]);
    productFindMany.mockResolvedValueOnce([
      { id: "p-design-low", dtfDesignId: "d-low", variants: [{ colorSlug: "pink", sizeStocks: [{ size: "L" }] }] },
      { id: "p-plain-low", dtfDesignId: "d-ok", variants: [{ colorSlug: "white", sizeStocks: [{ size: "M" }] }] },
      { id: "p-fine", dtfDesignId: "d-ok", variants: [{ colorSlug: "pink", sizeStocks: [{ size: "L" }] }] },
    ]);
    const ids = await getLowStockProductIds();
    expect(ids).toEqual(["p-design-low", "p-plain-low"]);
  });
});

describe("resolveProductWhere", () => {
  it("passes through non-low-stock tabs unchanged", async () => {
    const where = await resolveProductWhere({ tab: "active" });
    expect(where).toEqual({ archived: false });
    expect(plainFindMany).not.toHaveBeenCalled();
  });

  it("layers an id filter on for the low-stock tab", async () => {
    plainFindMany.mockResolvedValueOnce([{ colorSlug: "white", size: "M" }]);
    productFindMany.mockResolvedValueOnce([{ id: "p1", dtfDesignId: null, variants: [{ colorSlug: "white", sizeStocks: [{ size: "M" }] }] }]);
    const where = await resolveProductWhere({ tab: "low-stock" });
    expect(where).toEqual({ archived: false, id: { in: ["p1"] } });
  });
});
```

`describe("getProduct", ...)` and `describe("listCategories", ...)` are untouched.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- admin-products`
Expected: FAIL — `buildProductWhere({tab:"low-stock"})` still returns the old `variants.sizeStocks.stock` clause; `getLowStockProductIds`/`resolveProductWhere` don't exist; `listProducts` doesn't fetch the pool tables.

- [ ] **Step 3: Rewrite `app/_lib/admin-products.ts`**

Replace the file's `buildProductWhere` switch statement and everything from `listProducts` onward:

```typescript
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/_lib/prisma";
import { buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";

export { slugify, uniqueSlug, parseSizes, serializeSizes } from "@/app/_lib/product-helpers";
import { PRODUCT_TABS, type ProductTab } from "@/app/_lib/product-helpers";
export { PRODUCT_TABS, type ProductTab };

export const LOW_STOCK_THRESHOLD = 5;

export type ProductListParams = {
  tab?: ProductTab;
  category?: string;
  q?: string;
};

export function buildProductWhere(params: ProductListParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  switch (params.tab) {
    case "archived":
      where.archived = true;
      break;
    case "all":
      break;
    case "low-stock":
    case "active":
    default:
      where.archived = false;
  }

  if (params.category) where.categorySlug = params.category;

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

// Products affected by a low/out-of-stock raw-material pool: either their
// assigned design is at/below threshold, or any color+size they offer is.
// Computed in-app, not a DB where-clause — quantity no longer lives on the
// product side, and this catalog is small enough to scan in full.
export async function getLowStockProductIds(): Promise<string[]> {
  const [lowPlainRows, lowDesignRows] = await Promise.all([
    prisma.plainTshirtStock.findMany({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } }, select: { colorSlug: true, size: true } }),
    prisma.dtfDesign.findMany({ where: { quantity: { lte: LOW_STOCK_THRESHOLD } }, select: { id: true } }),
  ]);
  const lowColorSizes = new Set(lowPlainRows.map((r) => `${r.colorSlug}::${r.size}`));
  const lowDesignIds = new Set(lowDesignRows.map((r) => r.id));
  if (lowColorSizes.size === 0 && lowDesignIds.size === 0) return [];

  const products = await prisma.product.findMany({
    where: { archived: false },
    select: {
      id: true,
      dtfDesignId: true,
      variants: { where: { archived: false }, select: { colorSlug: true, sizeStocks: { select: { size: true } } } },
    },
  });

  const ids: string[] = [];
  for (const p of products) {
    if (p.dtfDesignId && lowDesignIds.has(p.dtfDesignId)) { ids.push(p.id); continue; }
    const touchesLowPlain = p.variants.some((v) =>
      v.sizeStocks.some((s) => lowColorSizes.has(`${v.colorSlug}::${s.size}`)),
    );
    if (touchesLowPlain) ids.push(p.id);
  }
  return ids;
}

// Same as buildProductWhere, but resolves the low-stock tab's product-id
// filter (a query, not a static clause) before returning.
export async function resolveProductWhere(params: ProductListParams): Promise<Prisma.ProductWhereInput> {
  const where = buildProductWhere(params);
  if (params.tab === "low-stock") {
    where.id = { in: await getLowStockProductIds() };
  }
  return where;
}

export const PAGE_SIZE = 25;

export async function listProducts(
  params: ProductListParams & { page?: number; pageSize?: number },
) {
  const where = await resolveProductWhere(params);
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 200);
  const page = Math.max(1, params.page ?? 1);

  const [rows, total, plainStockRows, designStockRows] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        category: { select: { name: true } },
        variants: {
          // Deleting a color archives (soft-deletes) it; the admin list must show
          // only live colors, so its count/thumbnail/availability exclude archived rows.
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          select: {
            sortOrder: true,
            archived: true,
            colorSlug: true,
            sizeStocks: { select: { size: true } },
            images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
        },
        _count: { select: { variants: { where: { archived: false } } } },
      },
    }),
    prisma.product.count({ where }),
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
  ]);

  return { rows, total, plainStock: buildPlainStockMap(plainStockRows), designStock: buildDesignStockMap(designStockRows) };
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      variants: {
        where: { archived: false },
        orderBy: { sortOrder: "asc" },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          sizeStocks: { orderBy: { size: "asc" } },
        },
      },
    },
  });
}

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}
```

- [ ] **Step 4: Update `products-table.tsx`** — "Total stock" becomes an "Available" badge

Replace `app/_components/admin/products/products-table.tsx` entirely:

```typescript
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import { DeleteProductButton } from "./delete-product-button";
import { resolveDefaultVariant, productInStock, type PlainStockMap, type DesignStockMap } from "@/app/_lib/variants";

type Row = {
  id: string; name: string; price: number; originalPrice: number | null;
  archived: boolean; dtfDesignId: string | null;
  category: { name: string } | null;
  variants: {
    sortOrder: number;
    archived: boolean;
    colorSlug: string;
    sizeStocks: { size: string }[];
    images: { url: string }[];
  }[];
  _count: { variants: number };
};

function thumbnail(row: Row): string {
  const variant = resolveDefaultVariant(row.variants);
  return variant?.images[0]?.url ?? "";
}

export function ProductsTable({
  rows, plainStock, designStock,
}: { rows: Row[]; plainStock: PlainStockMap; designStock: DesignStockMap }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No products match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2"></th><th className="p-2">Name</th><th className="p-2">Category</th>
          <th className="p-2">Price</th><th className="p-2">Colors</th><th className="p-2">Available</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          // productInStock expects { colorSlug, sizes }[] — adapt the row's
          // { colorSlug, sizeStocks } shape rather than renaming the query field.
          const inStock = productInStock(
            p.variants.map((v) => ({ colorSlug: v.colorSlug, sizes: v.sizeStocks })),
            p.dtfDesignId, plainStock, designStock,
          );
          return (
            <tr key={p.id} className={"border-b hover:bg-secondary/40 " + (p.archived ? "opacity-60" : "")}>
              <td className="p-2">{thumbnail(p) && <Image src={thumbnail(p)} alt="" width={36} height={36} className="rounded object-cover" />}</td>
              <td className="p-2 font-medium">
                <Link href={`/admin/products/${p.id}/edit`} className="hover:underline">{p.name}</Link>
                <br /><span className="text-muted-foreground">{p.id}</span>
              </td>
              <td className="p-2">{p.category?.name ?? "—"}</td>
              <td className="p-2 font-medium">{formatPrice(p.price)}{p.originalPrice ? <span className="ml-1 text-xs text-muted-foreground line-through">{formatPrice(p.originalPrice)}</span> : null}</td>
              <td className="p-2">{p._count.variants}</td>
              <td className="p-2"><Badge variant={inStock ? "secondary" : "outline"}>{inStock ? "Available" : "Unavailable"}</Badge></td>
              <td className="p-2"><Badge variant={p.archived ? "outline" : "secondary"}>{p.archived ? "Archived" : "Active"}</Badge></td>
              <td className="p-2 text-right"><DeleteProductButton id={p.id} name={p.name} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Update `app/admin/products/page.tsx`** — per-tab count loop + pass pool maps through

Replace the file's data-fetching and render:

```typescript
import Link from "next/link";
import { listProducts, listCategories, resolveProductWhere, PRODUCT_TABS, PAGE_SIZE, type ProductTab } from "@/app/_lib/admin-products";
import { prisma } from "@/app/_lib/prisma";
import { ProductsToolbar } from "@/app/_components/admin/products/products-toolbar";
import { ProductsTable } from "@/app/_components/admin/products/products-table";

export default async function AdminProductsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = (sp.tab as ProductTab) || "active";
  const page = Number(sp.page ?? "1") || 1;

  const [{ rows, total, plainStock, designStock }, categories, counts] = await Promise.all([
    listProducts({ tab, category: sp.category, q: sp.q, page }),
    listCategories(),
    Promise.all(
      PRODUCT_TABS.map(async (t) => [t, await prisma.product.count({ where: await resolveProductWhere({ tab: t }) })] as const),
    ).then((entries) => Object.fromEntries(entries) as Record<ProductTab, number>),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v !== undefined && k !== "page") params.set(k, v);
    }
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/products${qs ? `?${qs}` : ""}`;
  }

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Products</h1>
      <ProductsToolbar categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} counts={counts} />
      <ProductsTable rows={rows} plainStock={plainStock} designStock={designStock} />
      <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        {page > 1
          ? <Link href={pageHref(page - 1)} className="rounded-md border px-3 py-1 hover:bg-secondary">← Prev</Link>
          : <span className="rounded-md border px-3 py-1 opacity-40">← Prev</span>}
        <span>Page {page} of {pages} · {total} products</span>
        {page < pages
          ? <Link href={pageHref(page + 1)} className="rounded-md border px-3 py-1 hover:bg-secondary">Next →</Link>
          : <span className="rounded-md border px-3 py-1 opacity-40">Next →</span>}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test -- admin-products`
Expected: PASS (all cases)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in products.ts/buy-box-client/product-jsonld/meta feed (Tasks 17–19), seed/mock (Task 20).

- [ ] **Step 8: Commit**

```bash
git add app/_lib/admin-products.ts app/_lib/__tests__/admin-products.test.ts app/_lib/__tests__/admin-products-queries.test.ts app/_components/admin/products/products-table.tsx app/admin/products/page.tsx
git commit -m "feat(inventory): admin product list's low-stock tab and stock column derive from the two pools"
```

---

### Task 17: Storefront catalog reads (`app/_lib/products.ts`)

**Files:**
- Modify: `app/_lib/products.ts`
- Modify: `app/_lib/__tests__/reviews-approved-filter.test.ts`

**Interfaces:**
- Consumes: `buildPlainStockMap`/`buildDesignStockMap`/`availableSizes` (Task 3).
- Produces: `ProductCardVariant.sizes: string[]` keeps its existing shape (now derived, not stored). `VariantDetail` gains `dtfDesignId: string | null` and its `sizeStocks` drops `.stock`. `ProductDetail` gains `plainStockRows`/`designStockRows` (raw arrays — Maps aren't serializable across the Server→Client Component boundary, so the two client consumers in Tasks 18–19 rebuild the maps themselves from these arrays). `getProducts`'s `inStockOnly` filter moves from a DB `where` clause to a post-fetch filter on the already-computed `variant.sizes`.

- [ ] **Step 1: Update the failing test**

In `app/_lib/__tests__/reviews-approved-filter.test.ts`, add the two new prisma methods to the mock and drop `.stock` from both fixtures:

```typescript
const {
  reviewGroupBy, reviewAggregate, reviewFindMany, productFindUnique, productFindMany, plainFindMany, designFindMany,
} = vi.hoisted(() => ({
  reviewGroupBy: vi.fn(),
  reviewAggregate: vi.fn(),
  reviewFindMany: vi.fn(),
  productFindUnique: vi.fn(),
  productFindMany: vi.fn(),
  plainFindMany: vi.fn(),
  designFindMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    review: { groupBy: reviewGroupBy, aggregate: reviewAggregate, findMany: reviewFindMany },
    product: { findUnique: productFindUnique, findMany: productFindMany },
    plainTshirtStock: { findMany: plainFindMany },
    dtfDesign: { findMany: designFindMany },
  },
}));

import {
  getFeaturedProducts, getProductDetail, getProductReviews, getReviewHistogram,
} from "../products";

beforeEach(() => {
  reviewGroupBy.mockReset().mockResolvedValue([]);
  reviewAggregate.mockReset().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
  reviewFindMany.mockReset().mockResolvedValue([]);
  plainFindMany.mockReset().mockResolvedValue([]);
  designFindMany.mockReset().mockResolvedValue([]);
  productFindUnique.mockReset().mockResolvedValue({
    id: "cat-white", name: "Cat", price: 2190, originalPrice: null,
    description: "d", categorySlug: "cat", archived: false, dtfDesignId: "d1",
    category: { slug: "cat", name: "Cat", image: "/x.jpg" },
    variants: [{
      id: "var-1", productId: "cat-white", color: "White", colorSlug: "white",
      swatchHex: "#ffffff", sku: "SKU-1", price: null, originalPrice: null,
      sortOrder: 0, archived: false, images: [], sizeStocks: [],
    }],
  });
  productFindMany.mockReset().mockResolvedValue([]);
});
```

And in the `"list-rating aggregate filters approved:true"` test, drop `.stock` from the fixture:

```typescript
  it("list-rating aggregate filters approved:true", async () => {
    productFindMany.mockResolvedValueOnce([{
      id: "cat-white", name: "Cat", price: 2190, originalPrice: null, categorySlug: "cat", dtfDesignId: "d1",
      variants: [{
        colorSlug: "white", color: "White", swatchHex: "#ffffff", price: null, originalPrice: null,
        sortOrder: 0, images: [{ url: "/x.jpg" }], sizeStocks: [{ size: "M" }],
      }],
    }]);
    await getFeaturedProducts();
    expect(reviewGroupBy.mock.calls[0][0].where.approved).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- reviews-approved-filter`
Expected: FAIL — `getProductDetail`/`attachAggregates` don't yet call `prisma.plainTshirtStock.findMany`/`prisma.dtfDesign.findMany`, and the old code still reads `.stock`.

- [ ] **Step 3: Rewrite `app/_lib/products.ts`**

Update the import line and `cardSelect`:

```typescript
import { effectivePrice, effectiveOriginalPrice, availableSizes, sortSizeStocks, buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";

// ...

const cardSelect = {
  id: true, name: true, price: true, originalPrice: true, categorySlug: true, dtfDesignId: true,
  variants: {
    where: { archived: false },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, colorSlug: true, color: true, swatchHex: true, price: true, originalPrice: true, sortOrder: true,
      images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, select: { url: true } },
      sizeStocks: { select: { size: true } },
    },
  },
} satisfies Prisma.ProductSelect;
```

Replace `attachAggregates`:

```typescript
async function attachAggregates(rows: ProductRow[]): Promise<ProductView[]> {
  // A design with no active variants can't be carded; drop it.
  const usable = rows.filter((r) => r.variants.length > 0);
  if (usable.length === 0) return [];
  const ids = usable.map((r) => r.id);
  const [grouped, plainStockRows, designStockRows] = await Promise.all([
    prisma.review.groupBy({
      by: ["productId"],
      where: { productId: { in: ids }, approved: true },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
  ]);
  const plainStock = buildPlainStockMap(plainStockRows);
  const designStock = buildDesignStockMap(designStockRows);
  const map = new Map(
    grouped.map((g) => [g.productId, { avg: g._avg.rating ?? 0, count: g._count._all }]),
  );
  return usable.map((p) => {
    const agg = map.get(p.id) ?? { avg: 0, count: 0 };
    const variants: ProductCardVariant[] = p.variants.map((v) => ({
      id: v.id,
      colorSlug: v.colorSlug,
      color: v.color,
      swatchHex: v.swatchHex,
      price: effectivePrice(v, p),
      originalPrice: effectiveOriginalPrice(v, p),
      cardImages: v.images.map((im) => im.url),
      sizes: availableSizes(sortSizeStocks(v.sizeStocks), v.colorSlug, p.dtfDesignId, plainStock, designStock),
    }));
    return {
      id: p.id,
      name: p.name,
      rating: agg.avg,
      reviewCount: agg.count,
      category: p.categorySlug,
      defaultColorSlug: variants[0].colorSlug,
      variants,
    };
  });
}
```

Update `VariantDetail` and `ProductDetail`:

```typescript
export type VariantDetail = {
  id: string;
  color: string;
  colorSlug: string;
  swatchHex: string | null;
  sku: string | null;
  price: number;                       // effective
  originalPrice: number | null;        // effective
  detailImages: string[];              // sorted DETAIL urls
  dtfDesignId: string | null;
  sizeStocks: { size: string }[];
};

export type ProductDetail = {
  product: Product & { category: Category };
  variants: VariantDetail[];
  // Raw pool rows, not Maps — Maps aren't serializable across the Server→Client
  // Component boundary. Client consumers (buy-box-client, product-jsonld isn't
  // one but shares the type) rebuild the maps via buildPlainStockMap/buildDesignStockMap.
  plainStockRows: { colorSlug: string; size: string; quantity: number }[];
  designStockRows: { id: string; quantity: number }[];
  ratingAvg: number;
  ratingCount: number;
  related: ProductView[];
};
```

Replace `getProductDetail`'s body:

```typescript
export const getProductDetail = unstable_cache(
  async (id: string): Promise<ProductDetail | null> => {
    const product = await prisma.product.findUnique({
      where: { id, archived: false },
      include: {
        category: true,
        variants: {
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          include: {
            images: { where: { role: "DETAIL" }, orderBy: { sortOrder: "asc" } },
            sizeStocks: { orderBy: { size: "asc" } },
          },
        },
      },
    });
    if (!product || product.variants.length === 0) return null;

    const [plainStockRows, designStockRows] = await Promise.all([
      prisma.plainTshirtStock.findMany({ select: { colorSlug: true, size: true, quantity: true } }),
      prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
    ]);

    const variants: VariantDetail[] = product.variants.map((v) => ({
      id: v.id,
      color: v.color,
      colorSlug: v.colorSlug,
      swatchHex: v.swatchHex,
      sku: v.sku,
      price: effectivePrice(v, product),
      originalPrice: effectiveOriginalPrice(v, product),
      detailImages: v.images.map((im) => im.url),
      dtfDesignId: product.dtfDesignId,
      sizeStocks: sortSizeStocks(v.sizeStocks).map((s) => ({ size: s.size })),
    }));

    const [agg, relatedRows] = await Promise.all([
      prisma.review.aggregate({
        where: { productId: id, approved: true },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.product.findMany({
        where: { archived: false, categorySlug: product.categorySlug, id: { not: id } },
        take: 4,
        orderBy: { id: "asc" },
        select: cardSelect,
      }),
    ]);

    // `product` still carries a variants relation; strip it from the returned
    // shape so the type stays Product & { category }.
    const { variants: _drop, ...productScalars } = product;
    void _drop;

    return {
      product: productScalars,
      variants,
      plainStockRows,
      designStockRows,
      ratingAvg: agg._avg.rating ?? 0,
      ratingCount: agg._count._all,
      related: await attachAggregates(relatedRows),
    };
  },
  ["product-detail"],
  { tags: ["catalog", "product"], revalidate: 300 }
);
```

Replace the `inStockOnly` handling in `getProducts` (drop the DB `where.variants` clause; filter after `attachAggregates`):

```typescript
  // In stock only filter moves below, after attachAggregates — quantity no
  // longer lives on the product/variant row, so it can't be a where-clause.

  const rows = await prisma.product.findMany({
    where,
    orderBy,
    select: cardSelect,
  });

  let views = await attachAggregates(rows);

  // attachAggregates already computed each variant's real available sizes
  // (both pools checked); "in stock" is simply "at least one variant has at
  // least one available size".
  if (inStockOnly) {
    views = views.filter((v) => v.variants.some((variant) => variant.sizes.length > 0));
  }

  // If sorting by rating, do it client-side
  if (sortBy === "rating") {
    views.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  }

  return views;
```

(Delete the old `if (inStockOnly) { where.variants = ... }` block entirely — it no longer exists anywhere in the function.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- reviews-approved-filter`
Expected: PASS (4 tests)

Run: `npm run test -- products-archived-filter featured-products`
Expected: PASS unchanged (both fixtures use empty `findMany` results, so `attachAggregates` returns early before touching the two new pool queries — no updates needed to those two files).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in buy-box-client, product-jsonld, meta feed route (Tasks 18–19), seed/mock (Task 20) — every one of them a *consumer* of the types just changed here.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/products.ts app/_lib/__tests__/reviews-approved-filter.test.ts
git commit -m "feat(inventory): storefront catalog reads derive availability from the two pools"
```

---

### Task 18: PDP size selector + JSON-LD availability (`buy-box-client.tsx`, `product-jsonld.tsx`)

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx`
- Modify: `app/_components/product/product-jsonld.tsx`
- Modify: `app/products/[id]/page.tsx`

**Interfaces:**
- Consumes: `VariantDetail`/`ProductDetail` (Task 17), `variantInStock`/`availableSizes`/`stockForSize`/`buildPlainStockMap`/`buildDesignStockMap` (Task 3).
- Produces: no new exports; both components keep their function names, gaining `plainStockRows`/`designStockRows` props.

No dedicated unit tests exist for either component today (verified: neither appears in any `__tests__` directory) — this repo's convention leaves presentational/RSC components to manual and e2e verification. The type-check step is the gate for this task.

- [ ] **Step 1: Update `buy-box-client.tsx`**

Update the imports:

```typescript
import { useEffect, useMemo, useState } from "react";
// ...
import { variantInStock, availableSizes, stockForSize, buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";
```

Update `VariantDetail` and `Props`:

```typescript
export type VariantDetail = {
  id: string;
  color: string;
  colorSlug: string;
  swatchHex: string | null;
  sku: string | null;
  price: number;
  originalPrice: number | null;
  detailImages: string[];
  dtfDesignId: string | null;
  sizeStocks: { size: string }[];
};

type Props = {
  productId: string;
  name: string;
  variants: VariantDetail[];
  plainStockRows: { colorSlug: string; size: string; quantity: number }[];
  designStockRows: { id: string; quantity: number }[];
  defaultColorSlug: string;
  ratingAvg: number;
  ratingCount: number;
  shareUrl: string;
};
```

Update the component signature and the derived-stock block (currently `const inStock = variantInStock(...)` through `const displayStock = ...`):

```typescript
export function BuyBoxClient({
  productId, name, variants, plainStockRows, designStockRows, defaultColorSlug, ratingAvg, ratingCount, shareUrl,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { addItem } = useCart();
  const { freeThreshold: FREE_DELIVERY_THRESHOLD } = useDeliveryConfig();
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlist();
  const wishlisted = isWishlisted(productId);

  const plainStock = useMemo(() => buildPlainStockMap(plainStockRows), [plainStockRows]);
  const designStock = useMemo(() => buildDesignStockMap(designStockRows), [designStockRows]);

  const colorParam = searchParams.get("color");
  const buyNowIntent = searchParams.get("action") === "buy-now";
  const selectedVariant =
    variants.find((v) => v.colorSlug === colorParam) ??
    variants.find((v) => v.colorSlug === defaultColorSlug) ??
    variants[0];

  const [quantity, setQuantity] = useState(1);
  const [isBuying, setIsBuying] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>("");

  // Clear size + quantity when the color changes (availability differs per color).
  useEffect(() => { setSelectedSize(""); setQuantity(1); }, [selectedVariant.colorSlug]);

  const price = selectedVariant.price;
  const originalPrice = selectedVariant.originalPrice;
  const image = selectedVariant.detailImages[0] ?? "";
  const inStock = variantInStock(selectedVariant.sizeStocks, selectedVariant.colorSlug, selectedVariant.dtfDesignId, plainStock, designStock);
  const sizeList = selectedVariant.sizeStocks.map((s) => s.size);
  const inStockSizes = new Set(availableSizes(selectedVariant.sizeStocks, selectedVariant.colorSlug, selectedVariant.dtfDesignId, plainStock, designStock));
  const sizeStock = selectedSize ? stockForSize(selectedVariant.colorSlug, selectedSize, selectedVariant.dtfDesignId, plainStock, designStock) : 0;
  const qtyMax = Math.min(selectedSize ? sizeStock : 10, 10);
  // Show the exact per-size count only once a size is chosen; before that, a
  // generic "in stock" (a value above the low-stock threshold) so we never
  // falsely render "Only 1 left" on a product that simply has no size selected.
  const displayStock = selectedSize ? sizeStock : inStock ? 999 : 0;
```

Everything below this line (through the end of the component) is unchanged — it only reads `inStock`/`sizeList`/`inStockSizes`/`sizeStock`/`displayStock`/`selectedVariant`, all of which keep the same names and types.

- [ ] **Step 2: Update `product-jsonld.tsx`**

Replace the file entirely:

```typescript
import { absoluteUrl } from "@/app/_lib/absolute-url";
import { stripMarkdown } from "@/app/_lib/strip-markdown";
import { variantInStock, buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";
import type { VariantDetail } from "@/app/_lib/products";

// Emits Product JSON-LD with one Offer per color variant (shared design, many
// colors) for Meta/Google/Pinterest rich results.
export function ProductJsonLd({
  product,
  variants,
  plainStockRows,
  designStockRows,
  ratingAvg,
  ratingCount,
}: {
  product: { id: string; name: string; description: string };
  variants: VariantDetail[];
  plainStockRows: { colorSlug: string; size: string; quantity: number }[];
  designStockRows: { id: string; quantity: number }[];
  ratingAvg: number;
  ratingCount: number;
}) {
  const plainStock = buildPlainStockMap(plainStockRows);
  const designStock = buildDesignStockMap(designStockRows);
  const primary = variants[0];
  const images = variants.flatMap((v) => v.detailImages).slice(0, 6).map((u) => absoluteUrl(u));
  const json: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: images.length > 0 ? images : undefined,
    description: stripMarkdown(product.description, 5000),
    brand: { "@type": "Brand", name: "Dressing Bear" },
    sku: primary?.sku ?? product.id,
    mpn: primary?.sku ?? product.id,
    offers: variants.map((v) => ({
      "@type": "Offer",
      url: absoluteUrl(`/products/${product.id}?color=${v.colorSlug}`),
      priceCurrency: "LKR",
      price: v.price.toFixed(2),
      sku: v.sku ?? `${product.id}-${v.colorSlug}`,
      availability: variantInStock(v.sizeStocks, v.colorSlug, v.dtfDesignId, plainStock, designStock)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    })),
  };

  if (ratingCount > 0) {
    json.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: ratingAvg.toFixed(1),
      reviewCount: ratingCount,
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  );
}
```

- [ ] **Step 3: Wire the PDP page** (`app/products/[id]/page.tsx`)

Update the `<ProductJsonLd>` and `<BuyBoxClient>` call sites:

```typescript
      <ProductJsonLd
        product={{ id: detail.product.id, name: detail.product.name, description: detail.product.description }}
        variants={detail.variants}
        plainStockRows={detail.plainStockRows}
        designStockRows={detail.designStockRows}
        ratingAvg={detail.ratingAvg}
        ratingCount={detail.ratingCount}
      />
```

```typescript
            <BuyBoxClient
              productId={detail.product.id}
              name={detail.product.name}
              variants={detail.variants}
              plainStockRows={detail.plainStockRows}
              designStockRows={detail.designStockRows}
              defaultColorSlug={detail.variants[0].colorSlug}
              ratingAvg={detail.ratingAvg}
              ratingCount={detail.ratingCount}
              shareUrl={absoluteUrl(`/products/${detail.product.id}`)}
            />
```

Every other line in the file is unchanged.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in the meta feed route (Task 19) and seed/mock (Task 20).

- [ ] **Step 5: Commit**

```bash
git add app/_components/product/buy-box-client.tsx app/_components/product/product-jsonld.tsx "app/products/[id]/page.tsx"
git commit -m "feat(inventory): PDP size selector and JSON-LD derive availability from the two pools"
```

---

### Task 19: Meta product feed availability (`app/feed/meta-catalog.csv/route.ts`)

**Files:**
- Modify: `app/feed/meta-catalog.csv/route.ts`

**Interfaces:**
- Consumes: `variantInStock`/`buildPlainStockMap`/`buildDesignStockMap` (Task 3). `variantToFeedRow`/`feedRowsToCsv`/`FeedVariant` (`app/_lib/meta-feed.ts`) are unchanged — they already take a plain `inStock: boolean`, computed by the caller.

No dedicated unit test exists for this route handler (`app/_lib/__tests__/meta-feed-variants.test.ts` covers the pure `variantToFeedRow`/`feedRowsToCsv` helpers only, which don't change). Covered by `tsc --noEmit` and the existing `tests/e2e/meta-pixel.spec.ts` e2e suite.

- [ ] **Step 1: Rewrite the route**

Replace `app/feed/meta-catalog.csv/route.ts` entirely:

```typescript
// app/feed/meta-catalog.csv/route.ts
// Public CSV catalog feed for Meta Commerce Manager / Facebook Shop. Meta pulls
// it on a schedule; cached via `revalidate` so polls don't hit the DB every time.
// Excludes archived products/variants; out-of-stock variants are kept (marked
// out of stock) so ad history is retained. One row per color variant.
import { prisma } from "@/app/_lib/prisma";
import { variantToFeedRow, feedRowsToCsv, type FeedVariant } from "@/app/_lib/meta-feed";
import { variantInStock, buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const [products, plainStockRows, designStockRows] = await Promise.all([
    prisma.product.findMany({
      where: { archived: false },
      orderBy: { id: "asc" },
      select: {
        id: true, name: true, description: true, price: true, originalPrice: true, dtfDesignId: true,
        variants: {
          where: { archived: false },
          orderBy: { sortOrder: "asc" },
          select: {
            color: true, colorSlug: true, sku: true, price: true, originalPrice: true,
            images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, select: { url: true }, take: 1 },
            sizeStocks: { select: { size: true } },
          },
        },
      },
    }),
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
  ]);
  const plainStock = buildPlainStockMap(plainStockRows);
  const designStock = buildDesignStockMap(designStockRows);

  const rows = products.flatMap((p) =>
    p.variants.map((v) =>
      variantToFeedRow({
        productId: p.id,
        productName: p.name,
        color: v.color,
        colorSlug: v.colorSlug,
        description: p.description,
        sku: v.sku,
        price: v.price ?? p.price,
        originalPrice: v.originalPrice ?? p.originalPrice,
        inStock: variantInStock(v.sizeStocks, v.colorSlug, p.dtfDesignId, plainStock, designStock),
        image: v.images[0]?.url ?? "",
      } satisfies FeedVariant),
    ),
  );
  const csv = feedRowsToCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
```

- [ ] **Step 2: Run the meta-feed unit tests to confirm they're unaffected**

Run: `npm run test -- meta-feed-variants`
Expected: PASS (unchanged — `variantToFeedRow`/`feedRowsToCsv` signatures didn't move)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in seed/mock (Task 20).

- [ ] **Step 4: Commit**

```bash
git add app/feed/meta-catalog.csv/route.ts
git commit -m "feat(inventory): Meta product feed availability derives from the two pools"
```

---

### Task 20: Seed data — demo pools + per-product design assignment

**Files:**
- Modify: `app/_data/mock.ts`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces: `MockProduct.design: { name: string; slug: string }` (new field); `MockSize = { size: string }` (drops the vestigial `stock?` override — nothing reads a per-size quantity from mock data anymore). No test file covers `seed.ts` (it's a `tsx`-run script, not imported by the test suite) — verified by `tsc --noEmit` and, per [[no-local-database]], actually running it is deferred to the user against a real database.

This is dev/demo-only tooling (confirmed in the design doc: `seed.ts` destructively rebuilds `VariantSizeStock` on every run, so it's never re-run against a live production database). It's fine for this task to seed both pools with deterministic non-zero demo values — that doesn't conflict with the "start every pool at zero" production rollout decision, which is about the real database, not local/preview seeding. **Reseed safety:** the two pool upserts below only set `quantity` in their `create` branch, never their `update` branch — re-running the seed script against a database an admin has already been managing keeps their real counts intact.

- [ ] **Step 1: Update `app/_data/mock.ts`**

Replace the file entirely:

```typescript
export type Category = {
  slug: string;
  name: string;
  image: string;
};

export type MockSize = { size: string };

export type MockVariant = {
  color: string;
  colorSlug: string;
  swatchHex?: string;
  sku?: string;
  price?: number;        // optional override; default is the product base price
  originalPrice?: number;
  sizes: MockSize[];
};

export type MockDesign = { name: string; slug: string };

export type MockProduct = {
  id: string;            // product-level slug/id, color-free
  name: string;          // color-free design name
  price: number;
  originalPrice?: number;
  category: string;
  design: MockDesign;    // the DTF print design this product is built on
  variants: MockVariant[];
};

const STD_SIZES: MockSize[] = [{ size: "S" }, { size: "M" }, { size: "L" }, { size: "XL" }];

export const categories: Category[] = [
  { slug: "cat", name: "Cat", image: "/products/cat/white/card/1.jpg" },
  { slug: "dino", name: "Dino", image: "/products/dino/white/card/1.jpg" },
];

const COLORS: { color: string; colorSlug: string; swatchHex: string }[] = [
  { color: "White", colorSlug: "white", swatchHex: "#FFFFFF" },
  { color: "Ivory", colorSlug: "ivory", swatchHex: "#FFFFF0" },
  { color: "Baby Pink", colorSlug: "baby-pink", swatchHex: "#F4C2C2" },
];

function variantsFor(productId: string): MockVariant[] {
  return COLORS.map((c) => ({
    color: c.color,
    colorSlug: c.colorSlug,
    swatchHex: c.swatchHex,
    sku: `${productId}-${c.colorSlug}`.toUpperCase(),
    sizes: STD_SIZES,
  }));
}

export const catalogProducts: MockProduct[] = [
  { id: "oversize-cat-tshirt",  name: "Oversize Cat T-Shirt",  price: 2190, category: "cat",  design: { name: "Cat", slug: "cat" },   variants: variantsFor("oversize-cat-tshirt") },
  { id: "oversize-dino-tshirt", name: "Oversize Dino T-Shirt", price: 2190, category: "dino", design: { name: "Dino", slug: "dino" }, variants: variantsFor("oversize-dino-tshirt") },
];
```

- [ ] **Step 2: Update `prisma/seed.ts`**

Replace `stockFor` with two deterministic quantity helpers:

```typescript
function plainStockFor(colorSlug: string, size: string): number {
  const rng = rngFromId(`plain:${colorSlug}:${size}`);
  return 5 + Math.floor(rng() * 21); // 5..25
}

function designStockFor(slug: string): number {
  const rng = rngFromId(`design:${slug}`);
  return 10 + Math.floor(rng() * 41); // 10..50 — a print batch typically covers many units
}
```

In `main()`, insert two new seeding passes **after** the categories loop and **before** the `for (const p of catalogProducts)` product loop:

```typescript
  // DTF designs — one row per distinct design the catalog uses. Quantity is
  // set only on first create; a reseed never overwrites an admin-edited count.
  const designIdBySlug = new Map<string, string>();
  const distinctDesigns = new Map(catalogProducts.map((p) => [p.design.slug, p.design]));
  for (const d of distinctDesigns.values()) {
    const row = await prisma.dtfDesign.upsert({
      where: { slug: d.slug },
      update: { name: d.name },
      create: { name: d.name, slug: d.slug, quantity: designStockFor(d.slug) },
    });
    designIdBySlug.set(d.slug, row.id);
  }

  // Plain T-shirt stock — one row per distinct (colorSlug,size) the catalog
  // offers. Same create-only quantity rule as designs above.
  const distinctPlainCells = new Map<string, { color: string; colorSlug: string; size: string }>();
  for (const p of catalogProducts) {
    for (const v of p.variants) {
      for (const s of v.sizes) {
        distinctPlainCells.set(`${v.colorSlug}::${s.size}`, { color: v.color, colorSlug: v.colorSlug, size: s.size });
      }
    }
  }
  for (const cell of distinctPlainCells.values()) {
    await prisma.plainTshirtStock.upsert({
      where: { colorSlug_size: { colorSlug: cell.colorSlug, size: cell.size } },
      update: { color: cell.color },
      create: { color: cell.color, colorSlug: cell.colorSlug, size: cell.size, quantity: plainStockFor(cell.colorSlug, cell.size) },
    });
  }
```

Update the product upsert to set `dtfDesignId`:

```typescript
  for (const p of catalogProducts) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name, price: p.price, originalPrice: p.originalPrice ?? null,
        description: DEFAULT_DESCRIPTION, categorySlug: p.category,
        dtfDesignId: designIdBySlug.get(p.design.slug)!,
      },
      create: {
        id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice ?? null,
        description: DEFAULT_DESCRIPTION, categorySlug: p.category,
        dtfDesignId: designIdBySlug.get(p.design.slug)!,
      },
    });
```

And drop `.stock` from the `variantSizeStock.createMany` call inside the variant loop:

```typescript
      await prisma.variantSizeStock.createMany({
        data: v.sizes.map((s) => ({ variantId: variant.id, size: s.size })),
      });
```

Everything else in `seed.ts` (category upsert, image resolution, review seeding, the `FORCE_SEED` prune block, the final log line) is unchanged.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: **zero errors anywhere in the project.** Every consumer touched across Tasks 1–20 should now compile clean.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS — every suite in the repo, not just the files this plan touched.

- [ ] **Step 5: Commit**

```bash
git add app/_data/mock.ts prisma/seed.ts
git commit -m "feat(inventory): seed demo raw-material pools and per-product design assignment"
```

---

### Task 21: Migration B — drop `VariantSizeStock.stock` (ship only after Tasks 1–20 are live)

**⚠️ Do not run this task until the code from Tasks 1–20 is deployed and confirmed serving traffic.** The old code path no longer exists after Task 20, but the column has been dead weight since Task 1 (nothing reads or writes it) — this task is pure cleanup, sequenced last so a rollback of the app code never needs a matching schema rollback.

**Files:**
- Create: `prisma/migrations/20260711130000_drop_variant_size_stock_stock/migration.sql`

**Interfaces:** none — the Prisma schema already dropped this field's declaration in Task 1; this task only removes the now-orphaned database column.

- [ ] **Step 1: Write the migration**

Create `prisma/migrations/20260711130000_drop_variant_size_stock_stock/migration.sql`:

```sql
-- Drop VariantSizeStock.stock now that raw-material pools (PlainTshirtStock +
-- DtfDesign, added in 20260711120000) are the source of truth for quantity.
-- Ship only after that migration's app code is confirmed live — older code
-- reads/writes this column right up until the new code is actually serving
-- traffic.
ALTER TABLE "VariantSizeStock" DROP COLUMN IF EXISTS "stock";
```

- [ ] **Step 2: Commit**

```bash
git add prisma/migrations/20260711130000_drop_variant_size_stock_stock
git commit -m "chore(inventory): drop the now-unused VariantSizeStock.stock column (migration B)"
```

- [ ] **Step 3: Tell the user what's left**

This plan cannot apply migrations or do browser verification itself (per [[no-local-database]] — no `DATABASE_URL` in this environment). Once all 21 tasks are committed, tell the user:
1. Apply Migration A (`20260711120000_add_tshirt_raw_material_inventory`) via the project's deploy pipeline, then deploy the app code from Tasks 1–20.
2. Once that's live, do the one-time admin pass: visit `/admin/inventory`, enter real Plain T-Shirt Stock quantities and DTF Design quantities, then visit `/admin/products` and assign a DTF design to every existing product (they all start with `dtfDesignId = null`, i.e. unavailable, until this is done).
3. Only after that, apply Migration B (`20260711130000_drop_variant_size_stock_stock`).
4. Spot-check in a browser: a product page shows sizes greyed out before stock is entered and selectable after; the admin Inventory grid saves quantities; setting a design's quantity to 0 takes every product using it out of stock end-to-end (PDP, product card, cart).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-11-tshirt-raw-material-inventory.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
