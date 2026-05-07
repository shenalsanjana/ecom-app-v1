# Real product catalog + size chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo seed catalog (3 categories, 12 products) with the real Dressing Bear oversize T-shirt catalog (2 print categories, 6 products) and add a Size Chart modal to the product detail page.

**Architecture:** Pure data + small UI feature. No schema change. Real product photos move from `media/` (a reference directory) into `public/products/<id>/` so Next.js serves them as optimizable static assets. The catalog source-of-truth `app/_data/mock.ts` is rewritten; `prisma/seed.ts` reads it unchanged. A new `SizeChartDialog` client component wraps the existing shadcn `Dialog` and is wired into the buy box. After code lands, a one-time `FORCE_SEED=true` run replaces the demo data in the shared Prisma Postgres database with the real catalog.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 → Prisma Postgres, shadcn/ui (Dialog), TypeScript, Tailwind. No test framework is configured in this project — verification per task is `npm run build` (which runs TypeScript + lint + static page generation) plus visual smoke checks where noted.

**Spec:** `docs/superpowers/specs/2026-05-07-real-products-and-size-chart-design.md`

---

## File map

| Path | Status | Responsibility |
|---|---|---|
| `app/_data/mock.ts` | rewrite | Source-of-truth list of categories + products, consumed by seed |
| `prisma/seed.ts` | modify (1 hunk) | Stop padding `ProductImage` rows with the main image when fewer gallery files exist |
| `app/_components/product/size-chart-dialog.tsx` | create | Small client component: `Size Chart` button + modal showing the size-chart image |
| `app/_components/product/buy-box-client.tsx` | modify (2 hunks) | Import `SizeChartDialog`, render it next to the "Size:" label |
| `public/products/<id>/{main,1,2}.jpg` × 6 | create | 18 photos staged for serving |
| `public/size-charts/oversize.jpg` | create | Size-chart image staged for serving |
| `public/products/p1` … `p8`, `d1` … `d4` | delete | Remove obsolete demo image folders |

---

## Task 1: Stage real product photos and the size chart in `public/`

**Files:**
- Create: `public/products/cat-white/{main,1,2}.jpg`
- Create: `public/products/cat-ivory/{main,1,2}.jpg`
- Create: `public/products/cat-baby-pink/{main,1,2}.jpg`
- Create: `public/products/dino-white/{main,1,2}.jpg`
- Create: `public/products/dino-ivory/{main,1,2}.jpg`
- Create: `public/products/dino-baby-pink/{main,1,2}.jpg`
- Create: `public/size-charts/oversize.jpg`

**Mapping** (source → destination):

| Destination | Source |
|---|---|
| `public/products/cat-white/main.jpg` | `media/oversize/girls/white/Untitled design (9).jpg` |
| `public/products/cat-white/1.jpg` | `media/oversize/girls/white/Untitled design (8).jpg` |
| `public/products/cat-white/2.jpg` | `media/oversize/girls/white/Untitled design (7).jpg` |
| `public/products/cat-ivory/main.jpg` | `media/oversize/girls/ivory/Template 01 (16).jpg` |
| `public/products/cat-ivory/1.jpg` | `media/oversize/girls/ivory/Template 01 (12).jpg` |
| `public/products/cat-ivory/2.jpg` | `media/oversize/girls/ivory/Template 01 (14).jpg` |
| `public/products/cat-baby-pink/main.jpg` | `media/oversize/girls/baby-pink/Template 01 (6).jpg` |
| `public/products/cat-baby-pink/1.jpg` | `media/oversize/girls/baby-pink/Template 01 (8).jpg` |
| `public/products/cat-baby-pink/2.jpg` | `media/oversize/girls/baby-pink/Template 01 (7).jpg` |
| `public/products/dino-white/main.jpg` | `media/oversize/girls/white/Untitled design (10).jpg` |
| `public/products/dino-white/1.jpg` | `media/oversize/girls/white/Untitled design (12).jpg` |
| `public/products/dino-white/2.jpg` | `media/oversize/girls/white/Untitled design (11).jpg` |
| `public/products/dino-ivory/main.jpg` | `media/oversize/girls/ivory/Template 01 (17).jpg` |
| `public/products/dino-ivory/1.jpg` | `media/oversize/girls/ivory/Template 01 (13).jpg` |
| `public/products/dino-ivory/2.jpg` | `media/oversize/girls/ivory/Template 01 (15).jpg` |
| `public/products/dino-baby-pink/main.jpg` | `media/oversize/girls/baby-pink/Template 01 (9).jpg` |
| `public/products/dino-baby-pink/1.jpg` | `media/oversize/girls/baby-pink/Template 01 (11).jpg` |
| `public/products/dino-baby-pink/2.jpg` | `media/oversize/girls/baby-pink/Template 01 (10).jpg` |
| `public/size-charts/oversize.jpg` | `media/oversize/size-chart.jpg` |

The `main.jpg` slot picks the composite (front+back) shot where it exists, otherwise the back-full photo — best as the listing thumbnail.

- [ ] **Step 1: Create the destination directory tree**

```powershell
New-Item -ItemType Directory -Path `
  public/products/cat-white, `
  public/products/cat-ivory, `
  public/products/cat-baby-pink, `
  public/products/dino-white, `
  public/products/dino-ivory, `
  public/products/dino-baby-pink, `
  public/size-charts -Force
```

Expected: 7 directories created (no errors).

- [ ] **Step 2: Copy the 18 product photos with renames**

```powershell
# cat-white
Copy-Item "media/oversize/girls/white/Untitled design (9).jpg"  "public/products/cat-white/main.jpg"
Copy-Item "media/oversize/girls/white/Untitled design (8).jpg"  "public/products/cat-white/1.jpg"
Copy-Item "media/oversize/girls/white/Untitled design (7).jpg"  "public/products/cat-white/2.jpg"
# cat-ivory
Copy-Item "media/oversize/girls/ivory/Template 01 (16).jpg"     "public/products/cat-ivory/main.jpg"
Copy-Item "media/oversize/girls/ivory/Template 01 (12).jpg"     "public/products/cat-ivory/1.jpg"
Copy-Item "media/oversize/girls/ivory/Template 01 (14).jpg"     "public/products/cat-ivory/2.jpg"
# cat-baby-pink
Copy-Item "media/oversize/girls/baby-pink/Template 01 (6).jpg"  "public/products/cat-baby-pink/main.jpg"
Copy-Item "media/oversize/girls/baby-pink/Template 01 (8).jpg"  "public/products/cat-baby-pink/1.jpg"
Copy-Item "media/oversize/girls/baby-pink/Template 01 (7).jpg"  "public/products/cat-baby-pink/2.jpg"
# dino-white
Copy-Item "media/oversize/girls/white/Untitled design (10).jpg" "public/products/dino-white/main.jpg"
Copy-Item "media/oversize/girls/white/Untitled design (12).jpg" "public/products/dino-white/1.jpg"
Copy-Item "media/oversize/girls/white/Untitled design (11).jpg" "public/products/dino-white/2.jpg"
# dino-ivory
Copy-Item "media/oversize/girls/ivory/Template 01 (17).jpg"     "public/products/dino-ivory/main.jpg"
Copy-Item "media/oversize/girls/ivory/Template 01 (13).jpg"     "public/products/dino-ivory/1.jpg"
Copy-Item "media/oversize/girls/ivory/Template 01 (15).jpg"     "public/products/dino-ivory/2.jpg"
# dino-baby-pink
Copy-Item "media/oversize/girls/baby-pink/Template 01 (9).jpg"  "public/products/dino-baby-pink/main.jpg"
Copy-Item "media/oversize/girls/baby-pink/Template 01 (11).jpg" "public/products/dino-baby-pink/1.jpg"
Copy-Item "media/oversize/girls/baby-pink/Template 01 (10).jpg" "public/products/dino-baby-pink/2.jpg"
# size chart
Copy-Item "media/oversize/size-chart.jpg" "public/size-charts/oversize.jpg"
```

- [ ] **Step 3: Verify file count**

```powershell
(Get-ChildItem -Recurse public/products/cat-white,public/products/cat-ivory,public/products/cat-baby-pink,public/products/dino-white,public/products/dino-ivory,public/products/dino-baby-pink -File).Count
```

Expected: `18`

```powershell
Test-Path public/size-charts/oversize.jpg
```

Expected: `True`

- [ ] **Step 4: Commit**

```bash
git add public/products/cat-white public/products/cat-ivory public/products/cat-baby-pink public/products/dino-white public/products/dino-ivory public/products/dino-baby-pink public/size-charts
git commit -m "feat(content): stage real oversize tee photos + size chart in public/"
```

---

## Task 2: Replace catalog data in `app/_data/mock.ts`

**Files:**
- Modify: `app/_data/mock.ts` (full rewrite — keep the type definitions, replace the data arrays)

The existing file exports `Category`, `Product` types and three arrays (`categories`, `featuredProducts`, `dealsProducts`). The seed iterates `[...featuredProducts, ...dealsProducts]`. We collapse to one `featuredProducts` list of 6 (no deals) — the `dealsProducts` array stays exported but empty so the `getDealsProducts()` query in `app/_lib/products.ts` keeps compiling. (`getDealsProducts` filters by `originalPrice IS NOT NULL`; with no discounted products, it just returns `[]`, which the home/deals pages already handle.)

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `app/_data/mock.ts` with:

```ts
export type Category = {
  slug: string;
  name: string;
  image: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  reviewCount: number;
  category: Category["slug"];
};

export const categories: Category[] = [
  { slug: "cat", name: "Cat", image: "/products/cat-white/main.jpg" },
  { slug: "dino", name: "Dino", image: "/products/dino-white/main.jpg" },
];

export const featuredProducts: Product[] = [
  { id: "cat-white",       name: "Oversize Cat T-Shirt — White",      price: 2190, image: "/products/cat-white/main.jpg",       rating: 0, reviewCount: 0, category: "cat" },
  { id: "cat-ivory",       name: "Oversize Cat T-Shirt — Ivory",      price: 2190, image: "/products/cat-ivory/main.jpg",       rating: 0, reviewCount: 0, category: "cat" },
  { id: "cat-baby-pink",   name: "Oversize Cat T-Shirt — Baby Pink",  price: 2190, image: "/products/cat-baby-pink/main.jpg",   rating: 0, reviewCount: 0, category: "cat" },
  { id: "dino-white",      name: "Oversize Dino T-Shirt — White",     price: 2190, image: "/products/dino-white/main.jpg",      rating: 0, reviewCount: 0, category: "dino" },
  { id: "dino-ivory",      name: "Oversize Dino T-Shirt — Ivory",     price: 2190, image: "/products/dino-ivory/main.jpg",      rating: 0, reviewCount: 0, category: "dino" },
  { id: "dino-baby-pink",  name: "Oversize Dino T-Shirt — Baby Pink", price: 2190, image: "/products/dino-baby-pink/main.jpg",  rating: 0, reviewCount: 0, category: "dino" },
];

export const dealsProducts: Product[] = [];
```

The `image` and `rating`/`reviewCount` fields on Product are vestigial for seeding — the seed reads `id`/`name`/`price`/`originalPrice`/`category` from each entry and recomputes images, descriptions, stock, and reviews itself. Including them keeps the type compatible with anywhere else in the app that imports from `mock.ts`.

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. (If errors mention missing imports of removed slug strings — e.g. `"oversize-tshirts"` — those are leftover hardcoded references that need updating; jump back here after Task 4 to chase them down. None expected based on a grep of the repo at planning time.)

- [ ] **Step 3: Commit**

```bash
git add app/_data/mock.ts
git commit -m "feat(catalog): replace demo catalog with real oversize tee SKUs"
```

---

## Task 3: Make `prisma/seed.ts` skip non-existent gallery images

**Files:**
- Modify: `prisma/seed.ts` (lines 156–168 in the current file — the `productImage.createMany` block)

**Why:** Each new product has only 3 photos (`main.jpg` + `1.jpg` + `2.jpg`). The current seed always creates 4 `ProductImage` rows (`[1, 2, 3, 4].map(...)`), with `pickGalleryImage` falling back to `main.jpg` when a numbered file is missing. That fallback creates duplicate gallery entries pointing at the main image — visible as repeated photos in the PDP gallery. Fix: count what actually exists and create only that many rows.

- [ ] **Step 1: Replace the createMany block**

Find this block in `prisma/seed.ts` (currently at lines ~156–168):

```ts
    // ProductImage rows (4 per product). Reset and re-create on each seed run.
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    await prisma.productImage.createMany({
      data: [1, 2, 3, 4].map((n) => ({
        productId: p.id,
        url: pickGalleryImage(p.id, n),
        sortOrder: n,
      })),
    });
```

Replace with:

```ts
    // ProductImage rows: one per real gallery file (1.jpg, 2.jpg, ...) under
    // public/products/<id>/. Stops at the first missing index so we don't
    // create duplicate rows pointing at main.jpg.
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    const galleryRows: { productId: string; url: string; sortOrder: number }[] = [];
    for (let n = 1; n <= 8; n++) {
      const candidates = [`${n}.jpg`, `${n}.jpeg`, `${n}.png`, `${n}.webp`];
      const found = candidates.find((file) =>
        existsSync(publicPath("products", p.id, file)),
      );
      if (!found) break;
      galleryRows.push({
        productId: p.id,
        url: `/products/${p.id}/${found}`,
        sortOrder: n,
      });
    }
    if (galleryRows.length > 0) {
      await prisma.productImage.createMany({ data: galleryRows });
    }
```

Note: the new code inlines its own existence check rather than calling `pickGalleryImage`, because `pickGalleryImage`'s fallback to `main.jpg` is exactly the behavior we want to *avoid* here.

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "fix(seed): only create ProductImage rows for files that exist"
```

---

## Task 4: Add `SizeChartDialog` component

**Files:**
- Create: `app/_components/product/size-chart-dialog.tsx`

- [ ] **Step 1: Write the component**

Create `app/_components/product/size-chart-dialog.tsx` with:

```tsx
"use client";

import Image from "next/image";
import { Ruler } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SizeChartDialog() {
  return (
    <Dialog>
      <DialogTrigger className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <Ruler className="h-3.5 w-3.5" aria-hidden />
        Size Chart
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Oversize T-shirt size chart</DialogTitle>
          <DialogDescription>
            Measurements in inches, ±0.5&quot; tolerance. Unisex sizing.
          </DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-md">
          <Image
            src="/size-charts/oversize.jpg"
            alt="Oversize t-shirt size chart"
            fill
            sizes="(min-width: 640px) 42rem, 100vw"
            className="object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Notes:
- `lucide-react` is already a dependency (used in `buy-box-client.tsx`).
- The shadcn `Dialog` re-exports were verified: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` all exist in `components/ui/dialog.tsx`.
- `aspect-square` matches the source size-chart image's roughly square aspect (1024×1024-ish).

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/_components/product/size-chart-dialog.tsx
git commit -m "feat(pdp): add SizeChartDialog component (Dialog + chart image)"
```

---

## Task 5: Wire `SizeChartDialog` into the buy box

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx` (2 hunks: import + render)

- [ ] **Step 1: Add the import**

Near the top of `buy-box-client.tsx` (currently line 11), add `SizeChartDialog` import below the existing `AddToCartButton` import. The relevant import block becomes:

```tsx
import { AddToCartButton } from "@/app/_components/cart/add-to-cart-button";
import { SizeChartDialog } from "@/app/_components/product/size-chart-dialog";
import { toggleWishlistAction } from "@/app/wishlist/actions";
```

- [ ] **Step 2: Render `<SizeChartDialog />` in the size-row**

Find this block (currently lines 121–126):

```tsx
      {/* Size Selection */}
      {sizeList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Size:</span>
            <span className="text-sm text-muted-foreground">{selectedSize || "Select a size"}</span>
          </div>
```

Replace with:

```tsx
      {/* Size Selection */}
      {sizeList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Size:</span>
            <span className="text-sm text-muted-foreground">{selectedSize || "Select a size"}</span>
            <SizeChartDialog />
          </div>
```

The `ml-auto` on the trigger pushes the chart link to the right edge of that row, leaving the size buttons untouched.

- [ ] **Step 3: Verify the build still passes**

```bash
npm run build
```

Expected: `✓ Compiled successfully`, all 24 pages generated, no TypeScript errors. (PDP route is `/products/[id]` — listed in the route summary.)

- [ ] **Step 4: Visual smoke test**

```bash
npm run dev
```

Open `http://localhost:3000/products/cat-white` (after Task 7 the catalog will be live; for now this URL would 404 since the DB still has the demo catalog). For pre-reseed verification: open any existing PDP like `http://localhost:3000/products/p1` and confirm:
- "Size:" row now has a "📏 Size Chart" link pushed to the right
- Clicking it opens a modal showing the size chart image
- ESC and the X button both close it

If you can't run the dev server in this session, mark this step skipped — Task 8's production smoke test catches the same regressions.

- [ ] **Step 5: Commit**

```bash
git add app/_components/product/buy-box-client.tsx
git commit -m "feat(pdp): wire SizeChartDialog into the buy box size row"
```

---

## Task 6: Remove obsolete demo image folders

**Files:**
- Delete: `public/products/p1` through `public/products/p8`
- Delete: `public/products/d1` through `public/products/d4`

These directories contain placeholder photos for the 12 demo products that no longer exist in the catalog after Task 2.

- [ ] **Step 1: Confirm what's about to be deleted**

```powershell
Get-ChildItem public/products | Where-Object { $_.Name -match '^(p[1-8]|d[1-4])$' } | Select-Object Name
```

Expected: 12 entries — `p1` through `p8`, `d1` through `d4`.

- [ ] **Step 2: Delete them**

```powershell
Remove-Item -Recurse -Force public/products/p1, public/products/p2, public/products/p3, public/products/p4, public/products/p5, public/products/p6, public/products/p7, public/products/p8, public/products/d1, public/products/d2, public/products/d3, public/products/d4
```

- [ ] **Step 3: Verify only the 6 real product folders remain**

```powershell
Get-ChildItem public/products -Directory | Select-Object Name
```

Expected: exactly the 6 entries `cat-baby-pink`, `cat-ivory`, `cat-white`, `dino-baby-pink`, `dino-ivory`, `dino-white` (plus possibly the existing `homepage` folder if it exists — leave that alone if so).

- [ ] **Step 4: Verify the build still passes**

```bash
npm run build
```

Expected: clean build. No 404s referenced from build output.

- [ ] **Step 5: Commit**

```bash
git add -A public/products
git commit -m "chore(content): remove obsolete demo product image folders"
```

---

## Task 7: Force-reseed Prisma Postgres with the real catalog

This task is operational, not a code commit. It runs the seed script with `FORCE_SEED=true` so the existing demo data in the shared production database is replaced.

**Important:** This wipes and replaces the catalog in the production Prisma Postgres database (the one `https://dressingbear.com` reads from). The user has acknowledged that the only data currently there is demo data and a destructive reseed is acceptable.

- [ ] **Step 1: Confirm `.env.local` points at Prisma Postgres (not stale sqlite)**

```bash
grep -E '^DATABASE_URL=' .env.local
```

Expected: a single line of `DATABASE_URL="postgres://...db.prisma.io..."`. If you also see a `DATABASE_URL="file:./dev.db"` line above it, delete that line first.

- [ ] **Step 2: Run the force-reseed**

PowerShell:
```powershell
$env:FORCE_SEED = "true"; npx tsx prisma/seed.ts
Remove-Item Env:\FORCE_SEED
```

Bash:
```bash
FORCE_SEED=true npx tsx prisma/seed.ts
```

- [ ] **Step 3: Verify the seed output**

Expected log line at the end:

```
Seeded 2 categories, 6 products, 18 images, <N> reviews.
```

Where `<N>` is between 30 and 60 (the seed creates 5–10 deterministic reviews per product).

If counts differ (e.g. "12 images" instead of "18"), Task 3 didn't take effect — re-check the `productImage.createMany` block.

- [ ] **Step 4: Verify in the database**

```powershell
npx prisma studio
```

In the browser, check:
- `Category` table has 2 rows: `cat`, `dino` (no `oversize-tshirts`, `graphic-tees`, `solid-basics`)
- `Product` table has 6 rows with ids matching the catalog
- `ProductImage` table has 18 rows, distributed 3 per product
- No orphan rows referring to old demo product ids (`p1`…`p8`, `d1`…`d4`)

Close Prisma Studio when done.

- [ ] **Step 5: Local PDP smoke test**

```bash
npm run dev
```

Visit `http://localhost:3000/products/cat-white` and verify:
- Page renders (200, not 404)
- Main image and gallery show the real cat photos in white
- Price reads `Rs 2,190`
- Size buttons render (S/M/L/XL)
- "📏 Size Chart" link is present on the same row as "Size:"
- Clicking the link opens the size-chart modal
- Stock chip shows "In stock"

Also visit `http://localhost:3000/categories` — only `Cat` and `Dino` tiles should appear.

---

## Task 8: Push and verify on production

- [ ] **Step 1: Push develop**

```bash
git push origin develop
```

This triggers a Preview build on Vercel (which runs `prisma migrate deploy && tsx prisma/seed.ts && next build`; seed will skip because the DB now has data; build serves the new catalog).

- [ ] **Step 2: Wait for the Preview deploy to succeed**

Watch in the Vercel dashboard. If it fails: paste the failing log into a new conversation and debug.

- [ ] **Step 3: Smoke-test the Preview URL**

On the Preview URL Vercel gives you (looks like `ecom-app-<hash>-...vercel.app`):
- `/categories` → only Cat and Dino
- `/products/cat-white` → real photos, size chart link works
- `/categories/cat` → 3 cat products
- `/categories/dino` → 3 dino products
- `/deals` → empty state (since no products carry an `originalPrice` anymore — confirm the empty-state UI is acceptable; if not, treat as a follow-up item)

- [ ] **Step 4: Promote to production**

```bash
git checkout main
git pull
git merge develop
git push origin main
git checkout develop
```

Vercel rebuilds `main` and the new catalog goes live at `https://dressingbear.com`.

- [ ] **Step 5: Smoke-test production**

Same checks as Step 3, but on `https://dressingbear.com`. Done.

---

## Self-review checklist (run after writing the plan)

- ✅ Spec coverage: every spec section maps to at least one task — catalog (T2), images (T1), seed change (T3), size chart UI (T4–5), cleanup (T6), reseed (T7), deploy (T8).
- ✅ No placeholders: all code blocks contain real code; no "TODO" / "TBD".
- ✅ Type consistency: `SizeChartDialog` is named identically in T4 (definition) and T5 (import + use).
- ✅ Image paths: every `image:` field in `mock.ts` (T2) matches a path created in T1.
- ✅ Verification commands: every code task ends with `npx tsc --noEmit` or `npm run build`. Operational tasks end with explicit DB / URL checks.
