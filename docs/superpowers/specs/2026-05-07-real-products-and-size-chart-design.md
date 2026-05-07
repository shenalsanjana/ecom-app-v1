# Real product catalog + size chart — design

Date: 2026-05-07
Status: approved (pending user review of this written spec)

## Goal

Replace all demo seed data with the real Dressing Bear oversize T-shirt catalog and add a size chart to the product detail page.

The current seed has 3 placeholder categories and 12 invented products (`app/_data/mock.ts`). Real product photography lives at `media/oversize/girls/<color>/` and a size chart at `media/oversize/size-chart.jpg`. Production currently shows the placeholder catalog at https://dressingbear.com.

## Non-goals

- Color variants on a single product (each color is a separate product — see decision below).
- A `Boys` / `Women` / etc. audience taxonomy (one product line for now).
- A second print design in the database (`Dino` is included; future prints will be added as more products land in their print's existing category).
- Per-size stock tracking (existing schema stores total stock per product; sizes are a comma-separated string).
- Variants schema (no `ProductVariant` table — YAGNI for one product line).

## Decisions

### 1. Color modeling — separate products

Three colors × two prints = six SKUs. Each is its own `Product` row with its own URL, stock, and reviews. Rejected: one product with color/print variants — would require a new `ProductVariant` table, schema migration, and PDP rewrite. Not justified at this scale. Revisit if a second product line lands with the same color set.

### 2. Categories — by print design

Two categories: `cat` and `dino`. Reasoning: each print is the strongest visual identifier and matches how the user described it. The existing category-strip on the home page renders one tile per category — `Cat` and `Dino` will each get their own tile. Old slugs (`oversize-tshirts`, `graphic-tees`, `solid-basics`) are dropped.

### 3. Size chart — shared, modal on PDP

Single `oversize.jpg` chart applies to every oversize tee (chart itself is unisex per the source image). UI: a "Size Chart" link button next to the "Size:" label in `buy-box-client.tsx`, opens a shadcn `Dialog` showing the chart image. Rejected always-visible inline rendering — clutters the buy box, and customers only need it when picking a size.

### 4. Image hosting — copied into `public/`, not served from `media/`

Next.js doesn't serve `media/` as a static directory by default; only `public/` is automatically static. Source files in `media/` have spaces and parentheses in filenames, awkward in URLs. Decision: copy + rename into `public/products/<id>/` (matching the seed's existing `pickProductMain` / `pickGalleryImage` conventions) and `public/size-charts/oversize.jpg`.

### 5. Seed wipe — `FORCE_SEED=true` on the shared production DB

`prisma/seed.ts` already skips when `category.count() > 0`. To replace the existing demo catalog in Prisma Postgres, run the seed with `FORCE_SEED=true` once locally (the local `.env.local` points at the same Prisma Postgres database that production uses, so this writes to prod). User has acknowledged that the only data in the DB right now is demo data, so a destructive reseed is acceptable.

This is a one-time operation. After real customer orders exist in the DB, future seed-replays must run against an isolated dev branch on Prisma Postgres, not production. Out of scope for this spec.

## Catalog

All six products: oversize fit, 220 GSM, unisex sizing, sizes `S,M,L,XL`, price Rs. 2190, no discount, default stock 30, category as noted.

| ID | Name | Category | Color | Source photos |
|---|---|---|---|---|
| `cat-white` | Oversize Cat T-Shirt — White | `cat` | White | `white/Untitled design (7,8,9).jpg` |
| `cat-ivory` | Oversize Cat T-Shirt — Ivory | `cat` | Ivory | `ivory/Template 01 (12,14,16).jpg` |
| `cat-baby-pink` | Oversize Cat T-Shirt — Baby Pink | `cat` | Baby Pink | `baby-pink/Template 01 (6,7,8).jpg` |
| `dino-white` | Oversize Dino T-Shirt — White | `dino` | White | `white/Untitled design (10,11,12).jpg` |
| `dino-ivory` | Oversize Dino T-Shirt — Ivory | `dino` | Ivory | `ivory/Template 01 (13,15,17).jpg` |
| `dino-baby-pink` | Oversize Dino T-Shirt — Baby Pink | `dino` | Baby Pink | `baby-pink/Template 01 (9,10,11).jpg` |

Note on ivory: the 6 photos in the ivory folder are interleaved (cat, dino, cat, dino, cat, dino) rather than first-half/second-half. White and baby-pink follow the simpler split.

For each product, three photos go to `public/products/<id>/`:
- `main.jpg` — composite front+back where available, else the back-full shot
- `1.jpg`, `2.jpg` — the remaining two photos in the gallery

Categories use one of their products' main photos as the category-tile image:
- `cat` → `/products/cat-white/main.jpg` (representative)
- `dino` → `/products/dino-white/main.jpg`

Description (markdown, used by all 6 products with the print/color name substituted):

```
# {name}

A 220 GSM heavyweight oversize T-shirt, unisex fit. Soft cotton, drop-shoulder
silhouette, with our {Cat|Dino} print on front (small) and back (large).

## Details

- Fabric: 220 GSM cotton, heavyweight oversize
- Fit: Unisex, drop shoulder
- Print: {Cat|Dino} graphic, front + back
- Care: Machine wash cold, inside out. Tumble dry low.

See the size chart for measurements.
```

## Size chart UI

**Trigger.** In `app/_components/product/buy-box-client.tsx`, the existing size-selector header (line ~124) is currently:

```tsx
<div className="flex items-center gap-2">
  <span className="text-sm font-medium">Size:</span>
  <span className="text-sm text-muted-foreground">{selectedSize || "Select a size"}</span>
</div>
```

Add a right-aligned "Size Chart" link to that row that opens a `Dialog`:

```
[Size:  Select a size                      [Size Chart →]]
[ S ] [ M ] [ L ] [ XL ]
```

**Modal content.** A shadcn `Dialog` containing:
- Title: "Oversize T-shirt size chart"
- Caption: "Inches, ±0.5\". Unisex sizing."
- Single `<Image>` of `/size-charts/oversize.jpg` at full container width

The trigger only renders when the product has sizes (existing `sizeList.length > 0` condition). Reuses shadcn primitives already in the project (`@/components/ui/dialog` — verified present).

## File changes

| File | Change |
|---|---|
| `app/_data/mock.ts` | Replace categories + products with the 6 above |
| `app/_components/product/buy-box-client.tsx` | Add `SizeChartDialog` import + render trigger near "Size:" label |
| `app/_components/product/size-chart-dialog.tsx` | **New** — small client component wrapping shadcn Dialog with the chart image |
| `public/products/<id>/main.jpg`, `1.jpg`, `2.jpg` | **New** — 6 product folders, 18 photos |
| `public/size-charts/oversize.jpg` | **New** — copied from `media/` |
| `public/products/p1` … `p8`, `d1` … `d4` | **Delete** — old demo image folders (cleanup) |

No schema change. No migration. `prisma/seed.ts` is unchanged in code — the new mock data flows through the existing seed loop. The `Product.sizes` default of `"S,M,L,XL"` matches the size chart.

## Migration steps (operational, not part of the implementation plan)

1. Copy the 18 product photos from `media/oversize/girls/<color>/` to `public/products/<id>/` with the renames above.
2. Copy `media/oversize/size-chart.jpg` → `public/size-charts/oversize.jpg`.
3. Update `app/_data/mock.ts`.
4. Add `size-chart-dialog.tsx` and wire it into `buy-box-client.tsx`.
5. Remove the obsolete `public/products/p*` and `public/products/d*` folders.
6. Verify locally with `npm run build`.
7. Run `FORCE_SEED=true npx tsx prisma/seed.ts` against Prisma Postgres to replace demo data with real catalog.
8. Commit, push develop, merge to main → Vercel deploys.

## Risks & guardrails

- **Photo-to-product mapping uncertainty.** The interleaved ivory ordering was inferred by visual inspection. If any photo is on the wrong product after seed, fix is a file-rename — not a code change. We note expected mapping in the seed log so post-seed verification is fast.
- **Destructive seed against shared DB.** Documented above. Acceptable because there is no real customer data yet. Future change: get a dev branch on Prisma Postgres before the next destructive operation.
- **Size chart image weight.** The source JPEG is large (full-page graphic). Next/Image will optimize it on the fly; we serve from `public/`, so it gets the standard image-optimization pipeline. No special handling needed.

## Out of scope (future work)

- Adding more print designs, colors, or product lines (additive — just more rows in `mock.ts`)
- Per-size stock tracking
- A second size chart (e.g. for a regular-fit line, when one exists)
- A category-specific size chart (one chart fits all oversize products today)
