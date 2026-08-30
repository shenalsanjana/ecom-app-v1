# Storefront Taxonomy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `Category` model with a two-level Department → Design taxonomy, migrate the two live categories into it, and serve nested `/categories/{dept}/{design}` URLs without breaking the indexed URLs that exist today.

**Architecture:** `Category` is renamed to `Design` (its rows already *are* design motifs) and gains a `Department` parent. Nested paths are never stored — they are derived by joining a design to its department, which keeps the existing `onUpdate: Cascade` slug-history machinery intact. Route resolution is a pure function tested independently of Next.js.

**Tech Stack:** Next.js 16 (App Router, server components), Prisma + PostgreSQL, Vitest, Playwright, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-30-storefront-taxonomy-foundation-design.md`

## Global Constraints

- **Do not touch `--brand`.** The canvas declares the old olive `oklch(0.51 0.085 125)`; the repo's terracotta `oklch(0.55 0.08 52)` is correct and stays. See spec §2.
- **`Cap` is seeded as `#A59585`, never the canvas's `#8E7A66`** (3.51:1, fails AA).
- **Never reimplement `inkFor`.** Import it. A luminance threshold would send `dino` and `bear` to light ink at 1.73:1 and 2.38:1.
- Every task ends green: `npm run build` and `npm run test` pass before the commit.
- Existing slugs `cat` and `dino` are **not** renamed.
- Prisma provider is `postgresql`; API routes touching Prisma use the `nodejs` runtime.
- Commits follow Conventional Commits per `openspec/COMMIT_PROCESS.md`.

## File Structure

| File | Responsibility |
|---|---|
| `app/_lib/taxonomy-tint.ts` (rename of `category-tint.ts`) | Tint tables for departments + designs, ink selection, contrast maths |
| `app/_lib/taxonomy-tint.test.ts` (rename of `category-tint.test.ts`) | Pins every tint and the AA floor |
| `scripts/check-contrast.ts` | Extended with a tint pass that imports `inkFor` |
| `prisma/schema.prisma` | `Department`, `Design`, `DepartmentSlugHistory`, `DesignSlugHistory`, `Product` FKs |
| `prisma/migrations/20260830120000_taxonomy_foundation/migration.sql` | Hand-written rename-preserving migration |
| `prisma/seed.ts` | 4 departments, 23 designs |
| `app/_lib/taxonomy.ts` | Reads: departments, designs, path derivation, redirect resolvers |
| `app/_lib/taxonomy-route.ts` | Pure route resolution (segments → render \| redirect \| notFound) |
| `app/_lib/__tests__/taxonomy-route.test.ts` | Resolution-order tests |
| `app/categories/[...slug]/page.tsx` (replaces `[slug]`) | Renders department or design pages |

---

### Task 1: Taxonomy tint module

**Files:**
- Rename: `app/_lib/category-tint.ts` → `app/_lib/taxonomy-tint.ts`
- Rename: `app/_lib/category-tint.test.ts` → `app/_lib/taxonomy-tint.test.ts`
- Modify: `app/_components/home/category-strip.tsx` (import path only)

**Interfaces:**
- Consumes: nothing.
- Produces: `DEPARTMENT_TINTS: Record<string,string>`, `DESIGN_TINTS: Record<string,string>`, `ALL_TINTS: Record<string,string>`, `TINT_PALETTE: readonly string[]`, `INK_DARK`, `INK_LIGHT`, `tintForSlug(slug: string): string`, `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`, `inkFor(bgHex: string): string`.

`contrastRatio` is a **new export** — the module's `contrast` is currently private and Task 2 needs it.

- [ ] **Step 1: Rename both files, preserving history**

```bash
git mv app/_lib/category-tint.ts app/_lib/taxonomy-tint.ts
git mv app/_lib/category-tint.test.ts app/_lib/taxonomy-tint.test.ts
sed -i 's#"./category-tint"#"./taxonomy-tint"#' app/_lib/taxonomy-tint.test.ts
sed -i 's#_lib/category-tint#_lib/taxonomy-tint#' app/_components/home/category-strip.tsx
```

- [ ] **Step 2: Write the failing tests**

The sed in Step 1 rewrites the import path but leaves `CATEGORY_TINTS` in the
import list, which no longer exists. **Replace the whole import block** at the
top of `app/_lib/taxonomy-tint.test.ts` with:

```ts
import {
  DEPARTMENT_TINTS,
  DESIGN_TINTS,
  ALL_TINTS,
  TINT_PALETTE,
  tintForSlug,
  relativeLuminance,
  contrastRatio,
  inkFor,
  INK_DARK,
  INK_LIGHT,
} from "./taxonomy-tint";
```

The file has a local `contrast` helper duplicating the new `contrastRatio`
export; delete the local one and use the import.

Then append:

```ts
describe("taxonomy tints", () => {
  it("defines all four departments", () => {
    expect(Object.keys(DEPARTMENT_TINTS).sort()).toEqual(
      ["accessories", "men", "plain", "women"],
    );
  });

  it("defines all 23 designs", () => {
    expect(Object.keys(DESIGN_TINTS)).toHaveLength(23);
  });

  it("keeps the two shipped design tints unchanged", () => {
    expect(DESIGN_TINTS.cat).toBe("#EFC4C4");
    expect(DESIGN_TINTS.dino).toBe("#AEBBA0");
  });

  it("seeds Cap lightened to clear AA, not the canvas value", () => {
    expect(DESIGN_TINTS.cap).toBe("#A59585");
    expect(DESIGN_TINTS.cap).not.toBe("#8E7A66");
  });

  it("clears WCAG AA for every tint using the ink the runtime picks", () => {
    const failures = Object.entries(ALL_TINTS)
      .map(([slug, hex]) => [slug, hex, contrastRatio(inkFor(hex), hex)] as const)
      .filter(([, , ratio]) => ratio < 4.5);
    expect(failures).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run app/_lib/taxonomy-tint.test.ts`
Expected: FAIL — `DEPARTMENT_TINTS` is not exported.

- [ ] **Step 4: Implement**

Replace the `CATEGORY_TINTS` block in `app/_lib/taxonomy-tint.ts` with:

```ts
/** Department tile tints, from the storefront canvas `DEPTS`. */
export const DEPARTMENT_TINTS: Record<string, string> = {
  men: "#B7C7D6",
  women: "#EFC4C4",
  plain: "#DEDAD2",
  accessories: "#C4906E",
};

/**
 * Design tile tints, from the canvas `DESIGN_HEX`.
 *
 * `cap` deliberately departs from the canvas. `#8E7A66` reaches only 3.51:1
 * against INK_LIGHT and 3.32:1 against INK_DARK — no ink choice clears AA.
 * Lightened to #A59585 (4.69:1 against INK_DARK), which also keeps it
 * consistent with every other tint resolving to dark ink. See spec §8.
 */
export const DESIGN_TINTS: Record<string, string> = {
  // women
  bear: "#C4906E", cat: "#EFC4C4", dino: "#AEBBA0", dog: "#D9B99B",
  feathers: "#CBBBD6", heart: "#E9AFB4", "just-grow": "#BFC7A6",
  looney: "#E5C98F", panda: "#DEDAD2", penguin: "#B7C7D6",
  sealovers: "#9FBFC4", snoopy: "#E4DCC6", stitch: "#A8C0D8",
  butterfly: "#D8C0DA", love: "#E7B7B7", paris: "#DCC9B0",
  // men
  car: "#AEC3D1", simpsons: "#E8CE7A",
  // plain
  oversized: "#D3CCC0", regular: "#B9BFB2",
  // accessories
  tote: "#C9B79A", cap: "#A59585", socks: "#D6C7B8",
};

export const ALL_TINTS: Record<string, string> = { ...DEPARTMENT_TINTS, ...DESIGN_TINTS };

export const TINT_PALETTE = Object.values(DESIGN_TINTS) as readonly string[];
```

Change `tintForSlug` to read `ALL_TINTS[slug]`, and export the ratio helper:

```ts
/** WCAG contrast ratio between two `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
```

Delete the private `contrast` and have `inkFor` call `contrastRatio`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/_lib/taxonomy-tint.test.ts`
Expected: PASS. The pre-existing `tintForSlug` cases still pass — `cat`, `dino` and `bear` keep their values; `retro`, `wave` and `nature` are gone from the named table, so if those assertions exist, change them to `expect(TINT_PALETTE).toContain(tintForSlug("retro"))`.

- [ ] **Step 6: Full suite and commit**

```bash
npm run test && npm run build
git add -A
git commit -m "refactor(taxonomy): extend tints to departments and 23 designs

Renames category-tint to taxonomy-tint, adds the four department tints and
all 23 design tints from the storefront canvas, and exports contrastRatio so
the contrast gate can import ink selection instead of reimplementing it.

Cap ships as #A59585 rather than the canvas's #8E7A66, which reaches only
3.51:1 against either ink."
```

---

### Task 2: Contrast gate over every tint

**Files:**
- Modify: `scripts/check-contrast.ts`

**Interfaces:**
- Consumes: `ALL_TINTS`, `inkFor`, `contrastRatio` from Task 1.
- Produces: `npm run check:contrast` now fails on any tint below AA.

- [ ] **Step 1: Add the tint pass**

The script currently parses `oklch()` pairs from `app/globals.css`. Append a second pass before the final exit. Import at the top:

```ts
import { ALL_TINTS, inkFor, contrastRatio, INK_DARK } from "../app/_lib/taxonomy-tint";
```

Then, before the process exits:

```ts
console.log("\nTile tints (ink chosen by inkFor, as the runtime does):");
let tintFailures = 0;
for (const [slug, hex] of Object.entries(ALL_TINTS)) {
  const ink = inkFor(hex);
  const ratio = contrastRatio(ink, hex);
  const ok = ratio >= 4.5;
  if (!ok) tintFailures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"} ${slug.padEnd(12)} ${hex} ` +
    `ink=${ink === INK_DARK ? "dark" : "light"} ${ratio.toFixed(2)}:1`,
  );
}
if (tintFailures > 0) {
  console.error(`\n${tintFailures} tint(s) below WCAG AA 4.5:1`);
  failures += tintFailures;
}
```

Use whatever failure accumulator the existing script already has; do not introduce a second exit path.

- [ ] **Step 2: Verify it passes**

Run: `npm run check:contrast`
Expected: exit 0, and 27 tint lines all `PASS`, worst being `bear`/`accessories` at 4.90:1.

- [ ] **Step 3: Verify it actually catches a regression**

```bash
sed -i 's/cap: "#A59585"/cap: "#8E7A66"/' app/_lib/taxonomy-tint.ts
npm run check:contrast; echo "exit=$?"
```

Expected: `FAIL cap ... 3.51:1` and `exit=1`. **Then revert:**

```bash
git checkout app/_lib/taxonomy-tint.ts
```

A gate that has never been seen to fail is not a gate.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-contrast.ts
git commit -m "test(contrast): gate all department and design tints at AA

Extends check:contrast with a tint pass that imports inkFor rather than
reimplementing ink selection, so it cannot drift from runtime behaviour.
Verified to fail on the canvas's Cap value (3.51:1) before reverting."
```

---

### Task 3: Schema, migration, and consumer rename

**This task is deliberately large and cannot be split.** Renaming `Product.categorySlug` changes the generated Prisma client, so every one of the 21 consumers stops compiling the moment the schema changes. A reviewer cannot approve the schema while rejecting the rename — the build would not compile between them.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260830120000_taxonomy_foundation/migration.sql`
- Modify (mechanical rename): `app/_lib/products.ts`, `app/_lib/admin-products.ts`, `app/admin/products/actions.ts`, `app/admin/categories/actions.ts`, `app/api/search/route.ts`, `app/search/page.tsx`, `app/products/[id]/page.tsx`, `app/categories/page.tsx`, `app/_components/admin/products/product-form.tsx`, `app/_components/home/category-strip.tsx`, `app/_components/home/site-footer.tsx`, `app/_components/product/breadcrumb.tsx`, `app/_components/analytics/track-category-view.tsx`, `app/admin/products/[id]/edit/page.tsx`, `app/admin/products/new/page.tsx`, `scripts/generate-product-reviews.ts`, `scripts/measure-queries.ts`, `scripts/update-review-content.ts`
- Modify (tests): `app/admin/categories/__tests__/actions.test.ts`, `app/admin/products/__tests__/actions.test.ts`, `app/_lib/__tests__/admin-products.test.ts`, `app/_lib/__tests__/products-archived-filter.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: Prisma models `Department`, `Design`, `DepartmentSlugHistory`, `DesignSlugHistory`; `Product.designSlug: string`, `Product.departmentSlug: string`; `Design.departmentSlug`, `Design.hex`, `Design.image: string | null`.

- [ ] **Step 1: Update `prisma/schema.prisma`**

Replace `model Category` and `model CategorySlugHistory` with:

```prisma
model Department {
  slug      String  @id
  name      String
  navLabel  String
  tileName  String
  note      String?
  subName   String?
  hex       String
  sortOrder Int     @default(0)

  designs     Design[]
  products    Product[]
  slugHistory DepartmentSlugHistory[]
}

model DepartmentSlugHistory {
  oldSlug     String     @id
  currentSlug String
  department  Department @relation(fields: [currentSlug], references: [slug], onDelete: Cascade, onUpdate: Cascade)

  @@index([currentSlug])
}

model Design {
  slug           String  @id
  name           String
  departmentSlug String
  image          String?
  hex            String
  sortOrder      Int     @default(0)
  dtfDesignId    String?

  department  Department          @relation(fields: [departmentSlug], references: [slug])
  dtfDesign   DtfDesign?          @relation(fields: [dtfDesignId], references: [id], onDelete: SetNull)
  products    Product[]
  slugHistory DesignSlugHistory[]

  @@index([departmentSlug])
}

model DesignSlugHistory {
  oldSlug     String @id
  currentSlug String
  design      Design @relation(fields: [currentSlug], references: [slug], onDelete: Cascade, onUpdate: Cascade)

  @@index([currentSlug])
}
```

In `model Product`, replace `categorySlug String` with:

```prisma
  designSlug     String
  departmentSlug String
```

and replace the `category` relation with:

```prisma
  design     Design     @relation(fields: [designSlug], references: [slug])
  department Department @relation(fields: [departmentSlug], references: [slug])
```

Update its indexes to `@@index([designSlug])` and `@@index([departmentSlug])`.

Add to `model DtfDesign`: `designs Design[]`.

- [ ] **Step 2: Create the migration WITHOUT letting Prisma generate it**

Prisma infers a rename as drop-and-create, which would destroy the two live categories and every product FK. Create the directory and write the SQL by hand:

```bash
mkdir -p prisma/migrations/20260830120000_taxonomy_foundation
```

Write `prisma/migrations/20260830120000_taxonomy_foundation/migration.sql`:

```sql
-- Departments
CREATE TABLE "Department" (
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "navLabel" TEXT NOT NULL,
  "tileName" TEXT NOT NULL,
  "note" TEXT,
  "subName" TEXT,
  "hex" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("slug")
);

INSERT INTO "Department" ("slug","name","navLabel","tileName","note","subName","hex","sortOrder") VALUES
  ('men','Men','Men','Men',NULL,'Oversized Graphic T-Shirts','#B7C7D6',0),
  ('women','Women','Women','Women',NULL,'Oversized Graphic T-Shirts','#EFC4C4',1),
  ('plain','Plain T-Shirts (Unisex)','Plain Tees','Plain T-Shirts','Unisex',NULL,'#DEDAD2',2),
  ('accessories','Accessories','Accessories','Accessories',NULL,NULL,'#C4906E',3);

CREATE TABLE "DepartmentSlugHistory" (
  "oldSlug" TEXT NOT NULL,
  "currentSlug" TEXT NOT NULL,
  CONSTRAINT "DepartmentSlugHistory_pkey" PRIMARY KEY ("oldSlug")
);
CREATE INDEX "DepartmentSlugHistory_currentSlug_idx" ON "DepartmentSlugHistory"("currentSlug");
ALTER TABLE "DepartmentSlugHistory"
  ADD CONSTRAINT "DepartmentSlugHistory_currentSlug_fkey"
  FOREIGN KEY ("currentSlug") REFERENCES "Department"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- Category -> Design (rename, preserving rows and the slug-history cascade)
ALTER TABLE "Category" RENAME TO "Design";
ALTER TABLE "CategorySlugHistory" RENAME TO "DesignSlugHistory";
ALTER TABLE "Design" RENAME CONSTRAINT "Category_pkey" TO "Design_pkey";
ALTER TABLE "DesignSlugHistory" RENAME CONSTRAINT "CategorySlugHistory_pkey" TO "DesignSlugHistory_pkey";
ALTER TABLE "DesignSlugHistory" RENAME CONSTRAINT "CategorySlugHistory_currentSlug_fkey" TO "DesignSlugHistory_currentSlug_fkey";
ALTER INDEX "CategorySlugHistory_currentSlug_idx" RENAME TO "DesignSlugHistory_currentSlug_idx";

ALTER TABLE "Design" ALTER COLUMN "image" DROP NOT NULL;
ALTER TABLE "Design" ADD COLUMN "departmentSlug" TEXT;
ALTER TABLE "Design" ADD COLUMN "hex" TEXT;
ALTER TABLE "Design" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Design" ADD COLUMN "dtfDesignId" TEXT;

-- Existing categories are women's graphic-tee designs
UPDATE "Design" SET "departmentSlug" = 'women' WHERE "departmentSlug" IS NULL;
UPDATE "Design" SET "hex" = '#EFC4C4' WHERE "slug" = 'cat';
UPDATE "Design" SET "hex" = '#AEBBA0' WHERE "slug" = 'dino';
UPDATE "Design" SET "hex" = '#EFC4C4' WHERE "hex" IS NULL;

ALTER TABLE "Design" ALTER COLUMN "departmentSlug" SET NOT NULL;
ALTER TABLE "Design" ALTER COLUMN "hex" SET NOT NULL;
CREATE INDEX "Design_departmentSlug_idx" ON "Design"("departmentSlug");
ALTER TABLE "Design"
  ADD CONSTRAINT "Design_departmentSlug_fkey"
  FOREIGN KEY ("departmentSlug") REFERENCES "Department"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Design"
  ADD CONSTRAINT "Design_dtfDesignId_fkey"
  FOREIGN KEY ("dtfDesignId") REFERENCES "DtfDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Product
ALTER TABLE "Product" RENAME COLUMN "categorySlug" TO "designSlug";
ALTER TABLE "Product" RENAME CONSTRAINT "Product_categorySlug_fkey" TO "Product_designSlug_fkey";
ALTER INDEX "Product_categorySlug_idx" RENAME TO "Product_designSlug_idx";

ALTER TABLE "Product" ADD COLUMN "departmentSlug" TEXT;
UPDATE "Product" p SET "departmentSlug" = d."departmentSlug"
  FROM "Design" d WHERE d."slug" = p."designSlug";
ALTER TABLE "Product" ALTER COLUMN "departmentSlug" SET NOT NULL;
CREATE INDEX "Product_departmentSlug_idx" ON "Product"("departmentSlug");
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_departmentSlug_fkey"
  FOREIGN KEY ("departmentSlug") REFERENCES "Department"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply and verify the data survived**

```bash
npm run db:deploy
npx prisma generate
```

Then confirm the two live rows migrated rather than being recreated:

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const d = await p.design.findMany({ select: { slug: true, name: true, departmentSlug: true, hex: true } });
const pr = await p.product.findMany({ select: { id: true, designSlug: true, departmentSlug: true } });
console.log('designs', d); console.log('products', pr);
await p.\$disconnect();
"
```

Expected: `cat` and `dino` present, both `departmentSlug: 'women'`, hexes `#EFC4C4` / `#AEBBA0`; every product has a non-null `departmentSlug` matching its design's.

- [ ] **Step 4: Rename consumers, driven by the type checker**

```bash
grep -rl "categorySlug" --include=*.ts --include=*.tsx app scripts prisma \
  | xargs sed -i 's/categorySlug/designSlug/g'
npx tsc --noEmit
```

Work the remaining type errors one at a time. Expect these judgement calls the blind rename gets wrong:

- `app/_lib/products.ts` — `CategoryView` is a public type name, not a column. Rename it to `DesignView` and update its importers. Its `image` field becomes `string | null`.
- `app/_lib/products.ts` — `prisma.category` becomes `prisma.design`; `getCategories` becomes `getDesigns`; `GetProductsOptions.categorySlug`/`categorySlugs` become `designSlug`/`designSlugs`.
- `app/admin/categories/actions.ts` — `prisma.categorySlugHistory` becomes `prisma.designSlugHistory`. **Preserve the comment at the `upsert` explaining the `onUpdate: Cascade` behaviour** — it documents why the FK exists.
- Route segment names and user-facing copy ("Categories", "Other Categories") are **not** renamed in this task; the route still lives at `/categories`.

- [ ] **Step 5: Fix the four test files**

Same rename, plus mock keys: `categorySlugHistory` → `designSlugHistory` in `app/admin/categories/__tests__/actions.test.ts:19`.

- [ ] **Step 6: Verify and commit**

```bash
npm run test && npm run build && npm run check:contrast
git add -A
git commit -m "feat(taxonomy)!: add Department above Design, rename Category

Renames Category to Design (its rows already are design motifs) and adds a
Department parent, with a hand-written migration that preserves rows, FKs and
the CategorySlugHistory cascade rather than letting Prisma drop and recreate.

Product.categorySlug becomes designSlug and gains departmentSlug, backfilled
from the design join. Renames the 21 consumers accordingly."
```

---

### Task 4: Seed departments and designs

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `DEPARTMENT_TINTS`, `DESIGN_TINTS` (Task 1); `Department`/`Design` models (Task 3).
- Produces: a database with 4 departments and 23 designs.

- [ ] **Step 1: Add the taxonomy tables**

Import the tints so the seed and the contrast gate cannot disagree:

```ts
import { DEPARTMENT_TINTS, DESIGN_TINTS } from "../app/_lib/taxonomy-tint";

const departments = [
  { slug: "men",   name: "Men",   navLabel: "Men",   tileName: "Men",   note: null, subName: "Oversized Graphic T-Shirts", sortOrder: 0 },
  { slug: "women", name: "Women", navLabel: "Women", tileName: "Women", note: null, subName: "Oversized Graphic T-Shirts", sortOrder: 1 },
  { slug: "plain", name: "Plain T-Shirts (Unisex)", navLabel: "Plain Tees", tileName: "Plain T-Shirts", note: "Unisex", subName: null, sortOrder: 2 },
  { slug: "accessories", name: "Accessories", navLabel: "Accessories", tileName: "Accessories", note: null, subName: null, sortOrder: 3 },
] as const;

/** Design display names and their department. Slugs `cat` and `dino` are the
 *  two that already ship and are deliberately not renamed (spec decision 6). */
const designs = [
  ["bear", "Bear", "women"], ["cat", "Cats", "women"], ["dino", "Dino", "women"],
  ["dog", "Dog", "women"], ["feathers", "Feathers", "women"], ["heart", "Heart", "women"],
  ["just-grow", "Just Grow", "women"], ["looney", "Looney", "women"], ["panda", "Panda", "women"],
  ["penguin", "Penguin", "women"], ["sealovers", "Sealovers", "women"], ["snoopy", "Snoopy", "women"],
  ["stitch", "Stitch", "women"], ["butterfly", "Butterfly", "women"], ["love", "Love", "women"],
  ["paris", "Paris", "women"],
  ["car", "Car", "men"], ["simpsons", "Simpsons", "men"],
  ["oversized", "Oversized", "plain"], ["regular", "Regular", "plain"],
  ["tote", "Tote", "accessories"], ["cap", "Cap", "accessories"], ["socks", "Socks", "accessories"],
] as const satisfies ReadonlyArray<readonly [string, string, string]>;
```

Replace the `// Categories` loop with:

```ts
  for (const d of departments) {
    await prisma.department.upsert({
      where: { slug: d.slug },
      update: { name: d.name, navLabel: d.navLabel, tileName: d.tileName, note: d.note, subName: d.subName, hex: DEPARTMENT_TINTS[d.slug], sortOrder: d.sortOrder },
      create: { slug: d.slug, name: d.name, navLabel: d.navLabel, tileName: d.tileName, note: d.note, subName: d.subName, hex: DEPARTMENT_TINTS[d.slug], sortOrder: d.sortOrder },
    });
  }

  for (const [slug, name, departmentSlug] of designs) {
    const hex = DESIGN_TINTS[slug];
    if (!hex) throw new Error(`[seed] no tint for design "${slug}"`);
    await prisma.design.upsert({
      where: { slug },
      update: { name, departmentSlug, hex },
      create: { slug, name, departmentSlug, hex, image: null },
    });
  }
```

The `throw` matters: a design without a tint would otherwise seed a blank tile that the contrast gate never sees.

- [ ] **Step 2: Move the skip guard onto departments**

At `prisma/seed.ts:76`, replace `prisma.category.count()` with `prisma.department.count()` and update the two log strings from "categories" to "departments". `FORCE_SEED=true` behaviour is unchanged.

- [ ] **Step 3: Update the stale-row cleanup**

The cleanup near `prisma/seed.ts:200` deletes categories not in the seed list. Point it at `prisma.design` and `designs.map(([slug]) => slug)`. **Keep the existing comment** about Product→Category being `RESTRICT`, updating "Category" to "Design"; the constraint still applies.

- [ ] **Step 4: Run and verify**

```bash
FORCE_SEED=true npm run db:seed
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
console.log('departments', await p.department.count());
console.log('designs', await p.design.count());
console.log('orphans', await p.design.count({ where: { department: { is: null } } }).catch(() => 'n/a'));
await p.\$disconnect();
"
```

Expected: `departments 4`, `designs 23`.

- [ ] **Step 5: Commit**

```bash
npm run test && npm run build
git add prisma/seed.ts
git commit -m "feat(taxonomy): seed four departments and 23 designs

Imports tints from taxonomy-tint so the seed and the contrast gate share one
source, and throws on a design with no tint rather than seeding a blank tile.
Skip guard and stale-row cleanup move from categories to departments."
```

---

### Task 5: Taxonomy reads and path derivation

**Files:**
- Create: `app/_lib/taxonomy.ts`
- Create: `app/_lib/__tests__/taxonomy.test.ts`

**Interfaces:**
- Consumes: `Department`/`Design` models (Task 3).
- Produces:
  - `type DepartmentView = { slug, name, navLabel, tileName, note: string|null, subName: string|null, hex, sortOrder, designs: DesignSummary[] }`
  - `type DesignSummary = { slug: string; name: string; hex: string }`
  - `getDepartments(): Promise<DepartmentView[]>`
  - `designPath(departmentSlug: string, designSlug: string): string`
  - `getDesignPathRedirect(oldSlug: string): Promise<string | null>`
  - `getDepartmentSlugRedirect(oldSlug: string): Promise<string | null>`
  - `showsNavDropdown(d: DepartmentView): boolean`
  - `showsInDesignSection(d: DepartmentView): boolean`

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/taxonomy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { designPath, showsNavDropdown, showsInDesignSection } from "../taxonomy";
import type { DepartmentView } from "../taxonomy";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }],
  ...over,
});

describe("designPath", () => {
  it("builds a nested path", () => {
    expect(designPath("women", "cat")).toBe("/categories/women/cat");
  });
});

describe("derived department behaviour", () => {
  it("shows a nav dropdown only when the department has designs", () => {
    expect(showsNavDropdown(dept({}))).toBe(true);
    expect(showsNavDropdown(dept({ designs: [] }))).toBe(false);
  });

  it("shows in the design section only with both a subName and designs", () => {
    expect(showsInDesignSection(dept({}))).toBe(true);
    expect(showsInDesignSection(dept({ subName: null }))).toBe(false);
    expect(showsInDesignSection(dept({ designs: [] }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/_lib/__tests__/taxonomy.test.ts`
Expected: FAIL — cannot resolve `../taxonomy`.

- [ ] **Step 3: Implement**

Create `app/_lib/taxonomy.ts`:

```ts
import { unstable_cache } from "next/cache";
import { prisma } from "@/app/_lib/prisma";

export type DesignSummary = { slug: string; name: string; hex: string };

export type DepartmentView = {
  slug: string;
  name: string;
  navLabel: string;
  tileName: string;
  note: string | null;
  subName: string | null;
  hex: string;
  sortOrder: number;
  designs: DesignSummary[];
};

/** The canonical path for a design. Never stored — always derived, so moving a
 *  design between departments needs no slug-history rows. */
export function designPath(departmentSlug: string, designSlug: string): string {
  return `/categories/${departmentSlug}/${designSlug}`;
}

/** A department shows a nav dropdown when it has designs to list. */
export function showsNavDropdown(d: DepartmentView): boolean {
  return d.designs.length > 0;
}

/** A department appears in "Shop by design" only when it names a
 *  sub-category AND has designs — matching the canvas's own condition. */
export function showsInDesignSection(d: DepartmentView): boolean {
  return d.subName !== null && d.designs.length > 0;
}

export const getDepartments = unstable_cache(
  async (): Promise<DepartmentView[]> => {
    const rows = await prisma.department.findMany({
      orderBy: { sortOrder: "asc" },
      include: { designs: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { slug: true, name: true, hex: true } } },
    });
    return rows.map((d) => ({
      slug: d.slug, name: d.name, navLabel: d.navLabel, tileName: d.tileName,
      note: d.note, subName: d.subName, hex: d.hex, sortOrder: d.sortOrder,
      designs: d.designs,
    }));
  },
  ["departments-list"],
  { tags: ["catalog", "departments"], revalidate: 3600 },
);

export async function getDesignPathRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.designSlugHistory.findUnique({
    where: { oldSlug },
    select: { design: { select: { slug: true, departmentSlug: true } } },
  });
  return row ? designPath(row.design.departmentSlug, row.design.slug) : null;
}

export async function getDepartmentSlugRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.departmentSlugHistory.findUnique({
    where: { oldSlug },
    select: { currentSlug: true },
  });
  return row ? `/categories/${row.currentSlug}` : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run app/_lib/__tests__/taxonomy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run test && npm run build
git add app/_lib/taxonomy.ts app/_lib/__tests__/taxonomy.test.ts
git commit -m "feat(taxonomy): add department reads and derived path helpers

designPath derives nested URLs from the design's current department, so a
design moving between departments needs no slug-history rows. Nav-dropdown
and design-section visibility are derived rather than stored so they cannot
drift from the data driving them."
```

---

### Task 6: Route resolution as a pure function

Resolution order is the part most likely to regress a live URL, so it is a pure function tested without Next.js.

**Files:**
- Create: `app/_lib/taxonomy-route.ts`
- Create: `app/_lib/__tests__/taxonomy-route.test.ts`

**Interfaces:**
- Consumes: `designPath` (Task 5).
- Produces:
  - `type Resolution = { kind: "department"; slug: string } | { kind: "design"; departmentSlug: string; designSlug: string } | { kind: "redirect"; to: string } | { kind: "notFound" }`
  - `type TaxonomyLookup = { departmentExists(slug): boolean; designOf(slug): { departmentSlug: string } | null; departmentRedirect(slug): string | null; designRedirect(slug): string | null }`
  - `resolveCategoryRoute(segments: string[], lookup: TaxonomyLookup): Resolution`

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/taxonomy-route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveCategoryRoute } from "../taxonomy-route";
import type { TaxonomyLookup } from "../taxonomy-route";

const lookup: TaxonomyLookup = {
  departmentExists: (s) => ["women", "men"].includes(s),
  designOf: (s) => (s === "cat" ? { departmentSlug: "women" } : s === "car" ? { departmentSlug: "men" } : null),
  departmentRedirect: (s) => (s === "ladies" ? "/categories/women" : null),
  designRedirect: (s) => (s === "kitty" ? "/categories/women/cat" : null),
};

describe("resolveCategoryRoute — one segment", () => {
  it("renders a current department", () => {
    expect(resolveCategoryRoute(["women"], lookup)).toEqual({ kind: "department", slug: "women" });
  });

  it("redirects a current design to its nested path", () => {
    expect(resolveCategoryRoute(["cat"], lookup)).toEqual({ kind: "redirect", to: "/categories/women/cat" });
  });

  it("redirects a historical department slug", () => {
    expect(resolveCategoryRoute(["ladies"], lookup)).toEqual({ kind: "redirect", to: "/categories/women" });
  });

  it("redirects a historical design slug", () => {
    expect(resolveCategoryRoute(["kitty"], lookup)).toEqual({ kind: "redirect", to: "/categories/women/cat" });
  });

  it("404s an unknown slug", () => {
    expect(resolveCategoryRoute(["nope"], lookup)).toEqual({ kind: "notFound" });
  });
});

describe("resolveCategoryRoute — two segments", () => {
  it("renders a matching department/design pair", () => {
    expect(resolveCategoryRoute(["women", "cat"], lookup)).toEqual({
      kind: "design", departmentSlug: "women", designSlug: "cat",
    });
  });

  it("redirects to canonical when the department segment is wrong", () => {
    expect(resolveCategoryRoute(["men", "cat"], lookup)).toEqual({
      kind: "redirect", to: "/categories/women/cat",
    });
  });

  it("redirects a historical design regardless of department segment", () => {
    expect(resolveCategoryRoute(["men", "kitty"], lookup)).toEqual({
      kind: "redirect", to: "/categories/women/cat",
    });
  });

  it("404s an unknown design", () => {
    expect(resolveCategoryRoute(["women", "nope"], lookup)).toEqual({ kind: "notFound" });
  });
});

describe("resolveCategoryRoute — arity", () => {
  it("404s zero segments", () => {
    expect(resolveCategoryRoute([], lookup)).toEqual({ kind: "notFound" });
  });

  it("404s three or more segments", () => {
    expect(resolveCategoryRoute(["women", "cat", "extra"], lookup)).toEqual({ kind: "notFound" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/_lib/__tests__/taxonomy-route.test.ts`
Expected: FAIL — cannot resolve `../taxonomy-route`.

- [ ] **Step 3: Implement**

Create `app/_lib/taxonomy-route.ts`:

```ts
import { designPath } from "@/app/_lib/taxonomy";

export type Resolution =
  | { kind: "department"; slug: string }
  | { kind: "design"; departmentSlug: string; designSlug: string }
  | { kind: "redirect"; to: string }
  | { kind: "notFound" };

export type TaxonomyLookup = {
  departmentExists(slug: string): boolean;
  designOf(slug: string): { departmentSlug: string } | null;
  departmentRedirect(slug: string): string | null;
  designRedirect(slug: string): string | null;
};

/**
 * Resolves /categories/* segments.
 *
 * One-segment order checks CURRENT designs before either history table.
 * `cat` and `dino` ship unrenamed, so they never enter DesignSlugHistory — a
 * history-only lookup would 404 the exact live URLs this migration preserves.
 *
 * For two segments the design slug is authoritative: the department segment is
 * corrected against the design's current department rather than trusted.
 */
export function resolveCategoryRoute(segments: string[], lookup: TaxonomyLookup): Resolution {
  if (segments.length === 1) {
    const [slug] = segments;
    if (lookup.departmentExists(slug)) return { kind: "department", slug };

    const design = lookup.designOf(slug);
    if (design) return { kind: "redirect", to: designPath(design.departmentSlug, slug) };

    const deptTo = lookup.departmentRedirect(slug);
    if (deptTo) return { kind: "redirect", to: deptTo };

    const designTo = lookup.designRedirect(slug);
    if (designTo) return { kind: "redirect", to: designTo };

    return { kind: "notFound" };
  }

  if (segments.length === 2) {
    const [deptSlug, designSlug] = segments;

    const design = lookup.designOf(designSlug);
    if (design) {
      return design.departmentSlug === deptSlug
        ? { kind: "design", departmentSlug: deptSlug, designSlug }
        : { kind: "redirect", to: designPath(design.departmentSlug, designSlug) };
    }

    const designTo = lookup.designRedirect(designSlug);
    if (designTo) return { kind: "redirect", to: designTo };

    return { kind: "notFound" };
  }

  return { kind: "notFound" };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run app/_lib/__tests__/taxonomy-route.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
npm run test && npm run build
git add app/_lib/taxonomy-route.ts app/_lib/__tests__/taxonomy-route.test.ts
git commit -m "feat(taxonomy): resolve /categories routes as a pure function

Checks current design slugs before either history table so /categories/cat
keeps working — cat and dino ship unrenamed and never enter the history.
For two segments the design slug is authoritative and a wrong department
segment redirects to canonical rather than 404ing."
```

---

### Task 7: Nested route and department index

**Files:**
- Delete: `app/categories/[slug]/page.tsx`
- Create: `app/categories/[...slug]/page.tsx`
- Modify: `app/categories/page.tsx`
- Create: `tests/e2e/taxonomy-routes.spec.ts`

**Interfaces:**
- Consumes: `resolveCategoryRoute`, `TaxonomyLookup` (Task 6); `getDepartments`, `getDesignPathRedirect`, `getDepartmentSlugRedirect` (Task 5); `getProducts` with `designSlug` (Task 3).
- Produces: live `/categories/{dept}` and `/categories/{dept}/{design}` routes.

- [ ] **Step 1: Move the route**

```bash
git mv "app/categories/[slug]/page.tsx" "app/categories/[...slug]/page.tsx"
```

- [ ] **Step 2: Build the lookup and wire the resolver**

In `app/categories/[...slug]/page.tsx`, change the params type to `{ slug: string[] }` and replace the resolution block at the top of the component (and the matching one in `generateMetadata`) with:

```ts
import { permanentRedirect, notFound } from "next/navigation";
import { getDepartments, getDesignPathRedirect, getDepartmentSlugRedirect } from "@/app/_lib/taxonomy";
import { resolveCategoryRoute, type TaxonomyLookup } from "@/app/_lib/taxonomy-route";

async function buildLookup(): Promise<TaxonomyLookup> {
  const departments = await getDepartments();
  const designToDept = new Map<string, string>();
  for (const d of departments) {
    for (const g of d.designs) designToDept.set(g.slug, d.slug);
  }
  // Redirect tables are read lazily; only a miss on the live tables hits them.
  const deptRedirects = new Map<string, string | null>();
  const designRedirects = new Map<string, string | null>();
  return {
    departmentExists: (slug) => departments.some((d) => d.slug === slug),
    designOf: (slug) => {
      const departmentSlug = designToDept.get(slug);
      return departmentSlug ? { departmentSlug } : null;
    },
    departmentRedirect: (slug) => deptRedirects.get(slug) ?? null,
    designRedirect: (slug) => designRedirects.get(slug) ?? null,
  };
}
```

`resolveCategoryRoute` is synchronous by design, so pre-resolve the two history lookups before calling it:

```ts
const { slug: segments } = await params;
const departments = await getDepartments();
const base = await buildLookup();

// Only a slug that matches nothing live can need a history lookup.
const candidates = segments.length === 1 ? [segments[0]] : segments.slice(1, 2);
const misses = candidates.filter((s) => !base.departmentExists(s) && !base.designOf(s));
const [deptHist, designHist] = await Promise.all([
  Promise.all(misses.map((s) => getDepartmentSlugRedirect(s))),
  Promise.all(misses.map((s) => getDesignPathRedirect(s))),
]);
const lookup: TaxonomyLookup = {
  ...base,
  departmentRedirect: (s) => deptHist[misses.indexOf(s)] ?? null,
  designRedirect: (s) => designHist[misses.indexOf(s)] ?? null,
};

const resolved = resolveCategoryRoute(segments, lookup);
if (resolved.kind === "redirect") permanentRedirect(resolved.to);
if (resolved.kind === "notFound") notFound();
```

- [ ] **Step 3: Render both shapes**

For `kind: "design"`, keep the existing page body, sourcing products with `getProducts({ designSlug: resolved.designSlug, sortBy })` and the heading from the design's `name`.

For `kind: "department"`, render the same shell listing that department's designs as tiles instead of products, using `d.hex` and `inkFor(d.hex)` from `app/_lib/taxonomy-tint`.

Update the three hardcoded `/categories/${slug}` strings — the breadcrumb, `buildPageLink`, and `ProductCard fromPath` — to the resolved nested path. Missing one silently drops sort and pagination state.

- [ ] **Step 4: Update the index page**

`app/categories/page.tsx` lists categories; point it at `getDepartments()` and link each to `/categories/{slug}`.

- [ ] **Step 5: Write the E2E tests**

Create `tests/e2e/taxonomy-routes.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("legacy category URL redirects to its nested path", async ({ page }) => {
  const res = await page.goto("/categories/cat");
  expect(res?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/categories/women/cat");
});

test("department page renders", async ({ page }) => {
  await page.goto("/categories/women");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Women");
});

test("design page renders", async ({ page }) => {
  await page.goto("/categories/women/cat");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cats");
});

test("wrong department segment redirects to canonical", async ({ page }) => {
  await page.goto("/categories/men/cat");
  expect(new URL(page.url()).pathname).toBe("/categories/women/cat");
});

test("unknown slug 404s", async ({ page }) => {
  const res = await page.goto("/categories/definitely-not-real");
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 6: Verify and commit**

```bash
npm run build && npm run test && npm run test:e2e && npm run check:contrast
git add -A
git commit -m "feat(taxonomy): serve nested /categories/{dept}/{design} routes

Replaces the [slug] route with a [...slug] catch-all driven by the pure
resolver. Legacy /categories/cat 308s to /categories/women/cat, and a wrong
department segment redirects to canonical instead of 404ing."
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §2 brand colour untouched | Global Constraints |
| §3 decisions 1–6 | Tasks 3, 4, 6 |
| §4 data model + derived rules | Tasks 3, 5 |
| §5 redirects, resolution order | Tasks 5, 6, 7 |
| §6 migration | Task 3 |
| §7 seed | Task 4 |
| §8 tints and contrast | Tasks 1, 2 |
| §9 out of scope | not planned, by design |
| §10 testing | Tasks 1, 5, 6, 7 |
| §11 validation | every task's final step |

**Gap found and closed:** §10 requires a migration test asserting `cat`/`dino` land under `women` and every product gets a `departmentSlug`. Task 3 Step 3 covers this as a verification command against the real migrated database rather than a unit test — the assertion is about a one-time data migration, which a mocked test could not meaningfully exercise.

**Placeholder scan:** none. Every code step carries the actual code.

**Type consistency:** `designPath` (Task 5) is consumed by Task 6 with the same signature. `TaxonomyLookup`'s four methods are defined in Task 6 and implemented in Task 7. `DesignView` replaces `CategoryView` in Task 3 and is not referenced by later tasks. `contrastRatio` is exported in Task 1 and imported in Task 2.

**Known sequencing risk:** Task 3 leaves `getCategories` renamed to `getDesigns` while `app/_components/home/category-strip.tsx` still renders a flat strip. That is intentional — the strip keeps working against designs and is restyled in out-of-scope piece B.
