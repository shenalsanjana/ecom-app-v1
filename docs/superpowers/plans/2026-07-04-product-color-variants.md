# Product Color Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each garment design into a single product with multiple color variants — swatches on cards and the PDP, two image sets per color (card slider + PDP gallery), a real per-size stock grid, optional SKU and price override, and `?color=` deep-linking — replacing today's one-color-per-`Product` model.

**Architecture:** Introduce a `ProductVariant` layer under `Product`, with `VariantImage` (role `CARD`|`DETAIL`) for the two image sets and `VariantSizeStock` for the color×size inventory grid. We use **expand-contract**: Phase 1 adds the new tables *additively* (legacy `Product.image/stock/sizes` + `ProductImage` remain, inert but seed-populated, so the tree keeps typechecking); each middle phase migrates one read/write/UI path onto the new model; the final phase drops the legacy columns and the `ProductImage` table. Shared app-level TS types (`ProductDetail`, `ProductView`) are reshaped **together with all their consumers in a single phase**, never split across a phase boundary.

**Tech Stack:** Next.js 16 (App Router, Server Components), Prisma + PostgreSQL (Neon), NextAuth v5, Vercel Blob (image upload), Vitest (unit), Playwright (E2E), Tailwind v4, shadcn/ui, Zod.

## Global Constraints

- **Validation gate is `npx tsc --noEmit` + `npm run test` (Vitest).** There is NO local database and `next build` prerender fails without `DATABASE_URL` (see project memory). Do NOT rely on `prisma migrate dev`, `prisma db push`, or a running app to verify a phase. Every "verify" step below means *typechecks clean and unit tests pass*.
- **Migrations are hand-authored.** Add a new timestamped folder under `prisma/migrations/<UTC-YYYYMMDDHHMMSS>_<name>/migration.sql`. SQL must be **re-runnable** using `IF EXISTS` / `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, matching the repo convention (see `prisma/migrations/20260703140000_phone_first_registration/migration.sql`). Do NOT edit `migration_lock.toml`. After editing `prisma/schema.prisma`, run `npx prisma generate` to refresh the client types, then `npx tsc --noEmit`.
- **Vitest invocation:** run the whole suite with `npm run test` (a dir-prefix or `npx vitest <path>` filter trips a "no tests" globalSetup quirk in this repo). To scope while iterating, use `npm run test -- -t "<describe/it substring>"`.
- **Prisma runtime:** API routes / server actions that touch Prisma use the `nodejs` runtime. Reuse the shared client `import { prisma } from "@/app/_lib/prisma"`.
- **Server/Client boundary (CLAUDE.md):** never render an `async` Server Component inside a `"use client"` component. New interactive pieces (swatch switcher, color selector) are small client *leaves* fed plain serializable data by their server parent.
- **Commit style (Conventional Commits):** `feat(catalog): …`, `feat(admin): …`, `feat(checkout): …`, `refactor(catalog): …`, `test(catalog): …`. End commit bodies with the repo's `Co-Authored-By` trailer.
- **Money:** prices are `Float` LKR. "Effective price" of a variant = `variant.price ?? product.price`; effective originalPrice = `variant.originalPrice ?? product.originalPrice`.
- **Default variant** = the non-archived variant with the lowest `sortOrder`. It drives the card's initial image, the PDP's initial state (absent a valid `?color=`), and list price display.
- **In stock:** a variant is in stock iff any of its `VariantSizeStock.stock > 0`; a product is in stock iff any variant is.

---

## File Structure

**New files:**
- `app/_lib/variants.ts` (P2) — pure variant domain helpers (effective price, in-stock, available sizes, default-variant resolution). Unit-tested; no DB, no React.
- `app/_lib/__tests__/variants.test.ts` (P2) — unit tests for the above.
- `app/_components/product/color-swatches.tsx` (P4) — presentational swatch row (small client leaf, no state of its own); shared by the PDP buy box and the product card.
- `app/_components/admin/products/variant-editor.tsx` (P3) — admin repeatable variant editor (color, swatch, SKU, price override, two image sets, size-stock grid).
- `app/_lib/order-validation.ts` (P6) — pure `validateCartItems` cart-vs-inventory rules (unit-tested; imported by the checkout action).
- `app/checkout/__tests__/variant-stock.test.ts` (P6) — `validateCartItems` unit tests.
- `app/_lib/__tests__/meta-feed-variants.test.ts` (P7) — feed per-variant row tests.
- Migrations: `prisma/migrations/<ts>_add_product_variants/migration.sql` (P1) and `<ts>_drop_legacy_product_columns/migration.sql` (P7).

Note: the product card becomes a `"use client"` component itself (it owns `selectedColorSlug`, which drives image + price + cart target), so there is no separate `product-card-variants.tsx`; and the PDP buy box hosts the swatches directly via `ColorSwatches`, so there is no separate `variant-selector.tsx`.

**Modified files (by phase):**
- P1: `prisma/schema.prisma`
- P2: `app/_data/mock.ts`, `prisma/seed.ts` (+ create `app/_lib/variants.ts`)
- P3: `app/admin/products/actions.ts`, `app/_components/admin/products/product-form.tsx`, `app/_lib/admin-products.ts`, `app/admin/products/[id]/edit/page.tsx`, `app/admin/products/new/page.tsx`, `app/_components/admin/products/products-table.tsx`, `app/_lib/__tests__/admin-products.test.ts` (+ delete `stock-quick-edit.tsx`, + create `variant-editor.tsx`)
- P4: `app/_lib/products.ts` (detail read only), `app/products/[id]/page.tsx`, `app/_components/product/buy-box-client.tsx`, `app/_components/product/image-gallery.tsx` (+ create `app/_components/product/color-swatches.tsx`)
- P5: `app/_lib/products.ts` (list reads + `ProductView`), `app/_components/home/product-card.tsx`, `app/_components/home/product-grid.tsx`, `app/_components/home/deals-section.tsx`, `app/categories/[slug]/page.tsx`, `app/categories/page.tsx`, `app/deals/page.tsx`, `app/search/page.tsx`, `app/wishlist/page.tsx`, `app/_components/product/related-strip.tsx`
- P6: `app/_lib/cart-context.tsx`, `app/_components/cart/add-to-cart-button.tsx`, `app/_components/cart/add-to-cart-dialog.tsx`, `app/_components/product/buy-box-client.tsx`, `app/_components/home/product-card.tsx`, `app/_lib/products.ts` (add `id` to `ProductCardVariant`), `app/checkout/actions.ts` (+ create `order-validation.ts`)
- P7: `app/_components/product/product-jsonld.tsx`, `app/_lib/meta-feed.ts`, `app/feed/meta-catalog.csv/route.ts`, `app/products/[id]/page.tsx` (metadata + JSON-LD), `prisma/schema.prisma` (drop legacy), `prisma/seed.ts` (drop back-fill), `app/admin/products/actions.ts` (drop back-fill)

---

## Phase 1 — Schema (additive) + migration + types

**Goal:** Add the three variant models and the `OrderItem` snapshot columns without removing anything. First green checkpoint; small and isolated.

### Task 1.1: Add variant models to the Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces produced (used by every later phase):**
- `ProductVariant { id, productId, color, colorSlug, swatchHex?, sku?, price?, originalPrice?, sortOrder, archived, images VariantImage[], sizeStocks VariantSizeStock[], orderItems OrderItem[] }`
- `VariantImage { id, variantId, url, role, sortOrder }` — `role` is `"CARD" | "DETAIL"`.
- `VariantSizeStock { id, variantId, size, stock }`
- `OrderItem` gains `variantId?`, `color?`, `sku?` and a nullable `variant` relation.

- [ ] **Step 1: Add the new models and relations.** In `prisma/schema.prisma`:

Add to the `Product` model's relation block (keep `image`, `stock`, `sizes`, `images` for now):
```prisma
  variants      ProductVariant[]
```

Add three new models after `ProductImage`:
```prisma
model ProductVariant {
  id            String   @id @default(cuid())
  productId     String
  color         String                     // display, e.g. "Baby Pink"
  colorSlug     String                     // url-safe, used in ?color=
  swatchHex     String?                    // swatch dot color; null => use first CARD image
  sku           String?  @unique           // optional; unique when present
  price         Float?                     // optional override; null => Product.price
  originalPrice Float?                     // optional override; null => Product.originalPrice
  sortOrder     Int      @default(0)       // lowest = default color
  archived      Boolean  @default(false)

  product    Product            @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  images     VariantImage[]
  sizeStocks VariantSizeStock[]
  orderItems OrderItem[]

  @@unique([productId, colorSlug])
  @@index([productId])
}

model VariantImage {
  id        String @id @default(cuid())
  variantId String
  url       String
  role      String @db.VarChar(8)          // "CARD" | "DETAIL"
  sortOrder Int    @default(0)

  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@index([variantId, role, sortOrder])
}

model VariantSizeStock {
  id        String @id @default(cuid())
  variantId String
  size      String
  stock     Int    @default(0)

  variant   ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([variantId, size])
  @@index([variantId])
}
```

Modify the `OrderItem` model — add three columns and one relation (keep everything else):
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

  order     Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product   Product?        @relation(fields: [productId], references: [id], onDelete: SetNull)
  variant   ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)

  @@index([orderId])
  @@index([productId])
  @@index([variantId])
}
```

- [ ] **Step 2: Regenerate the Prisma client and typecheck.**

Run: `npx prisma generate && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

Run: `npx tsc --noEmit`
Expected: PASS (no code consumes the new models yet; nothing removed, so existing code is unaffected).

- [ ] **Step 3: Commit.**
```bash
git add prisma/schema.prisma
git commit -m "feat(catalog): add ProductVariant/VariantImage/VariantSizeStock schema models"
```

### Task 1.2: Hand-author the additive migration

**Files:**
- Create: `prisma/migrations/<UTC timestamp>_add_product_variants/migration.sql`

**Interfaces:** none (DDL only). Consumes the schema from Task 1.1.

- [ ] **Step 1: Create the migration folder + SQL.** Name the folder with a UTC timestamp strictly greater than `20260703140000` (e.g. `20260704120000_add_product_variants`). Write `migration.sql`:

```sql
-- Add product color variants: ProductVariant + VariantImage + VariantSizeStock,
-- plus OrderItem snapshot columns (variantId/color/sku). Additive & re-runnable
-- per this repo's deploy convention. Legacy Product.image/stock/sizes and the
-- ProductImage table are intentionally retained here; a later migration drops them.

CREATE TABLE IF NOT EXISTS "ProductVariant" (
  "id"            TEXT NOT NULL,
  "productId"     TEXT NOT NULL,
  "color"         TEXT NOT NULL,
  "colorSlug"     TEXT NOT NULL,
  "swatchHex"     TEXT,
  "sku"           TEXT,
  "price"         DOUBLE PRECISION,
  "originalPrice" DOUBLE PRECISION,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "archived"      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
-- Postgres treats NULLs as distinct, so multiple variants may have NULL sku.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_productId_colorSlug_key" ON "ProductVariant"("productId", "colorSlug");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");

CREATE TABLE IF NOT EXISTS "VariantImage" (
  "id"        TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "role"      VARCHAR(8) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VariantImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VariantImage_variantId_role_sortOrder_idx" ON "VariantImage"("variantId", "role", "sortOrder");

CREATE TABLE IF NOT EXISTS "VariantSizeStock" (
  "id"        TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "size"      TEXT NOT NULL,
  "stock"     INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VariantSizeStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VariantSizeStock_variantId_size_key" ON "VariantSizeStock"("variantId", "size");
CREATE INDEX IF NOT EXISTS "VariantSizeStock_variantId_idx" ON "VariantSizeStock"("variantId");

-- OrderItem snapshot columns
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "color"     TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sku"       TEXT;
CREATE INDEX IF NOT EXISTS "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- Foreign keys (idempotent via DO block; ADD CONSTRAINT has no IF NOT EXISTS)
DO $$ BEGIN
  ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VariantImage" ADD CONSTRAINT "VariantImage_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VariantSizeStock" ADD CONSTRAINT "VariantSizeStock_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 2: Sanity-check the SQL against the schema.** Confirm every column name and type matches Task 1.1 (`DOUBLE PRECISION` for `Float`, `VARCHAR(8)` for `role`). There is no DB to run it against; correctness is by inspection + the `prisma validate` from Task 1.1.

- [ ] **Step 3: Commit.**
```bash
git add prisma/migrations
git commit -m "feat(catalog): additive migration for product variant tables"
```

---

## Phase 2 — Variant domain helpers (pure) + seed restructure

**Goal:** A unit-tested pure module for variant math, and a reseed that defines products with nested variants while keeping legacy scalar columns populated (so later phases keep typechecking). No storefront/admin wiring yet.

### Task 2.1: Create `app/_lib/variants.ts` (TDD)

**Files:**
- Create: `app/_lib/variants.ts`
- Test: `app/_lib/__tests__/variants.test.ts`

**Interfaces produced (consumed by Phases 3–7):**
- `type SizeStock = { size: string; stock: number }`
- `effectivePrice(variant: { price: number | null }, product: { price: number }): number`
- `effectiveOriginalPrice(variant: { originalPrice: number | null }, product: { originalPrice: number | null }): number | null`
- `variantInStock(sizeStocks: SizeStock[]): boolean`
- `productInStock(variants: { sizeStocks: SizeStock[] }[]): boolean`
- `availableSizes(sizeStocks: SizeStock[]): string[]`
- `stockForSize(sizeStocks: SizeStock[], size: string): number`
- `resolveDefaultVariant<T extends { sortOrder: number; archived: boolean }>(variants: T[]): T | null`
- `pickVariantBySlug<T extends { colorSlug: string }>(variants: T[], slug: string | undefined): T | undefined`

- [ ] **Step 1: Write the failing test** — `app/_lib/__tests__/variants.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  effectivePrice,
  effectiveOriginalPrice,
  variantInStock,
  productInStock,
  availableSizes,
  stockForSize,
  resolveDefaultVariant,
  pickVariantBySlug,
} from "../variants";

describe("effectivePrice", () => {
  it("uses the variant override when present", () => {
    expect(effectivePrice({ price: 2490 }, { price: 2190 })).toBe(2490);
  });
  it("falls back to the product base price when override is null", () => {
    expect(effectivePrice({ price: null }, { price: 2190 })).toBe(2190);
  });
});

describe("effectiveOriginalPrice", () => {
  it("prefers the variant override, else the product value, else null", () => {
    expect(effectiveOriginalPrice({ originalPrice: 2990 }, { originalPrice: 2790 })).toBe(2990);
    expect(effectiveOriginalPrice({ originalPrice: null }, { originalPrice: 2790 })).toBe(2790);
    expect(effectiveOriginalPrice({ originalPrice: null }, { originalPrice: null })).toBeNull();
  });
});

describe("stock helpers", () => {
  const grid = [
    { size: "S", stock: 0 },
    { size: "M", stock: 4 },
    { size: "L", stock: 0 },
  ];
  it("variantInStock is true when any cell > 0", () => {
    expect(variantInStock(grid)).toBe(true);
    expect(variantInStock([{ size: "S", stock: 0 }])).toBe(false);
  });
  it("availableSizes returns only sizes with stock", () => {
    expect(availableSizes(grid)).toEqual(["M"]);
  });
  it("stockForSize returns the cell count, or 0 when absent", () => {
    expect(stockForSize(grid, "M")).toBe(4);
    expect(stockForSize(grid, "XL")).toBe(0);
  });
  it("productInStock is true when any variant has stock", () => {
    expect(productInStock([{ sizeStocks: [{ size: "S", stock: 0 }] }, { sizeStocks: grid }])).toBe(true);
    expect(productInStock([{ sizeStocks: [{ size: "S", stock: 0 }] }])).toBe(false);
  });
});

describe("resolveDefaultVariant", () => {
  it("returns the lowest sortOrder among non-archived variants", () => {
    const v = resolveDefaultVariant([
      { colorSlug: "white", sortOrder: 2, archived: false },
      { colorSlug: "pink", sortOrder: 0, archived: false },
      { colorSlug: "ivory", sortOrder: 1, archived: false },
    ]);
    expect(v?.colorSlug).toBe("pink");
  });
  it("skips archived variants and returns null when none are active", () => {
    expect(
      resolveDefaultVariant([{ colorSlug: "white", sortOrder: 0, archived: true }])
    ).toBeNull();
  });
});

describe("pickVariantBySlug", () => {
  const vs = [{ colorSlug: "white" }, { colorSlug: "ivory" }];
  it("finds by slug, returns undefined for unknown or missing slug", () => {
    expect(pickVariantBySlug(vs, "ivory")?.colorSlug).toBe("ivory");
    expect(pickVariantBySlug(vs, "green")).toBeUndefined();
    expect(pickVariantBySlug(vs, undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**
Run: `npm run test -- -t "effectivePrice"`
Expected: FAIL — `Cannot find module '../variants'`.

- [ ] **Step 3: Implement `app/_lib/variants.ts`:**
```ts
// Pure variant domain helpers. No DB, no React — unit-tested in isolation.
export type SizeStock = { size: string; stock: number };

export function effectivePrice(
  variant: { price: number | null },
  product: { price: number },
): number {
  return variant.price ?? product.price;
}

export function effectiveOriginalPrice(
  variant: { originalPrice: number | null },
  product: { originalPrice: number | null },
): number | null {
  return variant.originalPrice ?? product.originalPrice;
}

export function variantInStock(sizeStocks: SizeStock[]): boolean {
  return sizeStocks.some((s) => s.stock > 0);
}

export function productInStock(variants: { sizeStocks: SizeStock[] }[]): boolean {
  return variants.some((v) => variantInStock(v.sizeStocks));
}

export function availableSizes(sizeStocks: SizeStock[]): string[] {
  return sizeStocks.filter((s) => s.stock > 0).map((s) => s.size);
}

export function stockForSize(sizeStocks: SizeStock[], size: string): number {
  return sizeStocks.find((s) => s.size === size)?.stock ?? 0;
}

export function resolveDefaultVariant<T extends { sortOrder: number; archived: boolean }>(
  variants: T[],
): T | null {
  const active = variants.filter((v) => !v.archived);
  if (active.length === 0) return null;
  return active.reduce((best, v) => (v.sortOrder < best.sortOrder ? v : best));
}

export function pickVariantBySlug<T extends { colorSlug: string }>(
  variants: T[],
  slug: string | undefined,
): T | undefined {
  return slug ? variants.find((v) => v.colorSlug === slug) : undefined;
}
```

- [ ] **Step 4: Run the tests, confirm pass.**
Run: `npm run test -- -t "effectivePrice"` then the full `npm run test`.
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add app/_lib/variants.ts app/_lib/__tests__/variants.test.ts
git commit -m "feat(catalog): pure variant pricing/stock helpers with unit tests"
```

### Task 2.2: Restructure `app/_data/mock.ts` into products-with-variants

**Files:**
- Modify: `app/_data/mock.ts`

**Interfaces produced (consumed by `prisma/seed.ts`):**
- `type MockSize = { size: string; stock?: number }`
- `type MockVariant = { color: string; colorSlug: string; swatchHex?: string; sku?: string; price?: number; originalPrice?: number; sizes: MockSize[] }`
- `type MockProduct = { id: string; name: string; price: number; originalPrice?: number; category: string; variants: MockVariant[] }`
- `catalogProducts: MockProduct[]`, `categories: Category[]` (unchanged export name).

- [ ] **Step 1: Rewrite `app/_data/mock.ts`:**
```ts
export type Category = {
  slug: string;
  name: string;
  image: string;
};

export type MockSize = { size: string; stock?: number };

export type MockVariant = {
  color: string;
  colorSlug: string;
  swatchHex?: string;
  sku?: string;
  price?: number;        // optional override; default is the product base price
  originalPrice?: number;
  sizes: MockSize[];     // stock omitted => deterministic seed default
};

export type MockProduct = {
  id: string;            // product-level slug/id, color-free
  name: string;          // color-free design name
  price: number;
  originalPrice?: number;
  category: string;
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
  { id: "oversize-cat-tshirt",  name: "Oversize Cat T-Shirt",  price: 2190, category: "cat",  variants: variantsFor("oversize-cat-tshirt") },
  { id: "oversize-dino-tshirt", name: "Oversize Dino T-Shirt", price: 2190, category: "dino", variants: variantsFor("oversize-dino-tshirt") },
];
```

Note: the six legacy per-color ids (`cat-white`, …) are gone; each design is now one product id. This is the reseed-from-scratch approach — no redirect rows are authored because the old ids were demo data.

- [ ] **Step 2: Typecheck.** Run `npx tsc --noEmit`.
Expected: FAIL — `prisma/seed.ts` still imports `featuredProducts`/`dealsProducts` (fixed in Task 2.3). This is expected; do not commit yet.

### Task 2.3: Rewrite `prisma/seed.ts` to seed variants (and keep legacy columns populated)

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:** consumes `catalogProducts`, `categories` from Task 2.2 and helpers from `app/_lib/variants.ts`.

- [ ] **Step 1: Rewrite the seed body.** Replace the product-seeding section so that, for each `MockProduct`, it: upserts the `Product` (filling legacy `image`/`stock`/`sizes` from variant data so the still-NOT-NULL columns are satisfied), deletes+recreates its `ProductVariant` rows, and for each variant creates `VariantImage` (CARD + DETAIL, resolved from `public/products/<productId>/<colorSlug>/card|detail/`) and `VariantSizeStock` rows. Reviews stay product-level.

Full replacement for the region from `function pickProductMain` through the end of `main()`'s product loop:
```ts
// Resolve variant image files under public/products/<productId>/<colorSlug>/<role>/1.jpg..8.jpg.
// Falls back to a single demo SVG so a bare checkout still has an image.
function resolveVariantImages(productId: string, colorSlug: string, role: "card" | "detail"): string[] {
  const urls: string[] = [];
  for (let n = 1; n <= 8; n++) {
    const candidates = [`${n}.jpg`, `${n}.jpeg`, `${n}.png`, `${n}.webp`];
    const found = candidates.find((file) =>
      existsSync(publicPath("products", productId, colorSlug, role, file)),
    );
    if (!found) break;
    urls.push(`/products/${productId}/${colorSlug}/${role}/${found}`);
  }
  if (urls.length === 0) {
    // Demo fallback: main.svg at the product root (generated by scripts/generate-demo-images.ts).
    urls.push(`/products/${productId}/main.svg`);
  }
  return urls;
}

function stockFor(seedKey: string): number {
  const rng = rngFromId(seedKey + ":stock");
  return 5 + Math.floor(rng() * 21); // 5..25
}
```

Then replace the `for (const p of all)` product loop with:
```ts
  for (const p of catalogProducts) {
    // Legacy scalar columns are still NOT NULL until the Phase 7 contract migration.
    // Populate them from variant data so the row is valid; storefront/admin no
    // longer read them after their respective phases migrate.
    const firstVariant = p.variants[0];
    const legacyImage = resolveVariantImages(p.id, firstVariant.colorSlug, "card")[0];
    const legacySizes = Array.from(
      new Set(p.variants.flatMap((v) => v.sizes.map((s) => s.size))),
    ).join(",");

    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name, price: p.price, originalPrice: p.originalPrice ?? null,
        image: legacyImage, description: DEFAULT_DESCRIPTION, stock: 0,
        categorySlug: p.category, sizes: legacySizes,
      },
      create: {
        id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice ?? null,
        image: legacyImage, description: DEFAULT_DESCRIPTION, stock: 0,
        categorySlug: p.category, sizes: legacySizes,
      },
    });

    // Rebuild variants (delete cascades to VariantImage + VariantSizeStock).
    await prisma.productVariant.deleteMany({ where: { productId: p.id } });
    for (let vi = 0; vi < p.variants.length; vi++) {
      const v = p.variants[vi];
      const variant = await prisma.productVariant.create({
        data: {
          productId: p.id,
          color: v.color,
          colorSlug: v.colorSlug,
          swatchHex: v.swatchHex ?? null,
          sku: v.sku ?? null,
          price: v.price ?? null,
          originalPrice: v.originalPrice ?? null,
          sortOrder: vi,
          archived: false,
        },
      });

      const cardUrls = resolveVariantImages(p.id, v.colorSlug, "card");
      const detailUrls = resolveVariantImages(p.id, v.colorSlug, "detail");
      const imageRows = [
        ...cardUrls.map((url, i) => ({ variantId: variant.id, url, role: "CARD", sortOrder: i })),
        ...detailUrls.map((url, i) => ({ variantId: variant.id, url, role: "DETAIL", sortOrder: i })),
      ];
      await prisma.variantImage.createMany({ data: imageRows });

      await prisma.variantSizeStock.createMany({
        data: v.sizes.map((s) => ({
          variantId: variant.id,
          size: s.size,
          stock: s.stock ?? stockFor(`${p.id}:${v.colorSlug}:${s.size}`),
        })),
      });
    }

    // Reviews (product-level, shared across colors) — unchanged logic, keyed on p.id.
    await prisma.review.deleteMany({ where: { productId: p.id } });
    const rng = rngFromId(p.id + ":reviews");
    const count = 5 + Math.floor(rng() * 6);
    const reviews = Array.from({ length: count }, () => {
      const daysAgo = Math.floor(rng() * 90);
      const createdAt = new Date(Date.now() - daysAgo * 86400_000);
      const tpl = pick(reviewPoolForCategory(p.category), rng);
      return {
        productId: p.id, authorName: pick(REVIEW_AUTHORS, rng),
        rating: tpl.rating, title: tpl.title, body: tpl.body,
        createdAt, synthetic: true, approved: true,
      };
    });
    await prisma.review.createMany({ data: reviews });
  }
```

Update imports at the top: `import { categories, catalogProducts } from "../app/_data/mock";` (drop `featuredProducts, dealsProducts`). Update the FORCE_SEED prune block to use `catalogProducts.map((p) => p.id)` instead of `all.map(...)`, and delete the now-unused `all`, `pickProductMain`, and legacy per-product `ProductImage` seeding. Update the final `console.log` counts (remove `productImage.count()`; optionally add `productVariant.count()`).

- [ ] **Step 2: Typecheck.** Run `npx tsc --noEmit`.
Expected: PASS.

- [ ] **Step 3: Run the full unit suite** to confirm nothing regressed.
Run: `npm run test`
Expected: PASS (seed is not unit-tested; this confirms the `variants.ts` tests and existing suite are green).

- [ ] **Step 4: Commit.**
```bash
git add app/_data/mock.ts prisma/seed.ts
git commit -m "feat(catalog): reseed catalog as products-with-color-variants"
```

---

## Phase 3 — Admin editor (variant CRUD, image sets, stock grid)

**Goal:** Admins create/edit a design with a repeatable color-variant editor — per-color swatch, SKU, price override, two image sets, and a size-stock grid. Server actions write the variant model in a transaction and back-fill the still-NOT-NULL legacy scalar columns from variant data. The product list shows color count + total stock. This phase only touches admin-scoped files, so no storefront types move.

### Task 3.1: Nested variant input schema + create/update actions

**Files:**
- Modify: `app/admin/products/actions.ts`

**Interfaces produced (consumed by `product-form.tsx` in Task 3.3):**
- `type VariantInput = { color; colorSlug; swatchHex?; sku?; price?; originalPrice?; cardImages: string[]; detailImages: string[]; sizeStocks: { size; stock }[] }`
- `type ProductInput = { name; slug?; categorySlug; price; originalPrice?; description; variants: VariantInput[] }`
- `createProduct(input: ProductInput)`, `updateProduct(id, input: ProductInput)` — unchanged signatures, new input shape.

- [ ] **Step 1: Replace `ProductInputSchema` and the `createProduct`/`updateProduct` bodies.** In `app/admin/products/actions.ts`:

Add `import type { Prisma } from "@prisma/client";` to the imports at the top of the file (used by `writeVariants` below). Then replace the `ProductInputSchema` block (lines 67–79) with the nested schema:
```ts
const VariantSizeInputSchema = z.object({
  size: z.string().trim().min(1),
  stock: z.number().int().min(0),
});

const VariantInputSchema = z.object({
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
  variants: z.array(VariantInputSchema).min(1, "Add at least one color variant"),
});
export type VariantInput = z.infer<typeof VariantInputSchema>;
export type ProductInput = z.infer<typeof ProductInputSchema>;

// Back-fill values for the legacy Product scalar columns (still NOT NULL until
// the Phase 7 contract migration). Derived from variant data; not read by the
// storefront after Phases 4–5 migrate.
function legacyScalars(d: ProductInput): { image: string; sizes: string; stock: number } {
  const first = d.variants[0];
  const image = first.cardImages[0];
  const sizes = Array.from(
    new Set(d.variants.flatMap((v) => v.sizeStocks.map((s) => s.size))),
  ).join(",");
  const stock = d.variants.reduce(
    (sum, v) => sum + v.sizeStocks.reduce((a, s) => a + s.stock, 0),
    0,
  );
  return { image, sizes, stock };
}

// Reject duplicate colorSlugs or duplicate non-empty SKUs within one product,
// so the DB unique constraints surface as a friendly message, not a 500.
function variantConflict(d: ProductInput): string | null {
  const slugs = new Set<string>();
  const skus = new Set<string>();
  for (const v of d.variants) {
    const cs = slugify(v.colorSlug || v.color);
    if (!cs) return "Each color needs a name";
    if (slugs.has(cs)) return `Duplicate color "${v.color}"`;
    slugs.add(cs);
    const sku = v.sku?.trim();
    if (sku) {
      if (skus.has(sku)) return `Duplicate SKU "${sku}"`;
      skus.add(sku);
    }
  }
  return null;
}

// Writes all variants for a product inside an open transaction (delete-and-
// recreate, mirroring the old gallery rebuild). Assumes the Product row exists.
async function writeVariants(
  tx: Prisma.TransactionClient,
  productId: string,
  variants: VariantInput[],
): Promise<void> {
  await tx.productVariant.deleteMany({ where: { productId } });
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const variant = await tx.productVariant.create({
      data: {
        productId,
        color: v.color,
        colorSlug: slugify(v.colorSlug || v.color),
        swatchHex: v.swatchHex?.trim() || null,
        sku: v.sku?.trim() || null,
        price: v.price ?? null,
        originalPrice: v.originalPrice ?? null,
        sortOrder: i,
        archived: false,
      },
    });
    await tx.variantImage.createMany({
      data: [
        ...v.cardImages.map((url, j) => ({ variantId: variant.id, url, role: "CARD", sortOrder: j })),
        ...v.detailImages.map((url, j) => ({ variantId: variant.id, url, role: "DETAIL", sortOrder: j })),
      ],
    });
    await tx.variantSizeStock.createMany({
      data: v.sizeStocks.map((s) => ({ variantId: variant.id, size: s.size, stock: s.stock })),
    });
  }
}
```

Replace `createProduct` (lines 81–115) with:
```ts
export async function createProduct(input: ProductInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Please complete all required fields." };
  const d = parsed.data;

  const conflict = variantConflict(d);
  if (conflict) return { success: false, error: conflict };

  const baseSlug = slugify(d.slug || d.name);
  if (!baseSlug) return { success: false, error: "Name must contain letters or numbers" };
  const slug = await uniqueSlug(
    baseSlug,
    async (s) => (await prisma.product.findUnique({ where: { id: s } })) !== null,
  );

  const legacy = legacyScalars(d);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.create({
        data: {
          id: slug, name: d.name, categorySlug: d.categorySlug,
          price: d.price, originalPrice: d.originalPrice ?? null,
          description: d.description, archived: false,
          image: legacy.image, stock: legacy.stock, sizes: legacy.sizes,
        },
      });
      await writeVariants(tx, slug, d.variants);
    });
  } catch {
    return { success: false, error: "Could not create product (check the category and that SKUs are unique)." };
  }
  revalidate(slug);
  return { success: true, slug };
}
```

Replace `updateProduct` (lines 117–194) with — same slug-rename machinery as today, swapping the gallery rebuild for `writeVariants`:
```ts
export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Please complete all required fields." };
  const d = parsed.data;

  const conflict = variantConflict(d);
  if (conflict) return { success: false, error: conflict };

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { success: false, error: "Product not found" };

  const candidateSlug = slugify(d.slug || d.name);
  if (!candidateSlug) return { success: false, error: "Name must contain letters or numbers" };
  const legacy = legacyScalars(d);

  // Field-only edit (slug unchanged): update scalars + rebuild variants.
  if (candidateSlug === id) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            name: d.name, categorySlug: d.categorySlug,
            price: d.price, originalPrice: d.originalPrice ?? null,
            description: d.description,
            image: legacy.image, stock: legacy.stock, sizes: legacy.sizes,
          },
        });
        await writeVariants(tx, id, d.variants);
      });
    } catch {
      return { success: false, error: "Could not save product (check the category and that SKUs are unique)." };
    }
    revalidate(id);
    return { success: true, slug: id };
  }

  // Rename branch: resolve a unique new slug, excluding this product.
  const newSlug = await uniqueSlug(
    candidateSlug,
    async (s) => (await prisma.product.findFirst({ where: { id: s, NOT: { id } } })) !== null,
  );
  try {
    await prisma.$transaction(async (tx) => {
      // ON UPDATE CASCADE moves child rows (variants/reviews/wishlist/order items) to newSlug.
      await tx.product.update({
        where: { id },
        data: {
          id: newSlug, name: d.name, categorySlug: d.categorySlug,
          price: d.price, originalPrice: d.originalPrice ?? null,
          description: d.description,
          image: legacy.image, stock: legacy.stock, sizes: legacy.sizes,
        },
      });
      await writeVariants(tx, newSlug, d.variants);
      await tx.productSlugHistory.upsert({
        where: { oldSlug: id },
        update: { currentId: newSlug },
        create: { oldSlug: id, currentId: newSlug },
      });
      await tx.productSlugHistory.deleteMany({ where: { oldSlug: newSlug } });
    });
  } catch {
    return { success: false, error: "Could not save product (check the category and that SKUs are unique)." };
  }
  revalidatePath(`/admin/products/${id}/edit`);
  revalidate(newSlug);
  return { success: true, slug: newSlug };
}
```

- [ ] **Step 2: Remove the now-dead `updateStock` action.** Stock is edited per-cell in the variant editor (Task 3.2), so delete the `updateStock` export (lines 19–29 in the original file). First confirm no other importer:

Run: `grep -rn "updateStock" app/ --include=*.tsx --include=*.ts`
Expected: only `stock-quick-edit.tsx` (removed in Task 3.4) references it. Delete the `updateStock` function; keep `archiveProduct`/`unarchiveProduct`/`deleteProduct`.

- [ ] **Step 3: Typecheck.** Run `npx tsc --noEmit`.
Expected: FAIL in `product-form.tsx` (still sends the old flat input) and `stock-quick-edit.tsx` (imports `updateStock`). Fixed in Tasks 3.3–3.4. Do not commit yet — commit at the end of the phase after the tree is green (Task 3.4).

### Task 3.2: Variant editor component

**Files:**
- Create: `app/_components/admin/products/variant-editor.tsx`

**Interfaces produced (consumed by `product-form.tsx`):**
- `type VariantDraft = { color: string; colorSlug: string; swatchHex: string; sku: string; price: string; originalPrice: string; cardImages: string[]; detailImages: string[]; sizeStocks: { size: string; stock: string }[] }`
- `function emptyVariant(): VariantDraft`
- `<VariantEditor value={VariantDraft[]} onChange={(v: VariantDraft[]) => void} />`

Fields are kept as strings (form inputs); the parent converts to numbers on submit. This mirrors the existing `product-form` pattern.

- [ ] **Step 1: Create `app/_components/admin/products/variant-editor.tsx`:**
```tsx
"use client";
import { slugify } from "@/app/_lib/product-helpers";
import { GalleryEditor } from "./gallery-editor";

export type VariantDraft = {
  color: string;
  colorSlug: string;
  swatchHex: string;
  sku: string;
  price: string;         // "" => no override
  originalPrice: string; // "" => no override
  cardImages: string[];
  detailImages: string[];
  sizeStocks: { size: string; stock: string }[];
};

const STD_SIZES = ["S", "M", "L", "XL"];

export function emptyVariant(): VariantDraft {
  return {
    color: "", colorSlug: "", swatchHex: "", sku: "", price: "", originalPrice: "",
    cardImages: [], detailImages: [],
    sizeStocks: STD_SIZES.map((size) => ({ size, stock: "0" })),
  };
}

export function VariantEditor({
  value,
  onChange,
}: {
  value: VariantDraft[];
  onChange: (v: VariantDraft[]) => void;
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
    const copy: VariantDraft = { ...src, color: "", colorSlug: "", sku: "",
      cardImages: [...src.cardImages], detailImages: [...src.detailImages],
      sizeStocks: src.sizeStocks.map((s) => ({ ...s })) };
    onChange([...value.slice(0, i + 1), copy, ...value.slice(i + 1)]);
  };

  const setSizeStock = (vi: number, si: number, stock: string) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.map((s, j) => (j === si ? { ...s, stock } : s)) });
  const addSize = (vi: number) =>
    update(vi, { sizeStocks: [...value[vi].sizeStocks, { size: "", stock: "0" }] });
  const setSizeName = (vi: number, si: number, size: string) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.map((s, j) => (j === si ? { ...s, size } : s)) });
  const removeSize = (vi: number, si: number) =>
    update(vi, { sizeStocks: value[vi].sizeStocks.filter((_, j) => j !== si) });

  return (
    <div className="space-y-4">
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
              <input value={v.color} onChange={(e) => update(i, { color: e.target.value, colorSlug: v.colorSlug || slugify(e.target.value) })} className="w-full rounded border px-2 py-1 text-sm" />
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
            <label className="mb-1 block text-xs text-muted-foreground">Size stock</label>
            <div className="space-y-1">
              {v.sizeStocks.map((s, si) => (
                <div key={si} className="flex items-center gap-2">
                  <input value={s.size} onChange={(e) => setSizeName(i, si, e.target.value)} placeholder="Size" className="w-20 rounded border px-2 py-1 text-sm" />
                  <input type="number" min={0} value={s.stock} onChange={(e) => setSizeStock(i, si, e.target.value)} className="w-24 rounded border px-2 py-1 text-sm" />
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

- [ ] **Step 2: Typecheck** (component compiles even though not yet imported). Run `npx tsc --noEmit`. Expected: same failures as Task 3.1 Step 3 (product-form/stock-quick-edit), plus none new from this file.

### Task 3.3: Rewrite `product-form.tsx` to use the variant editor

**Files:**
- Modify: `app/_components/admin/products/product-form.tsx`

**Interfaces:** consumes `VariantEditor`, `VariantDraft`, `emptyVariant` (Task 3.2) and the new `ProductInput` shape (Task 3.1).

- [ ] **Step 1: Rewrite the component.** Replace the whole file with:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct, archiveProduct, unarchiveProduct } from "@/app/admin/products/actions";
import { slugify } from "@/app/_lib/product-helpers";
import { CategorySelect } from "./category-select";
import { VariantEditor, emptyVariant, type VariantDraft } from "./variant-editor";

type Cat = { slug: string; name: string };
type Initial = {
  id?: string; name: string; categorySlug: string; price: string; originalPrice: string;
  description: string; archived: boolean; variants: VariantDraft[];
};

function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ProductForm({ mode, categories, initial }: { mode: "create" | "edit"; categories: Cat[]; initial: Initial }) {
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
      variants: f.variants.map((v) => ({
        color: v.color.trim(),
        colorSlug: v.colorSlug.trim(),
        swatchHex: v.swatchHex.trim() || null,
        sku: v.sku.trim() || null,
        price: toNum(v.price),
        originalPrice: toNum(v.originalPrice),
        cardImages: v.cardImages.map((u) => u.trim()).filter(Boolean),
        detailImages: v.detailImages.map((u) => u.trim()).filter(Boolean),
        sizeStocks: v.sizeStocks
          .map((s) => ({ size: s.size.trim(), stock: Math.max(0, Math.trunc(Number(s.stock) || 0)) }))
          .filter((s) => s.size),
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
          <VariantEditor value={f.variants} onChange={(v) => set("variants", v)} />
        </div>
      </div>
    </section>
  );
}

export { emptyVariant };
export type { VariantDraft };
```

- [ ] **Step 2: Typecheck.** Run `npx tsc --noEmit`. Expected: FAIL only in `edit/page.tsx` + `new/page.tsx` (still pass the old `Initial` shape) and `stock-quick-edit.tsx`. Fixed next.

### Task 3.4: Admin data-access, list table, edit/new pages, and test

**Files:**
- Modify: `app/_lib/admin-products.ts`, `app/_components/admin/products/products-table.tsx`, `app/admin/products/[id]/edit/page.tsx`, `app/admin/products/new/page.tsx`, `app/_lib/__tests__/admin-products.test.ts`
- Delete: `app/_components/admin/products/stock-quick-edit.tsx`

**Interfaces:** `getProduct(id)` now includes `variants` with `images` + `sizeStocks`; `buildProductWhere` low-stock queries variant cells; `listProducts` rows carry `variants[].sizeStocks[].stock` for the total.

- [ ] **Step 1: Update `app/_lib/admin-products.ts`.**

In `buildProductWhere`, replace the `low-stock` case (lines 20–23) so it queries the variant grid instead of the dropped-soon `Product.stock`:
```ts
    case "low-stock":
      where.archived = false;
      where.variants = { some: { sizeStocks: { some: { stock: { lte: LOW_STOCK_THRESHOLD } } } } };
      break;
```

In `listProducts`, change the `include` (lines 62–65) to carry variant stock + count and drop the image count:
```ts
      include: {
        category: { select: { name: true } },
        variants: { select: { sizeStocks: { select: { stock: true } } } },
        _count: { select: { variants: true } },
      },
```

In `getProduct`, replace the `include` (lines 76–79) so the edit form can hydrate variants:
```ts
    include: {
      category: true,
      variants: {
        orderBy: { sortOrder: "asc" },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          sizeStocks: { orderBy: { size: "asc" } },
        },
      },
    },
```

- [ ] **Step 2: Update `products-table.tsx`** to show color count + total stock (read-only) and drop the inline stock editor:
```tsx
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/app/_lib/format";
import { Badge } from "@/components/ui/badge";
import { DeleteProductButton } from "./delete-product-button";

type Row = {
  id: string; name: string; price: number; originalPrice: number | null;
  image: string; archived: boolean;
  category: { name: string } | null;
  variants: { sizeStocks: { stock: number }[] }[];
  _count: { variants: number };
};

function totalStock(row: Row): number {
  return row.variants.reduce((sum, v) => sum + v.sizeStocks.reduce((a, s) => a + s.stock, 0), 0);
}

export function ProductsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No products match this view.</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2"></th><th className="p-2">Name</th><th className="p-2">Category</th>
          <th className="p-2">Price</th><th className="p-2">Colors</th><th className="p-2">Total stock</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className={"border-b hover:bg-secondary/40 " + (p.archived ? "opacity-60" : "")}>
            <td className="p-2"><Image src={p.image} alt="" width={36} height={36} className="rounded object-cover" /></td>
            <td className="p-2 font-medium">
              <Link href={`/admin/products/${p.id}/edit`} className="hover:underline">{p.name}</Link>
              <br /><span className="text-muted-foreground">{p.id}</span>
            </td>
            <td className="p-2">{p.category?.name ?? "—"}</td>
            <td className="p-2 font-medium">{formatPrice(p.price)}{p.originalPrice ? <span className="ml-1 text-xs text-muted-foreground line-through">{formatPrice(p.originalPrice)}</span> : null}</td>
            <td className="p-2">{p._count.variants}</td>
            <td className="p-2 tabular-nums">{totalStock(p)}</td>
            <td className="p-2"><Badge variant={p.archived ? "outline" : "secondary"}>{p.archived ? "Archived" : "Active"}</Badge></td>
            <td className="p-2 text-right"><DeleteProductButton id={p.id} name={p.name} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```
Then delete `app/_components/admin/products/stock-quick-edit.tsx`.

- [ ] **Step 3: Update the edit + new pages** to build the new `Initial` shape.

`app/admin/products/[id]/edit/page.tsx` — replace the `initial` object:
```tsx
  return (
    <ProductForm mode="edit" categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      initial={{
        id: product.id, name: product.name, categorySlug: product.categorySlug,
        price: String(product.price),
        originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
        description: product.description, archived: product.archived,
        variants: product.variants.map((v) => ({
          color: v.color, colorSlug: v.colorSlug, swatchHex: v.swatchHex ?? "",
          sku: v.sku ?? "",
          price: v.price != null ? String(v.price) : "",
          originalPrice: v.originalPrice != null ? String(v.originalPrice) : "",
          cardImages: v.images.filter((im) => im.role === "CARD").map((im) => im.url),
          detailImages: v.images.filter((im) => im.role === "DETAIL").map((im) => im.url),
          sizeStocks: v.sizeStocks.map((s) => ({ size: s.size, stock: String(s.stock) })),
        })),
      }} />
  );
```

`app/admin/products/new/page.tsx` — seed one empty variant:
```tsx
import { listCategories } from "@/app/_lib/admin-products";
import { ProductForm } from "@/app/_components/admin/products/product-form";
import { emptyVariant } from "@/app/_components/admin/products/variant-editor";

export default async function NewProductPage() {
  const categories = await listCategories();
  return (
    <ProductForm mode="create" categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      initial={{ name: "", categorySlug: "", price: "", originalPrice: "", description: "", archived: false, variants: [emptyVariant()] }} />
  );
}
```

- [ ] **Step 4: Update the failing `buildProductWhere` test.** In `app/_lib/__tests__/admin-products.test.ts`, replace the low-stock assertion (lines 38–40):
```ts
  it("low-stock tab → archived:false + any variant size cell at/below threshold", () => {
    expect(buildProductWhere({ tab: "low-stock" })).toEqual({
      archived: false,
      variants: { some: { sizeStocks: { some: { stock: { lte: 5 } } } } },
    });
  });
```

- [ ] **Step 5: Typecheck + test.**
Run: `npx tsc --noEmit` → Expected: PASS.
Run: `npm run test` → Expected: PASS (updated `buildProductWhere` test green).

- [ ] **Step 6: Commit the whole admin phase.**
```bash
git add app/admin/products app/_components/admin/products app/_lib/admin-products.ts app/_lib/__tests__/admin-products.test.ts
git rm app/_components/admin/products/stock-quick-edit.tsx
git commit -m "feat(admin): color-variant editor with two image sets and size-stock grid"
```

---

## Phase 4 — PDP: detail read reshape + variant selection UI + `?color=`

**Goal:** One PDP per design. Selecting a color updates the gallery (DETAIL images), price, SKU, per-size availability, and the `?color=` URL — via shallow routing, with the URL as the shared source of truth between the (client) gallery and (client) buy box. The `getProductDetail` type reshapes *together with its only consumers* (this page + gallery + buy box). Add-to-cart stays color-blind here (closed in Phase 6).

**Transitional note:** in this phase the buy box's `addItem(...)` call keeps the current payload (`{ productId, name, price, image, size }`) — it uses the *selected variant's* price/image but the cart key is still `productId::size`. Phase 6 adds `variantId`/`color` to that same call. Nothing here is thrown away.

### Task 4.1: Reshape `getProductDetail` to return variants

**Files:**
- Modify: `app/_lib/products.ts`

**Interfaces produced (consumed by the PDP page, gallery, buy box):**
- `type VariantDetail = { id: string; color: string; colorSlug: string; swatchHex: string | null; sku: string | null; price: number; originalPrice: number | null; detailImages: string[]; sizeStocks: { size: string; stock: number }[] }`
- `type ProductDetail = { product: Product & { category: Category }; variants: VariantDetail[]; ratingAvg: number; ratingCount: number; related: ProductView[] }` — note `product.images` is no longer included.

- [ ] **Step 1: Update imports and the `ProductDetail` type + `getProductDetail`.** In `app/_lib/products.ts`:

Change the type import (line 5) — drop `ProductImage`, add nothing (Category/Product/Review stay):
```ts
import type { Category, Prisma, Product, Review } from "@prisma/client";
```
Add near the other imports:
```ts
import { effectivePrice, effectiveOriginalPrice } from "@/app/_lib/variants";
```

Replace the `ProductDetail` type (lines 128–133) and `getProductDetail` (lines 135–174) with:
```ts
export type VariantDetail = {
  id: string;
  color: string;
  colorSlug: string;
  swatchHex: string | null;
  sku: string | null;
  price: number;                       // effective
  originalPrice: number | null;        // effective
  detailImages: string[];              // sorted DETAIL urls
  sizeStocks: { size: string; stock: number }[];
};

export type ProductDetail = {
  product: Product & { category: Category };
  variants: VariantDetail[];
  ratingAvg: number;
  ratingCount: number;
  related: ProductView[];
};

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

    const variants: VariantDetail[] = product.variants.map((v) => ({
      id: v.id,
      color: v.color,
      colorSlug: v.colorSlug,
      swatchHex: v.swatchHex,
      sku: v.sku,
      price: effectivePrice(v, product),
      originalPrice: effectiveOriginalPrice(v, product),
      detailImages: v.images.map((im) => im.url),
      sizeStocks: v.sizeStocks.map((s) => ({ size: s.size, stock: s.stock })),
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
        select: {
          id: true, name: true, price: true, originalPrice: true,
          image: true, categorySlug: true, sizes: true,
        },
      }),
    ]);

    // `product` still carries a variants relation; strip it from the returned
    // shape so the type stays Product & { category }.
    const { variants: _drop, ...productScalars } = product;
    void _drop;

    return {
      product: productScalars,
      variants,
      ratingAvg: agg._avg.rating ?? 0,
      ratingCount: agg._count._all,
      related: await attachAggregates(relatedRows),
    };
  },
  ["product-detail"],
  { tags: ["catalog", "product"], revalidate: 300 }
);
```

Note: `related` still uses the legacy `ProductView` shape (image/sizes) — the list `ProductView` reshapes in Phase 5, and `RelatedStrip` migrates then. Do not touch it here.

- [ ] **Step 2: Typecheck.** Run `npx tsc --noEmit`.
Expected: FAIL only in `app/products/[id]/page.tsx` (uses `detail.product.images` and the old `BuyBoxClient`/`ImageGallery` props). Fixed in Tasks 4.3–4.4.

### Task 4.2: Shared color-swatch component

**Files:**
- Create: `app/_components/product/color-swatches.tsx`

**Interfaces produced (consumed by buy box in 4.4 and the product card in Phase 5):**
- `type SwatchOption = { colorSlug: string; color: string; swatchHex: string | null; image: string }`
- `<ColorSwatches options={SwatchOption[]} selected={string} onSelect={(slug: string) => void} className? />`

- [ ] **Step 1: Create `app/_components/product/color-swatches.tsx`:**
```tsx
"use client";
import Image from "next/image";

export type SwatchOption = {
  colorSlug: string;
  color: string;
  swatchHex: string | null;
  image: string;
};

export function ColorSwatches({
  options,
  selected,
  onSelect,
  className = "",
}: {
  options: SwatchOption[];
  selected: string;
  onSelect: (slug: string) => void;
  className?: string;
}) {
  if (options.length <= 1) return null;
  return (
    <div className={"flex flex-wrap items-center gap-2 " + className} role="group" aria-label="Colors">
      {options.map((o) => {
        const active = o.colorSlug === selected;
        return (
          <button
            key={o.colorSlug}
            type="button"
            onClick={() => onSelect(o.colorSlug)}
            aria-pressed={active}
            aria-label={o.color}
            title={o.color}
            className={
              "relative h-8 w-8 overflow-hidden rounded-full border transition-[box-shadow,transform] duration-(--duration-fast) " +
              (active ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:scale-105 border-border")
            }
            style={o.swatchHex ? { backgroundColor: o.swatchHex } : undefined}
          >
            {!o.swatchHex && (
              <Image src={o.image} alt="" fill sizes="32px" className="object-cover" />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit the read-layer + swatch scaffolding so far** (tree not green yet; commit at end of phase). Skip — proceed to 4.3.

### Task 4.3: Variant-aware image gallery

**Files:**
- Modify: `app/_components/product/image-gallery.tsx`

**Interfaces:** consumes `?color=` (URL) and a per-variant image map.
- `<ImageGallery variants={{ colorSlug: string; detailImages: string[] }[]} defaultColorSlug={string} productName={string} fallbackImage={string} />`

- [ ] **Step 1: Rewrite `app/_components/product/image-gallery.tsx`:**
```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

type GalleryVariant = { colorSlug: string; detailImages: string[] };

type Props = {
  variants: GalleryVariant[];
  defaultColorSlug: string;
  productName: string;
  fallbackImage: string;
};

export function ImageGallery({ variants, defaultColorSlug, productName, fallbackImage }: Props) {
  const colorParam = useSearchParams().get("color");
  const active =
    variants.find((v) => v.colorSlug === colorParam) ??
    variants.find((v) => v.colorSlug === defaultColorSlug) ??
    variants[0];
  const activeSlug = active?.colorSlug ?? "none";
  const sources = active && active.detailImages.length > 0 ? active.detailImages : [fallbackImage];

  const [selected, setSelected] = useState(0);
  // Reset to the first image whenever the selected color changes.
  useEffect(() => { setSelected(0); }, [activeSlug]);
  const current = sources[Math.min(selected, sources.length - 1)];

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
        <Image
          key={activeSlug}
          src={current}
          alt={productName}
          fill
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover animate-in fade-in duration-(--duration-fast)"
          priority
        />
      </div>
      {sources.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {sources.map((src, i) => {
            const isActive = i === selected;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={isActive ? "true" : "false"}
                className={
                  "relative aspect-square overflow-hidden rounded-md border bg-muted transition-opacity duration-(--duration-fast) " +
                  (isActive ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:opacity-90")
                }
              >
                <Image src={src} alt="" fill sizes="(min-width: 1024px) 15vw, 25vw" className="object-cover" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

### Task 4.4: Variant-aware buy box

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx`

**Interfaces:** consumes `VariantDetail` (4.1), `ColorSwatches` (4.2), the variant helpers, and writes `?color=`.
- `<BuyBoxClient productId name variants={VariantDetail[]} defaultColorSlug ratingAvg ratingCount shareUrl />`

- [ ] **Step 1: Rewrite `app/_components/product/buy-box-client.tsx`.** This is a data-shape rewrite (price/stock/size/image now derive from the selected variant), so replace the whole file:
```tsx
// app/_components/product/buy-box-client.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Heart, Star, Loader2, Truck, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "@/app/_components/cart/add-to-cart-button";
import { SizeChartDialog } from "@/app/_components/product/size-chart-dialog";
import { StockIndicator } from "@/app/_components/shared/stock-indicator";
import { InstallmentNote } from "@/app/_components/shared/installment-note";
import { ColorSwatches, type SwatchOption } from "@/app/_components/product/color-swatches";
import { useWishlist } from "@/app/_lib/wishlist-context";
import { formatPrice } from "@/app/_lib/format";
import { useDeliveryConfig } from "@/app/_components/delivery/delivery-config-provider";
import { trackViewContent, trackAddToCart } from "@/app/_lib/meta-pixel";
import { useCart } from "@/app/_lib/cart-context";
import { ShareButtons } from "@/app/_components/product/share-buttons";
import { variantInStock, availableSizes, stockForSize } from "@/app/_lib/variants";

export type VariantDetail = {
  id: string;
  color: string;
  colorSlug: string;
  swatchHex: string | null;
  sku: string | null;
  price: number;
  originalPrice: number | null;
  detailImages: string[];
  sizeStocks: { size: string; stock: number }[];
};

type Props = {
  productId: string;
  name: string;
  variants: VariantDetail[];
  defaultColorSlug: string;
  ratingAvg: number;
  ratingCount: number;
  shareUrl: string;
};

function discountPct(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

export function BuyBoxClient({
  productId, name, variants, defaultColorSlug, ratingAvg, ratingCount, shareUrl,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { addItem } = useCart();
  const { freeThreshold: FREE_DELIVERY_THRESHOLD } = useDeliveryConfig();
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlist();
  const wishlisted = isWishlisted(productId);

  const colorParam = searchParams.get("color");
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
  const inStock = variantInStock(selectedVariant.sizeStocks);
  const sizeList = selectedVariant.sizeStocks.map((s) => s.size);
  const inStockSizes = new Set(availableSizes(selectedVariant.sizeStocks));
  const sizeStock = selectedSize ? stockForSize(selectedVariant.sizeStocks, selectedSize) : 0;
  const qtyMax = Math.min(selectedSize ? sizeStock : 10, 10);

  const onSale = originalPrice != null && originalPrice > price;
  const pct = onSale ? discountPct(price, originalPrice as number) : 0;
  const fromPath = `/products/${productId}`;

  useEffect(() => { trackViewContent(productId, price); }, [productId, price]);

  useEffect(() => {
    if (!inStock) return;
    document.body.setAttribute("data-mobile-cta", "");
    return () => document.body.removeAttribute("data-mobile-cta");
  }, [inStock]);

  function selectColor(slug: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("color", slug);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const swatchOptions: SwatchOption[] = variants.map((v) => ({
    colorSlug: v.colorSlug, color: v.color, swatchHex: v.swatchHex,
    image: v.detailImages[0] ?? "",
  }));

  function nudgeSizePicker() {
    const el = document.getElementById("size-picker");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute("data-attention", "true");
    setTimeout(() => el.removeAttribute("data-attention"), 2000);
  }

  function handleBuyNow() {
    if (sizeList.length > 0 && !selectedSize) { nudgeSizePicker(); return; }
    setIsBuying(true);
    // Phase 6 adds variantId/color to this payload; for now it uses the current
    // color-blind cart signature (productId::size).
    addItem({ productId, name, price, image, size: selectedSize || null }, quantity);
    trackAddToCart(productId, price * quantity, quantity);
    router.push("/checkout");
  }

  return (
    <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>

      <a
        href="#reviews"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground"
        aria-label={`${ratingAvg.toFixed(1)} out of 5 stars, ${ratingCount} reviews`}
      >
        <Star className="h-4 w-4 fill-amber-400 stroke-amber-400" aria-hidden />
        <span className="font-medium text-foreground">{ratingAvg.toFixed(1)}</span>
        <span>({ratingCount.toLocaleString()})</span>
      </a>

      <div className="flex items-baseline gap-3">
        <span className={"font-heading text-2xl font-semibold " + (onSale ? "text-brand" : "")}>{formatPrice(price)}</span>
        {onSale && (
          <>
            <span className="text-base text-muted-foreground line-through">{formatPrice(originalPrice as number)}</span>
            <Badge variant="brand">-{pct}%</Badge>
          </>
        )}
      </div>
      <InstallmentNote total={price} />

      {/* Color selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Color:</span>
          <span className="text-muted-foreground">{selectedVariant.color}</span>
          {selectedVariant.sku && <span className="ml-auto text-xs text-muted-foreground">SKU {selectedVariant.sku}</span>}
        </div>
        <ColorSwatches options={swatchOptions} selected={selectedVariant.colorSlug} onSelect={selectColor} />
      </div>

      <div><StockIndicator stock={inStock ? Math.max(1, sizeStock || 1) : 0} /></div>

      {/* Size Selection */}
      {sizeList.length > 0 && (
        <div id="size-picker" className="space-y-2 rounded-md transition-shadow data-[attention=true]:ring-2 data-[attention=true]:ring-ring data-[attention=true]:ring-offset-2 data-[attention=true]:ring-offset-background">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Size:</span>
            <span className="text-sm text-muted-foreground">{selectedSize || "Select a size"}</span>
            <SizeChartDialog />
          </div>
          <div className="flex flex-wrap gap-2">
            {sizeList.map((size) => {
              const isSelected = selectedSize === size;
              const disabled = !inStockSizes.has(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => !disabled && setSelectedSize(size)}
                  aria-pressed={isSelected}
                  disabled={disabled}
                  className={
                    "min-w-[48px] rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors duration-(--duration-fast) " +
                    (disabled ? "cursor-not-allowed opacity-40 line-through" :
                      isSelected ? "border-ring bg-muted ring-2 ring-ring" : "border-border hover:border-foreground/40")
                  }
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {inStock && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Quantity</span>
          <div className="inline-flex items-center rounded-md border border-border">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Decrease quantity" className="px-3 py-2 text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40">−</button>
            <span className="min-w-[2.5rem] border-x border-border px-2 py-2 text-center text-sm tabular-nums">{quantity}</span>
            <button type="button" onClick={() => setQuantity((q) => Math.min(qtyMax, q + 1))} disabled={quantity >= qtyMax} aria-label="Increase quantity" className="px-3 py-2 text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40">+</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-stretch gap-2">
          <AddToCartButton
            productId={productId}
            name={name}
            price={price}
            image={image}
            size={selectedSize || null}
            quantity={quantity}
            requiresSize={true}
            disabled={!inStock}
            className="h-12 flex-1"
          />
          <Button type="button" variant="outline" size="icon" className="h-12 w-12"
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={wishlisted}
            onClick={() => toggleWishlist(productId, fromPath)}>
            <Heart className={"h-5 w-5 " + (wishlisted ? "fill-current text-brand" : "")} />
          </Button>
        </div>
        {inStock && (
          <Button onClick={handleBuyNow} disabled={isBuying} variant="outline" className="h-12 w-full">
            {isBuying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Buy Now
          </Button>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><Truck className="h-4 w-4" aria-hidden /> {FREE_DELIVERY_THRESHOLD > 0 ? `Free shipping over ${formatPrice(FREE_DELIVERY_THRESHOLD)}` : "Free shipping for all products"}</li>
        <li className="flex items-center gap-1.5"><RotateCcw className="h-4 w-4" aria-hidden /> Free 14-day returns</li>
        <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" aria-hidden /> Secure checkout</li>
      </ul>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Share</p>
        <ShareButtons url={shareUrl} name={name} price={price} />
      </div>

      {inStock && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <div className="min-w-0 shrink">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className={"font-heading text-base font-semibold " + (onSale ? "text-brand" : "")}>{formatPrice(price)}</p>
            </div>
            <div className="ml-auto shrink-0">
              {sizeList.length > 0 && !selectedSize ? (
                <Button className="h-12 px-6" onClick={nudgeSizePicker}>Add to cart</Button>
              ) : (
                <AddToCartButton productId={productId} name={name} price={price} image={image} size={selectedSize || null} quantity={quantity} requiresSize={true} disabled={!inStock} className="h-12 px-6" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

Note: `StockIndicator` still takes a numeric `stock`; we feed it the selected size's count (or a positive sentinel when in stock but no size chosen) to preserve its low-stock/in-stock display without changing that shared component.

### Task 4.5: Wire the PDP page to variants

**Files:**
- Modify: `app/products/[id]/page.tsx`

**Interfaces:** consumes reshaped `getProductDetail`, the new `ImageGallery` + `BuyBoxClient` props.

- [ ] **Step 1: Update the product page.** In `app/products/[id]/page.tsx`, replace the `<ImageGallery>` + `<BuyBoxClient>` block (lines 111–127) with:
```tsx
            <ImageGallery
              variants={detail.variants.map((v) => ({ colorSlug: v.colorSlug, detailImages: v.detailImages }))}
              defaultColorSlug={detail.variants[0].colorSlug}
              productName={detail.product.name}
              fallbackImage={detail.product.image}
            />
            <BuyBoxClient
              productId={detail.product.id}
              name={detail.product.name}
              variants={detail.variants}
              defaultColorSlug={detail.variants[0].colorSlug}
              ratingAvg={detail.ratingAvg}
              ratingCount={detail.ratingCount}
              shareUrl={absoluteUrl(`/products/${detail.product.id}`)}
            />
```
`generateMetadata` and `ProductJsonLd` still read `detail.product.image`/`price`/`stock` (legacy columns, still present) — leave them for Phase 7.

- [ ] **Step 2: Typecheck + test.**
Run: `npx tsc --noEmit` → Expected: PASS.
Run: `npm run test` → Expected: PASS (no unit tests target these components; existing suite stays green).

- [ ] **Step 3: Commit.**
```bash
git add app/_lib/products.ts app/products/[id]/page.tsx app/_components/product/image-gallery.tsx app/_components/product/buy-box-client.tsx app/_components/product/color-swatches.tsx
git commit -m "feat(catalog): variant-aware PDP with color swatches, per-color gallery/stock, and ?color= routing"
```

---

## Phase 5 — List `ProductView` reshape + product card + all list consumers

**Goal:** The list-facing `ProductView` becomes variant-carrying, the product card gains swatches + a per-color card-image swap, and **every** card consumer (home grid, deals, category, search, wishlist, related) migrates in this one phase — because a shared TS type can't be split across a phase boundary. Add-to-cart stays color-blind (closed in Phase 6).

### Task 5.1: Reshape the list reads in `app/_lib/products.ts`

**Files:**
- Modify: `app/_lib/products.ts`

**Interfaces produced (consumed by the card + all list pages):**
- `type ProductCardVariant = { colorSlug: string; color: string; swatchHex: string | null; price: number; originalPrice: number | null; cardImages: string[]; sizes: string[] }`
- `type ProductView = { id: string; name: string; rating: number; reviewCount: number; category: string; defaultColorSlug: string; variants: ProductCardVariant[] }`
- `getWishlistProductCards(productIds: string[]): Promise<ProductView[]>`

- [ ] **Step 1: Update the import for the variant helpers** (Phase 4 added `effectivePrice`/`effectiveOriginalPrice`; add `availableSizes`):
```ts
import { effectivePrice, effectiveOriginalPrice, availableSizes } from "@/app/_lib/variants";
```

- [ ] **Step 2: Replace the `ProductView` type + `ProductRow` type + `attachAggregates`** (lines 7–61) with the variant-carrying versions and a shared `cardSelect`:
```ts
export type ProductCardVariant = {
  colorSlug: string;
  color: string;
  swatchHex: string | null;
  price: number;               // effective
  originalPrice: number | null;
  cardImages: string[];        // sorted CARD urls
  sizes: string[];             // in-stock sizes for this color
};

export type ProductView = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  category: string;
  defaultColorSlug: string;
  variants: ProductCardVariant[];
};

export type CategoryView = {
  slug: string;
  name: string;
  image: string;
};

// Shared select for every product-card list read. `satisfies` keeps the literal
// types so `ProductGetPayload` below infers the exact row shape.
const cardSelect = {
  id: true, name: true, price: true, originalPrice: true, categorySlug: true,
  variants: {
    where: { archived: false },
    orderBy: { sortOrder: "asc" },
    select: {
      colorSlug: true, color: true, swatchHex: true, price: true, originalPrice: true, sortOrder: true,
      images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, select: { url: true } },
      sizeStocks: { select: { size: true, stock: true } },
    },
  },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

async function attachAggregates(rows: ProductRow[]): Promise<ProductView[]> {
  // A design with no active variants can't be carded; drop it.
  const usable = rows.filter((r) => r.variants.length > 0);
  if (usable.length === 0) return [];
  const ids = usable.map((r) => r.id);
  const grouped = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: ids }, approved: true },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const map = new Map(
    grouped.map((g) => [g.productId, { avg: g._avg.rating ?? 0, count: g._count._all }]),
  );
  return usable.map((p) => {
    const agg = map.get(p.id) ?? { avg: 0, count: 0 };
    const variants: ProductCardVariant[] = p.variants.map((v) => ({
      colorSlug: v.colorSlug,
      color: v.color,
      swatchHex: v.swatchHex,
      price: effectivePrice(v, p),
      originalPrice: effectiveOriginalPrice(v, p),
      cardImages: v.images.map((im) => im.url),
      sizes: availableSizes(v.sizeStocks),
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

- [ ] **Step 3: Point every list query at `cardSelect`.** In `getFeaturedProducts`, `getDealsProducts`, `getProductById`, `searchProducts`, and `getProductDetail`'s `relatedRows`, replace each occurrence of:
```ts
      select: {
        id: true, name: true, price: true, originalPrice: true,
        image: true, categorySlug: true, sizes: true,
      },
```
with:
```ts
      select: cardSelect,
```
(In `getProductById` the wrapping call `await attachAggregates([row])` is unchanged; `row` is now a `ProductRow`.)

- [ ] **Step 4: Update `getProducts`** — the same `select: cardSelect` swap (lines 303–306), plus change the in-stock filter (lines 273–276) from the soon-dropped `Product.stock` to the variant grid:
```ts
  // In stock only filter
  if (inStockOnly) {
    where.variants = { some: { sizeStocks: { some: { stock: { gt: 0 } } } } };
  }
```
Leave `minPrice`/`maxPrice`/`sortBy` on `Product.price` (the base price). Add a one-line comment noting this filters on base price, not per-variant overrides (acceptable; a future improvement).

- [ ] **Step 5: Add the wishlist card helper** at the end of the file:
```ts
// Wishlist renders ProductCards for a set of product ids; reuse the same
// card projection + rating aggregation as every other list.
export async function getWishlistProductCards(productIds: string[]): Promise<ProductView[]> {
  if (productIds.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: productIds }, archived: false },
    select: cardSelect,
  });
  return attachAggregates(rows);
}
```

- [ ] **Step 6: Typecheck.** Run `npx tsc --noEmit`.
Expected: FAIL in `product-card.tsx` + the six consumers (old prop shape). Fixed next.

### Task 5.2: Rewrite the product card (client leaf with swatches + per-color image)

**Files:**
- Modify: `app/_components/home/product-card.tsx`

**Interfaces:** consumes `ProductView` (5.1) + `ColorSwatches` (4.2). New prop shape:
- `<ProductCard product={ProductView} fromPath?={string} showEyebrow?={boolean} />`

- [ ] **Step 1: Replace `app/_components/home/product-card.tsx`** (it becomes a client component owning the selected color, since color drives the image, price, and cart target):
```tsx
// app/_components/home/product-card.tsx
"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { AddToCartDialog } from "@/app/_components/cart/add-to-cart-dialog";
import { WishlistHeart } from "@/app/_components/wishlist/wishlist-heart";
import { ColorSwatches } from "@/app/_components/product/color-swatches";
import { prettifyCategory } from "@/app/_lib/category-label";
import { discountPct } from "@/app/_lib/pricing";
import { Eyebrow } from "@/app/_components/ui/eyebrow";
import { Price } from "@/app/_components/ui/price";
import { Rating } from "@/app/_components/ui/rating";
import { SaleBadge } from "@/app/_components/ui/sale-badge";
import type { ProductView } from "@/app/_lib/products";

export function ProductCard({
  product,
  fromPath = "/",
  showEyebrow = false,
}: {
  product: ProductView;
  fromPath?: string;
  showEyebrow?: boolean;
}) {
  const { id, name, rating, reviewCount, category, variants, defaultColorSlug } = product;
  const [selectedColor, setSelectedColor] = useState(defaultColorSlug);
  const variant = variants.find((v) => v.colorSlug === selectedColor) ?? variants[0];

  const price = variant.price;
  const originalPrice = variant.originalPrice;
  const onSale = originalPrice != null && originalPrice > price;
  const pct = onSale ? discountPct(price, originalPrice) : 0;
  const image = variant.cardImages[0] ?? "";
  const href = `/products/${id}?color=${selectedColor}`;
  const swatchOptions = variants.map((v) => ({
    colorSlug: v.colorSlug, color: v.color, swatchHex: v.swatchHex, image: v.cardImages[0] ?? "",
  }));

  return (
    <Card className="group overflow-hidden p-0">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {onSale && <SaleBadge pct={pct} className="absolute left-3 top-3 z-10" />}
        <Link href={href} aria-label={name} className="absolute inset-0">
          <Image
            key={selectedColor}
            src={image}
            alt={name}
            fill
            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
            className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105 animate-in fade-in duration-(--duration-fast)"
          />
        </Link>
        <div className="absolute right-2 top-2 z-10">
          <WishlistHeart productId={id} fromPath={fromPath} />
        </div>
      </div>
      <CardContent className="flex flex-col gap-1.5 p-4">
        {showEyebrow && category && <Eyebrow>{prettifyCategory(category)}</Eyebrow>}
        <h3 className="font-heading line-clamp-2 min-h-[2.75rem] text-base font-medium leading-snug">
          <Link href={href} className="hover:underline underline-offset-4">{name}</Link>
        </h3>
        <Rating rating={rating} reviewCount={reviewCount} />
        <ColorSwatches options={swatchOptions} selected={selectedColor} onSelect={setSelectedColor} />
        <Price price={price} originalPrice={originalPrice} />
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <div className="flex w-full flex-col gap-2">
          <AddToCartDialog
            productId={id}
            name={name}
            price={price}
            image={image}
            sizes={variant.sizes.join(",")}
            triggerVariant="default"
            triggerClassName="w-full min-w-0 whitespace-nowrap"
          />
          <Link
            href={`/products/${id}?action=buy-now&color=${selectedColor}`}
            aria-label={`Buy ${name} now`}
            className={buttonVariants({ size: "sm", variant: "outline", className: "w-full min-w-0 whitespace-nowrap" })}
          >
            <Zap className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">Buy it now</span>
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
```
The old `ProductCardProps` export is removed. Confirm nothing imports it:
Run: `grep -rn "ProductCardProps" app/`
Expected: no matches after this edit.

**Scope note:** the card renders each color's *first* CARD image and swaps it (with a fade) when a swatch is chosen — this delivers the headline "click a swatch → the card image updates without reload" behavior. A within-a-single-color multi-image slider (dots/auto-advance over `variant.cardImages[1..n]`) is intentionally deferred; `cardImages` already carries the full set, so it can be added later without a data change.

### Task 5.3: Update the six card consumers

**Files:**
- Modify: `app/_components/home/product-grid.tsx`, `app/_components/home/deals-section.tsx`, `app/categories/[slug]/page.tsx`, `app/search/page.tsx`, `app/wishlist/page.tsx`, `app/_components/product/related-strip.tsx`

- [ ] **Step 1: `product-grid.tsx`** — replace the `<ProductCard .../>` (lines 16–29) with:
```tsx
        {products.map((p) => (
          <ProductCard key={p.id} product={p} fromPath="/" showEyebrow />
        ))}
```

- [ ] **Step 2: `deals-section.tsx`** — replace its `<ProductCard .../>` (lines 20–32) with:
```tsx
          {products.map((p) => (
            <ProductCard key={p.id} product={p} fromPath="/" />
          ))}
```

- [ ] **Step 3: `categories/[slug]/page.tsx`** — replace the `<ProductCard .../>` (lines 130–133) with:
```tsx
                  {paginatedProducts.map((product) => (
                    <ProductCard key={product.id} product={product} fromPath={`/categories/${slug}`} />
                  ))}
```

- [ ] **Step 4: `search/page.tsx`** — replace the `<ProductCard .../>` (lines 216–227) with:
```tsx
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} fromPath="/search" />
                ))}
```

- [ ] **Step 5: `related-strip.tsx`** — replace the `<ProductCard .../>` (lines 18–29) with:
```tsx
        {products.map((p) => (
          <ProductCard key={p.id} product={p} fromPath={fromPath} />
        ))}
```

- [ ] **Step 6: `wishlist/page.tsx`** — replace the inline review groupBy + card mapping with the shared helper. Replace the whole body from the `wishlistItem.findMany` through the closing `</>`:
```tsx
  const items = await prisma.wishlistItem.findMany({
    where: { userId: session.user.id, product: { archived: false } },
    select: { id: true, productId: true },
    orderBy: { createdAt: "desc" },
  });

  const cards = await getWishlistProductCards(items.map((it) => it.productId));
  // Preserve wishlist order (getWishlistProductCards returns unordered).
  const byId = new Map(cards.map((c) => [c.id, c]));
  const ordered = items.map((it) => byId.get(it.productId)).filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your wishlist</h1>
          {ordered.length === 0 ? (
            <div className="rounded border p-10 text-center">
              <h2 className="text-lg font-medium">Your wishlist is empty</h2>
              <p className="mt-2 text-sm text-muted-foreground">Tap the heart on any product to save it for later.</p>
              <Link href="/" className={buttonVariants({ className: "mt-4" })}>Continue shopping</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((card) => (
                <ProductCard key={card.id} product={card} fromPath="/wishlist" />
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
```
Update the imports at the top of `wishlist/page.tsx`: `prisma` stays (still used for the item query); add `import { getWishlistProductCards } from "@/app/_lib/products";`.

- [ ] **Step 7: `categories/page.tsx`** — replace the `<ProductCard .../>` (lines 174–187) with:
```tsx
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} fromPath="/categories" />
                ))}
```
(The sidebar category counts use `p.category`, which still exists on `ProductView` — no other change needed.)

- [ ] **Step 8: `deals/page.tsx`** — this page reads `p.price`/`p.originalPrice`, which no longer exist on `ProductView`; derive them from the default variant. Add a helper above the component:
```tsx
import type { ProductView } from "@/app/_lib/products";

function defaultVariantOf(p: ProductView) {
  return p.variants.find((v) => v.colorSlug === p.defaultColorSlug) ?? p.variants[0];
}
```
Replace the deals filter + discount sort (lines 50–57):
```tsx
  const dealsProducts = allProducts.filter((p) => defaultVariantOf(p).originalPrice !== null);
  if (sortBy === "discount") {
    dealsProducts.sort((a, b) => {
      const va = defaultVariantOf(a), vb = defaultVariantOf(b);
      const da = va.originalPrice ? (va.originalPrice - va.price) / va.originalPrice : 0;
      const db = vb.originalPrice ? (vb.originalPrice - vb.price) / vb.originalPrice : 0;
      return db - da;
    });
  }
```
Replace the `maxDiscount` reduce (lines 104–110) to use the default variant:
```tsx
                  const maxDiscount = dealsProducts.reduce((max, p) => {
                    const v = defaultVariantOf(p);
                    if (v.originalPrice) {
                      const discount = Math.round(((v.originalPrice - v.price) / v.originalPrice) * 100);
                      return Math.max(max, discount);
                    }
                    return max;
                  }, 0);
```
Replace the grid map (lines 166–196) so the badge + card use the default variant + new prop shape:
```tsx
            {paginatedProducts.map((product) => {
              const v = defaultVariantOf(product);
              const discount =
                v.originalPrice && v.originalPrice > v.price
                  ? Math.round(((v.originalPrice - v.price) / v.originalPrice) * 100)
                  : 0;
              return (
                <div key={product.id} className="group relative">
                  {discount > 0 && (
                    <div className="absolute left-2 top-2 z-10 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-foreground shadow-lg">
                      -{discount}%
                    </div>
                  )}
                  <ProductCard product={product} fromPath="/deals" />
                </div>
              );
            })}
```

- [ ] **Step 9: Typecheck + test.**
Run: `npx tsc --noEmit` → Expected: PASS.
Run: `npm run test` → Expected: PASS.

- [ ] **Step 10: Commit.**
```bash
git add app/_lib/products.ts app/_components/home/product-card.tsx app/_components/home/product-grid.tsx app/_components/home/deals-section.tsx app/categories app/deals app/search app/wishlist app/_components/product/related-strip.tsx
git commit -m "feat(catalog): swatch product card and variant-aware list reads across all storefront lists"
```

---

## Phase 6 — Cart + checkout (variant key, per-cell decrement, snapshot)

**Goal:** Make the cart color-aware end to end. The cart line key becomes `variantId::size`, cart lines carry `variantId`/`color`, checkout validates against the exact color+size cell and decrements it, and `OrderItem` snapshots `variantId`/`color`/`sku`. A pure `validateCartItems` helper carries the stock rules and is unit-tested.

### Task 6.1: Cart context — variant-keyed lines

**Files:**
- Modify: `app/_lib/cart-context.tsx`

**Interfaces produced (consumed by add-to-cart button/dialog, buy box, checkout):**
- `type CartItem = { key; productId; variantId; color: string | null; size: string | null; name; price; image; quantity }`
- `AddItemPayload = Omit<CartItem, "quantity" | "key">` — callers must now pass `variantId` and `color`.

- [ ] **Step 1: Update `CartItem`, the key derivation, the validator, and the storage key.** In `app/_lib/cart-context.tsx`:

Replace `CartItem` (lines 5–13):
```ts
export type CartItem = {
  key: string; // unique per (variantId, size)
  productId: string;
  variantId: string;
  color: string | null;
  size: string | null;
  name: string;
  price: number;
  image: string;
  quantity: number;
};
```

Bump the storage key (line 43) so pre-variant carts are discarded (they lack `variantId` and would fail checkout):
```ts
const STORAGE_KEY = "shoply-cart-v3";
```

Replace `deriveKey` (lines 47–49) to key on the variant:
```ts
function deriveKey(variantId: string, size: string | null): string {
  return size ? `${variantId}::${size}` : variantId;
}
```

Update the `ADD_ITEM` reducer case to derive from `variantId` (line 58):
```ts
      const key = deriveKey(action.payload.variantId, action.payload.size);
```

Extend `isValidStoredItem` (lines 99–111) to require the new fields:
```ts
function isValidStoredItem(v: unknown): v is CartItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.key === "string" &&
    typeof o.productId === "string" &&
    typeof o.variantId === "string" &&
    (o.color === null || typeof o.color === "string") &&
    (o.size === null || typeof o.size === "string") &&
    typeof o.name === "string" &&
    typeof o.price === "number" &&
    typeof o.image === "string" &&
    typeof o.quantity === "number"
  );
}
```

Update `DEBUG_SEED_ITEMS` (lines 113–126) to include the new fields:
```ts
const DEBUG_SEED_ITEMS: CartItem[] =
  process.env.NEXT_PUBLIC_DEBUG_CART === "1"
    ? [
        {
          key: "debug-variant::M",
          productId: "debug-product",
          variantId: "debug-variant",
          color: "White",
          size: "M",
          name: "Debug Tee",
          price: 1990,
          image: "/products/placeholder.svg",
          quantity: 2,
        },
      ]
    : [];
```

- [ ] **Step 2: Typecheck.** Run `npx tsc --noEmit`.
Expected: FAIL in `add-to-cart-button.tsx`, `add-to-cart-dialog.tsx`, `buy-box-client.tsx`, `product-card.tsx` (all call `addItem` without `variantId`/`color`). Fixed next.

### Task 6.2: Add-to-cart button + dialog carry the variant

**Files:**
- Modify: `app/_components/cart/add-to-cart-button.tsx`, `app/_components/cart/add-to-cart-dialog.tsx`

- [ ] **Step 1: `add-to-cart-button.tsx`.** Add `variantId` (required) + `color` props, key on the variant, and include them in `addItem`:

In the `Props` type (lines 10–21) add:
```ts
  variantId: string;
  color?: string | null;
```
Change the destructure (lines 23–33) to include `variantId` and `color = null`. Replace the cart key (line 38):
```ts
  const cartKey = size ? `${variantId}::${size}` : variantId;
```
Replace the `addItem` call (line 47):
```ts
    addItem({ productId, variantId, color, name, price, image, size }, quantity);
```

- [ ] **Step 2: `add-to-cart-dialog.tsx`.** Add `variantId` + `color` props (lines 21–29):
```ts
  productId: string;
  variantId: string;
  color?: string | null;
  name: string;
  price: number;
  image: string;
  sizes: string;
  triggerVariant?: "outline" | "default";
  triggerClassName?: string;
```
Destructure them (lines 31–39, add `variantId`, `color = null`). Replace both `addItem` calls (lines 53–56 and 71–74):
```ts
    addItem({ productId, variantId, color, name, price, image, size: selectedSize || null }, 1);
```

### Task 6.3: Pass the variant from buy box + product card, and add `id` to the card variant

**Files:**
- Modify: `app/_lib/products.ts`, `app/_components/product/buy-box-client.tsx`, `app/_components/home/product-card.tsx`

- [ ] **Step 1: Add the variant `id` to `ProductCardVariant`** (the card needs it for the cart target). In `app/_lib/products.ts`:

Add `id: string;` to the top of the `ProductCardVariant` type. Add `id: true,` to the `variants.select` inside `cardSelect`. In `attachAggregates`, add `id: v.id,` to the mapped variant object.

- [ ] **Step 2: `buy-box-client.tsx`** — pass `variantId`/`color` in both `AddToCartButton` usages and in `handleBuyNow`.

In `handleBuyNow`, replace the `addItem` call:
```ts
    addItem({ productId, variantId: selectedVariant.id, color: selectedVariant.color, name, price, image, size: selectedSize || null }, quantity);
```
In the primary `<AddToCartButton .../>` and the sticky-bar `<AddToCartButton .../>`, add:
```tsx
            variantId={selectedVariant.id}
            color={selectedVariant.color}
```

- [ ] **Step 3: `product-card.tsx`** — pass `variantId`/`color` to `AddToCartDialog`:
```tsx
          <AddToCartDialog
            productId={id}
            variantId={variant.id}
            color={variant.color}
            name={name}
            price={price}
            image={image}
            sizes={variant.sizes.join(",")}
            triggerVariant="default"
            triggerClassName="w-full min-w-0 whitespace-nowrap"
          />
```

- [ ] **Step 4: Typecheck.** Run `npx tsc --noEmit`.
Expected: FAIL only in `app/checkout/actions.ts` (cart items now carry `variantId`, but the action's schema/validation/creation still key on `productId`). Fixed in Task 6.4.

### Task 6.4: Checkout — validate + decrement the exact cell, snapshot the variant (TDD)

**Files:**
- Create: `app/_lib/order-validation.ts`
- Test: `app/checkout/__tests__/variant-stock.test.ts`
- Modify: `app/checkout/actions.ts`

**Interfaces produced:**
- `type ValidatableItem = { variantId: string; size: string | null; name: string; quantity: number }`
- `type VariantStock = { sizeStocks: { size: string; stock: number }[] }`
- `validateCartItems(items: ValidatableItem[], variantMap: Map<string, VariantStock>): string | null` — returns an error message, or `null` when all lines are valid.

- [ ] **Step 1: Write the failing test** — `app/checkout/__tests__/variant-stock.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateCartItems, type VariantStock } from "@/app/_lib/order-validation";

const grid = (): Map<string, VariantStock> =>
  new Map([
    ["v-white", { sizeStocks: [{ size: "S", stock: 0 }, { size: "M", stock: 3 }] }],
    ["v-pink", { sizeStocks: [{ size: "M", stock: 5 }] }],
  ]);

describe("validateCartItems", () => {
  it("passes when the size cell has enough stock", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 2 }], grid())).toBeNull();
  });
  it("rejects an unknown variant", () => {
    expect(validateCartItems([{ variantId: "v-x", size: "M", name: "Tee", quantity: 1 }], grid())).toMatch(/Unknown item/);
  });
  it("requires a size when the variant offers sizes", () => {
    expect(validateCartItems([{ variantId: "v-white", size: null, name: "Tee", quantity: 1 }], grid())).toMatch(/select a size/);
  });
  it("rejects a size the variant does not offer", () => {
    expect(validateCartItems([{ variantId: "v-pink", size: "S", name: "Tee", quantity: 1 }], grid())).toMatch(/not available/);
  });
  it("rejects when requested quantity exceeds the cell stock", () => {
    expect(validateCartItems([{ variantId: "v-white", size: "M", name: "Tee", quantity: 4 }], grid())).toMatch(/Insufficient stock/);
    expect(validateCartItems([{ variantId: "v-white", size: "S", name: "Tee", quantity: 1 }], grid())).toMatch(/Insufficient stock/);
  });
});
```

- [ ] **Step 2: Run it, confirm failure.**
Run: `npm run test -- -t "validateCartItems"`
Expected: FAIL — `Cannot find module '@/app/_lib/order-validation'`.

- [ ] **Step 3: Implement `app/_lib/order-validation.ts`:**
```ts
// Pure cart-vs-inventory validation. No DB — the caller supplies a variant map.
// Kept separate from the "use server" action file so it can be unit-tested and
// so the action can import a non-async helper.
export type ValidatableItem = {
  variantId: string;
  size: string | null;
  name: string;
  quantity: number;
};

export type VariantStock = { sizeStocks: { size: string; stock: number }[] };

export function validateCartItems(
  items: ValidatableItem[],
  variantMap: Map<string, VariantStock>,
): string | null {
  for (const item of items) {
    const v = variantMap.get(item.variantId);
    if (!v) return `Unknown item "${item.name}"`;
    const sizes = v.sizeStocks.map((s) => s.size);
    if (sizes.length > 0) {
      if (!item.size) return `Please select a size for "${item.name}"`;
      const cell = v.sizeStocks.find((s) => s.size === item.size);
      if (!cell) return `Size "${item.size}" is not available for "${item.name}"`;
      if (cell.stock < item.quantity) return `Insufficient stock for "${item.name}"`;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the test, confirm pass.**
Run: `npm run test -- -t "validateCartItems"` → Expected: PASS.

- [ ] **Step 5: Wire the helper into `app/checkout/actions.ts`.**

Add the import near the top:
```ts
import { validateCartItems, type VariantStock } from "@/app/_lib/order-validation";
```

Extend `ItemInputSchema` (lines 36–42):
```ts
const ItemInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  color: z.string().nullable().optional(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  size: z.string().nullable().optional(),
});
```

Replace the product-based validation block (lines 184–219) with a variant-based one:
```ts
  // Validate each line against its variant's size-stock grid.
  const variantIds = Array.from(new Set(items.map((i) => i.variantId)));
  const dbVariants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, sku: true, sizeStocks: { select: { size: true, stock: true } } },
  });
  const variantMap = new Map<string, VariantStock & { sku: string | null }>(
    dbVariants.map((v) => [v.id, v]),
  );
  const validationError = validateCartItems(items, variantMap);
  if (validationError) return { success: false, error: validationError };
```

Replace the stock-decrement loop inside the transaction (lines 226–234) with a per-cell conditional decrement:
```ts
      for (const item of items) {
        if (!item.size) continue; // sizeless variants carry no per-size stock
        const result = await tx.variantSizeStock.updateMany({
          where: { variantId: item.variantId, size: item.size, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          throw new Error(`Insufficient stock for "${item.name}"`);
        }
      }
```

Replace the `OrderItem` create mapping (lines 260–268) to snapshot the variant:
```ts
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              color: item.color ?? null,
              sku: variantMap.get(item.variantId)?.sku ?? null,
              name: item.name,
              size: item.size ?? null,
              price: item.price,
              quantity: item.quantity,
            })),
          },
```

- [ ] **Step 6: Typecheck + full test.**
Run: `npx tsc --noEmit` → Expected: PASS.
Run: `npm run test` → Expected: PASS (new `validateCartItems` suite green).

- [ ] **Step 7: Commit.**
```bash
git add app/_lib/cart-context.tsx app/_components/cart app/_components/product/buy-box-client.tsx app/_components/home/product-card.tsx app/_lib/products.ts app/_lib/order-validation.ts app/checkout/actions.ts app/checkout/__tests__/variant-stock.test.ts
git commit -m "feat(checkout): variant-keyed cart and per-color-size stock decrement with order snapshot"
```

---

## Phase 7 — SEO / feed / JSON-LD + contract (drop legacy columns)

**Goal:** Make the structured data and Meta feed variant-aware (per-color offers, shared `item_group_id`, `?color=` deep links), then run the **contract** step: drop the now-unused legacy `Product.image/stock/sizes` columns and the `ProductImage` table, removing every remaining reference.

### Task 7.1: Variant-aware JSON-LD + PDP metadata

**Files:**
- Modify: `app/_components/product/product-jsonld.tsx`, `app/products/[id]/page.tsx`

**Interfaces:** consumes `VariantDetail` (Phase 4) + `variantInStock`.

- [ ] **Step 1: Rewrite `app/_components/product/product-jsonld.tsx`** to emit one Offer per color:
```tsx
import { absoluteUrl } from "@/app/_lib/absolute-url";
import { stripMarkdown } from "@/app/_lib/strip-markdown";
import { variantInStock } from "@/app/_lib/variants";
import type { VariantDetail } from "@/app/_lib/products";

// Emits Product JSON-LD with one Offer per color variant (shared design, many
// colors) for Meta/Google/Pinterest rich results.
export function ProductJsonLd({
  product,
  variants,
  ratingAvg,
  ratingCount,
}: {
  product: { id: string; name: string; description: string };
  variants: VariantDetail[];
  ratingAvg: number;
  ratingCount: number;
}) {
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
      availability: variantInStock(v.sizeStocks)
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

- [ ] **Step 2: Update `app/products/[id]/page.tsx`** — pass variants to `ProductJsonLd` and make `generateMetadata` color-aware.

Change the `SearchParams` type (line 28):
```ts
type SearchParams = { reviews?: string; color?: string };
```

Rewrite `generateMetadata` (lines 36–64) to read `?color=` and use the variant image/price:
```ts
export async function generateMetadata(
  { params, searchParams }: { params: Promise<Params>; searchParams: Promise<SearchParams> },
): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await getProductDetail(id);
  if (!detail) {
    const dest = await getProductSlugRedirect(id);
    if (dest) permanentRedirect(`/products/${dest}`);
    return { title: { absolute: "Product not found — Dressing Bear" } };
  }
  const variant = detail.variants.find((v) => v.colorSlug === sp.color) ?? detail.variants[0];
  const priceTitle = `${detail.product.name} — ${formatPrice(variant.price)}`;
  const description = stripMarkdown(detail.product.description);
  const imageUrl = absoluteUrl(variant.detailImages[0] ?? "");
  return {
    title: { absolute: `${priceTitle} | Dressing Bear` },
    description,
    openGraph: {
      title: priceTitle,
      description,
      images: [{ url: imageUrl, width: 1200, height: 1500, alt: detail.product.name }],
    },
    twitter: { card: "summary_large_image", title: priceTitle, description, images: [imageUrl] },
  };
}
```

Replace the `<ProductJsonLd .../>` usage (lines 94–98) with:
```tsx
      <ProductJsonLd
        product={{ id: detail.product.id, name: detail.product.name, description: detail.product.description }}
        variants={detail.variants}
        ratingAvg={detail.ratingAvg}
        ratingCount={detail.ratingCount}
      />
```

- [ ] **Step 3: Typecheck.** Run `npx tsc --noEmit` → Expected: PASS (all inputs still exist; legacy columns not yet dropped).

### Task 7.2: Variant-aware Meta catalog feed (TDD)

**Files:**
- Modify: `app/_lib/meta-feed.ts`, `app/feed/meta-catalog.csv/route.ts`
- Test: `app/_lib/__tests__/meta-feed-variants.test.ts`

**Interfaces produced:**
- `type FeedVariant = { productId; productName; color; colorSlug; description; sku: string | null; price; originalPrice: number | null; inStock: boolean; image }`
- `variantToFeedRow(v: FeedVariant): FeedRow`

- [ ] **Step 1: Write the failing test** — `app/_lib/__tests__/meta-feed-variants.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { variantToFeedRow, type FeedVariant } from "../meta-feed";

const base: FeedVariant = {
  productId: "cat-tee", productName: "Oversize Cat T-Shirt", color: "White", colorSlug: "white",
  description: "Soft   cotton\n tee", sku: "CAT-WHITE",
  price: 2190, originalPrice: null, inStock: true, image: "/products/cat-tee/white/card/1.jpg",
};

describe("variantToFeedRow", () => {
  it("uses the SKU as id and the product id as item_group_id", () => {
    const row = variantToFeedRow(base);
    expect(row.id).toBe("CAT-WHITE");
    expect(row.item_group_id).toBe("cat-tee");
    expect(row.link).toContain("/products/cat-tee?color=white");
  });
  it("falls back to product-color id when SKU is absent", () => {
    expect(variantToFeedRow({ ...base, sku: null }).id).toBe("cat-tee-white");
  });
  it("collapses description whitespace and marks availability", () => {
    const row = variantToFeedRow({ ...base, inStock: false });
    expect(row.description).toBe("Soft cotton tee");
    expect(row.availability).toBe("out of stock");
  });
  it("inverts price/sale_price on sale", () => {
    const row = variantToFeedRow({ ...base, price: 1990, originalPrice: 2490 });
    expect(row.price).toBe("2490.00 LKR");
    expect(row.sale_price).toBe("1990.00 LKR");
  });
});
```

- [ ] **Step 2: Run it, confirm failure.**
Run: `npm run test -- -t "variantToFeedRow"` → Expected: FAIL (`variantToFeedRow` not exported).

- [ ] **Step 3: Update `app/_lib/meta-feed.ts`.** Keep `FeedRow`, `FEED_COLUMNS`, `money`, `csvCell`, `feedRowsToCsv`. Replace `FeedProduct` + `productToFeedRow` with:
```ts
export type FeedVariant = {
  productId: string;
  productName: string;
  color: string;
  colorSlug: string;
  description: string;
  sku: string | null;
  price: number;                 // effective
  originalPrice: number | null;  // effective
  inStock: boolean;
  image: string;
};

export function variantToFeedRow(v: FeedVariant): FeedRow {
  const onSale = v.originalPrice != null && v.originalPrice > v.price;
  return {
    id: v.sku ?? `${v.productId}-${v.colorSlug}`,
    title: `${v.productName} - ${v.color}`,
    description: v.description.replace(/\s+/g, " ").trim(),
    availability: v.inStock ? "in stock" : "out of stock",
    condition: "new",
    // Meta convention: on sale, `price` is the was-price and `sale_price` the now-price.
    price: onSale ? money(v.originalPrice as number) : money(v.price),
    sale_price: onSale ? money(v.price) : "",
    link: absoluteUrl(`/products/${v.productId}?color=${v.colorSlug}`),
    image_link: absoluteUrl(v.image),
    brand: BRAND,
    google_product_category: GOOGLE_CATEGORY,
    // Shared across every color of a design — Meta's native variant grouping.
    item_group_id: v.productId,
  };
}
```

- [ ] **Step 4: Update the feed route** `app/feed/meta-catalog.csv/route.ts` to emit one row per variant:
```ts
import { prisma } from "@/app/_lib/prisma";
import { variantToFeedRow, feedRowsToCsv, type FeedVariant } from "@/app/_lib/meta-feed";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const products = await prisma.product.findMany({
    where: { archived: false },
    orderBy: { id: "asc" },
    select: {
      id: true, name: true, description: true, price: true, originalPrice: true,
      variants: {
        where: { archived: false },
        orderBy: { sortOrder: "asc" },
        select: {
          color: true, colorSlug: true, sku: true, price: true, originalPrice: true,
          images: { where: { role: "CARD" }, orderBy: { sortOrder: "asc" }, select: { url: true }, take: 1 },
          sizeStocks: { select: { stock: true } },
        },
      },
    },
  });

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
        inStock: v.sizeStocks.some((s) => s.stock > 0),
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

- [ ] **Step 5: Typecheck + test.**
Run: `npx tsc --noEmit` → Expected: PASS.
Run: `npm run test` → Expected: PASS (new feed test green).

- [ ] **Step 6: Commit the SEO layer.**
```bash
git add app/_components/product/product-jsonld.tsx app/products/[id]/page.tsx app/_lib/meta-feed.ts app/feed/meta-catalog.csv/route.ts app/_lib/__tests__/meta-feed-variants.test.ts
git commit -m "feat(catalog): per-color JSON-LD offers, color-aware OG metadata, and variant Meta feed rows"
```

### Task 7.3: Contract — drop legacy `Product.image/stock/sizes` + `ProductImage`

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/seed.ts`, `app/admin/products/actions.ts`, `app/products/[id]/page.tsx`, `app/_components/product/image-gallery.tsx`
- Create: `prisma/migrations/<ts>_drop_legacy_product_columns/migration.sql`

- [ ] **Step 1: Remove the legacy fields from the schema.** In `prisma/schema.prisma`, from `Product` delete the `image`, `stock`, `sizes`, and `images ProductImage[]` lines. Delete the entire `ProductImage` model. (Keep `price`, `originalPrice`, `description`, `variants`, `reviews`, `wishlistItems`, `orderItems`, `slugHistory`, `category`.)

- [ ] **Step 2: Regenerate the client + typecheck to find every remaining reference.**
Run: `npx prisma generate && npx tsc --noEmit`
Expected: FAIL at each remaining legacy reference — `seed.ts` (writes image/stock/sizes), `actions.ts` (`legacyScalars` + create/update data), `page.tsx` (`fallbackImage={detail.product.image}`). Fix each below.

- [ ] **Step 3: `seed.ts`** — drop the legacy back-fill. In the `product.upsert`, remove the `image`, `stock`, and `sizes` fields from both `update` and `create`. Delete the now-unused `legacyImage` and `legacySizes` locals (the `resolveVariantImages(...)` calls for variant CARD/DETAIL rows stay).

- [ ] **Step 4: `actions.ts`** — delete the `legacyScalars` function entirely, and remove `image: legacy.image, stock: legacy.stock, sizes: legacy.sizes` (and the `const legacy = legacyScalars(d);` lines) from `createProduct` and both branches of `updateProduct`.

- [ ] **Step 5: `page.tsx`** — the PDP `<ImageGallery>` `fallbackImage` no longer has `detail.product.image`; use the default variant's first detail image:
```tsx
              fallbackImage={detail.variants[0].detailImages[0] ?? ""}
```

- [ ] **Step 6: `image-gallery.tsx`** — no code change required (its `fallbackImage` prop is still a `string`); confirm it typechecks.

- [ ] **Step 7: Hand-author the drop migration.** Create `prisma/migrations/<UTC ts, after Phase 1's>_drop_legacy_product_columns/migration.sql`:
```sql
-- Contract step of the product-variants expand-contract: variant tables now own
-- images and inventory, so drop the legacy Product scalar columns and the
-- ProductImage table. Re-runnable per repo convention.
DROP TABLE IF EXISTS "ProductImage";

ALTER TABLE "Product" DROP COLUMN IF EXISTS "image";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "stock";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "sizes";
```

- [ ] **Step 8: Regenerate, typecheck, and run the full suite.**
Run: `npx prisma generate && npx prisma validate` → Expected: schema valid.
Run: `npx tsc --noEmit` → Expected: PASS.
Run: `npm run test` → Expected: PASS.
Then grep to confirm no stragglers:
Run: `grep -rn "\.stock\b\|product\.image\|\.sizes\b" app/_lib app/_components app/products app/checkout --include=*.ts --include=*.tsx`
Expected: no hits referencing `Product.image`/`Product.stock`/`Product.sizes` (variant `sizeStocks`, `VariantSizeStock.stock`, and `variant.sizes` on `ProductCardVariant` are fine and expected).

- [ ] **Step 9: Commit the contract step.**
```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations app/admin/products/actions.ts app/products/[id]/page.tsx app/_components/product/image-gallery.tsx
git commit -m "refactor(catalog): drop legacy Product image/stock/sizes columns and ProductImage table"
```

---

## Final verification

- [ ] **Run the full gate one last time.**
Run: `npx prisma generate && npx tsc --noEmit && npm run test`
Expected: schema valid, no type errors, all unit tests pass.
- [ ] **Confirm both migrations are present and ordered** after `20260703140000_phone_first_registration`: the additive `_add_product_variants` and the `_drop_legacy_product_columns` contract migration.
- [ ] **E2E (optional, when a DB + running app are available)** per CLAUDE.md `npm run test:e2e`: shop card swatch swaps image without reload; PDP color select updates gallery/SKU/stock/size-availability + `?color=` URL; add-to-cart carries the right variant into the cart and checkout; admin creates a multi-color product with both image sets + a stock grid and it renders end to end. These are documented as the acceptance flows; they cannot run in this repo's DB-less environment.

## Notes for the implementer

- **No local DB.** Every phase's gate is `npx tsc --noEmit` + `npm run test`. Migrations are applied later, in the deploy pipeline (`.github/workflows/migrate.yml`), against the real Neon database — not by you.
- **Seed images.** The demo relies on files under `public/products/<productId>/<colorSlug>/card/` and `/detail/`; when absent, the seed falls back to `main.svg`. Generating real demo images is out of scope for this plan (see `scripts/generate-demo-images.ts` if you extend it).
- **Transitional color-blind cart** exists only between Phases 4 and 6; Phase 6 closes it. If you implement out of order, that window widens — keep the phase order.
