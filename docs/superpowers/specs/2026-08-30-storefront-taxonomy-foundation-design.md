# Storefront Taxonomy Foundation — Design

**Date:** 2026-08-30
**Status:** Approved for planning
**Source design:** Claude Design project `d904cb16-b993-4d2e-ae78-3b58508384a5`
("Ecom-app-v1 setup"), file `Dressing Bear Storefront.dc.html`

## 1. Purpose

The storefront canvas introduces a **product taxonomy the codebase does not
have**: departments (Men, Women, Plain T-Shirts, Accessories), an optional
sub-category per department ("Oversized Graphic T-Shirts"), and a third level
of designs (Cats, Dino, Snoopy, ...). Today `Category` is a flat, single-level
model and the existing categories *are* the design motifs.

This spec covers **only the taxonomy foundation** — schema, migration, seed,
routing and redirects. Every other part of the canvas reads this taxonomy and
is deliberately out of scope (§9).

## 2. Prior art and what is NOT in scope

The design project also contains `design_handoff_home_conversion_refresh/`.
That bundle is **already implemented and merged** (`f08f29c`, archived under
`openspec/archive/2026-08-19-home-conversion-refresh/`). Its marquee, social
proof strip, deals countdown and card signals are live. It is history, not a
request, and nothing in it is re-opened here.

### Brand colour: the canvas is stale, the repo wins

`Dressing Bear Storefront.dc.html` declares `--brand: oklch(0.51 0.085 125)`
— the **old olive**. The repo ships terracotta `oklch(0.55 0.08 52)`,
deliberately darkened from the logo's `#b27657` (which measured 3.43:1 and
failed WCAG AA) so that brand-as-body-text reaches 4.59:1. See the comment
block in `app/globals.css` and `4c0de12`.

**Decision:** keep the shipped terracotta. The canvas predates the brand
change on this token; reverting would undo a documented accessibility fix and
contradict the handoff's own Change 1. No `--brand` edit is part of this work.

### The canvas's product data is filler

`PRODUCTS` in the prototype is generated procedurally
(`price: 2090 + (h % 5) * 100`, `rating: 4.4 + (h % 6) / 10`). It is not a
catalog. Only the **taxonomy** (department names, design names, tint hexes,
and the Snoopy front/back print split) is treated as real input.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Taxonomy is a real catalog expansion, migrate the schema | Confirmed with the product owner; departments are genuine, not scaffolding |
| 2 | Separate `Design` model, not a promoted `DtfDesign` | `DtfDesign` is an inventory pool (quantity, decremented at checkout). Coupling browse to print stock would let a depleted pool delete a category page, and plain/accessories have no pool at all (`dtfDesignId` is nullable) |
| 3 | Nested URLs: `/categories/{dept}/{design}` | Each level becomes an indexable landing page and breadcrumbs derive from the path. Preserves the SEO posture of today's `/categories/[slug]` |
| 4 | Rename `Category` → `Design`, add `Department` above | The existing rows already *are* designs (`cat`, `dino`, `bear` map 1:1 onto the canvas `DESIGN_HEX`). A rename plus a parent is strictly less destructive than a drop-and-recreate, with an identical end state |
| 5 | Sub-category is a column, not a table | Each department has at most one, it never appears in a URL, and it is used only in the breadcrumb and as a filter-tree header |
| 6 | Existing slugs (`cat`, `dino`) are NOT renamed | The path changes regardless; not renaming holds the redirect surface at one row per design instead of two hops. Display names change independently |

## 4. Data model

```prisma
model Department {
  slug      String  @id           // women, men, plain, accessories
  name      String                // "Plain T-Shirts (Unisex)"
  navLabel  String                // "Plain Tees"
  tileName  String                // "Plain T-Shirts"
  note      String?               // "Unisex"
  subName   String?               // "Oversized Graphic T-Shirts"
  hex       String                // "#EFC4C4"
  sortOrder Int     @default(0)

  designs     Design[]
  products    Product[]
  slugHistory DepartmentSlugHistory[]
}

model Design {
  slug           String  @id      // cat, dino, snoopy
  name           String           // "Cats"
  departmentSlug String
  image          String
  hex            String
  sortOrder      Int     @default(0)
  dtfDesignId    String?          // optional link to the inventory pool

  department  Department          @relation(fields: [departmentSlug], references: [slug])
  dtfDesign   DtfDesign?          @relation(fields: [dtfDesignId], references: [id], onDelete: SetNull)
  products    Product[]
  slugHistory DesignSlugHistory[]

  @@index([departmentSlug])
}
```

`Product` gains `departmentSlug` (required) and `designSlug` (nullable —
accessories and plain tees may have no design). `Product.categorySlug` is
renamed to `designSlug`.

### Derived, not stored

Two behaviours are computed rather than persisted, matching what the canvas
itself computes:

- a department shows a **nav dropdown** when `designs.length > 0`
- a department appears in **"Shop by design"** when
  `subName != null && designs.length > 0`

Storing these as flags would allow them to drift out of sync with the data
that actually drives them.

## 5. Redirects

`CategorySlugHistory` becomes `DesignSlugHistory` with its FK and
`onUpdate: Cascade` **unchanged**. That cascade is load-bearing: per the
comment at `app/admin/categories/actions.ts:80`, renaming a category rewrites
every historical redirect automatically. Storing a full path string would
forfeit it.

The nested path is **never stored** — it is derived at read time:

```ts
export async function getDesignPathRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.designSlugHistory.findUnique({
    where: { oldSlug },
    select: { design: { select: { slug: true, departmentSlug: true } } },
  });
  return row ? `/categories/${row.design.departmentSlug}/${row.design.slug}` : null;
}
```

**Consequence — the design slug is authoritative for two-segment URLs.** If
`/categories/men/cat` is requested but Cats lives under Women, the design
resolves and the canonical path is rebuilt from its *current* department.
Moving a design between departments therefore needs no history rows; the
redirect simply starts being correct.

`DepartmentSlugHistory` mirrors the same shape for department renames.

### Resolution order

`/categories/[...slug]` replaces `/categories/[slug]`.

**One segment:**
1. current department → render department page
2. department history → 301 to `/categories/{currentDept}`
3. design history → 301 to `/categories/{dept}/{design}`
4. otherwise `notFound()`

**Two segments** (`{dept}/{design}`):
1. design resolves (current slug, then history) → if `dept` segment does not
   match the design's current department, 301 to the canonical path;
   otherwise render
2. otherwise `notFound()`

Redirects use `permanentRedirect` (308), matching today's behaviour in
`app/categories/[slug]/page.tsx`.

## 6. Migration

A single migration, ordered so no step reads a column it has not yet created:

1. `CREATE TABLE "Department"`; insert the four rows
2. `CREATE TABLE "DepartmentSlugHistory"`
3. `ALTER TABLE "Category" RENAME TO "Design"`;
   `ALTER TABLE "CategorySlugHistory" RENAME TO "DesignSlugHistory"`
4. Add `Design.departmentSlug`, `hex`, `sortOrder`, `dtfDesignId` (nullable first)
5. Backfill `departmentSlug = 'women'` for `cat` and `dino` — both are
   women's graphic tees — and set `hex` from the seeded tint constants
6. `ALTER TABLE "Product" RENAME COLUMN "categorySlug" TO "designSlug"`;
   add `departmentSlug`; backfill via the design join
7. Apply `NOT NULL`, foreign keys and indexes

Steps 5–6 are the only data-dependent operations. With two categories and two
products in the seed they are trivially reversible.

## 7. Seed

`prisma/seed.ts` gains the four departments and the ~21 designs, with names,
tints and sort order taken from the canvas's `DEPTS`, `GRAPHIC` and
`DESIGN_HEX` maps. The Snoopy front/back split (`PRINTS`) is represented as
two products under one design, not two designs.

The existing guard at `prisma/seed.ts:76` counts categories to decide whether
to skip; it moves to counting departments. `FORCE_SEED=true` behaviour is
unchanged.

## 8. Tints and contrast

Hex values are stored on `Department.hex` / `Design.hex` so they become
admin-editable later. The canonical defaults live in a single TypeScript
module imported by **both** the seed and the contrast checker, so the two can
never disagree.

The computed helpers stay in `app/_lib/category-tint.ts` (renamed to
`taxonomy-tint.ts`): `INK_DARK`, `INK_LIGHT`, `relativeLuminance`, and the
hash fallback for a missing hex.

`INK_DARK` stays `#332d26`. Its comment records that it was darkened from the
handoff's `#3a332c` so `bear #C4906E` clears AA at 4.90:1; Accessories reuses
that exact hex, so all four department tints are already covered.

**The ~20 new design tints have never been contrast-checked.** Most are light
pastels that will pass against dark ink, but `Cap #8E7A66` is materially
darker than anything in the current palette, needs `INK_LIGHT`, and may not
clear 4.5:1 either way.

`scripts/check-contrast.ts` currently parses `oklch()` pairs out of the
`:root` block in `app/globals.css` and has no notion of hex tints. It gains a
second pass that iterates every seeded tint, picks ink by luminance exactly as
the runtime does, and exits non-zero on any pair below 4.5:1. **Any tint that
fails is adjusted, not shipped as drawn.**

Known limitation: the gate covers seeded defaults. Once tints are
admin-editable, an admin could save a failing colour — so the admin action
validates contrast at save time. That admin UI is out of scope here; until it
exists, the seed is the only writer.

## 9. Out of scope

These read the taxonomy and are separate changes, each unblocked once this
lands. They are independent of one another:

- **B. Home sections** — "Shop by category" department cards and the new
  "Shop by design" grouped grid
- **C. Header mega-menu** — per-department hover dropdowns
- **D. Browse filter tree** — indented hierarchy with counts and breadcrumb
- **E. PDP and cards** — `dept › sub` breadcrumb, card sub-labels,
  photo/no-photo tile fallback

The canvas auto-rotates department and design tiles on a 3.8s interval. When
B is specced, that rotation needs a reduced-motion design that keeps every
slide *reachable* (dots remain operable), not merely frozen — the same class
of bug fixed for the marquee at `39ef139`.

## 10. Testing

**Unit (Vitest)**
- path derivation for a design under its department
- two-segment request with a mismatched department segment redirects to canonical
- one-segment resolution order: department before department-history before design-history
- unknown slug at either arity returns not-found rather than a malformed redirect
- ink selection for every seeded tint matches the luminance threshold
- derived `showsNavDropdown` / `showsInDesignSection` for a department with
  and without `subName` and with and without designs

**Migration**
- against a database seeded with the pre-migration schema, assert `cat` and
  `dino` land under `women`, `Product.designSlug` retains its old value, and
  `Product.departmentSlug` is populated for every row

**Contrast**
- `npm run check:contrast` covers all four department tints and all ~21 design
  tints and fails on any pair below AA

**E2E (Playwright)**
- `/categories/cat` (a live indexed URL) 308s to `/categories/women/cat`
- `/categories/women` renders the department page
- `/categories/women/cat` renders the design page

## 11. Validation

Per `CLAUDE.md`: `npm run build`, `npm run test`, `npm run check:contrast`,
and `npm run test:e2e` for the redirect flows. The migration is applied with
`npm run db:migrate` locally and `npm run db:deploy` in the deploy script.
