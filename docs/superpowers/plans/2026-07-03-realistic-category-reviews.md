# Realistic Category-Aware Customer Reviews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic seeded reviews with believable, category-aware reviews (cat / dino / stitch) written in Sri Lankan customer voices, applied to the live DB via a script and kept consistent in dev seeds — guarded so a future submission form's real reviews are never overwritten.

**Architecture:** A single source-of-truth data module (`app/_data/review-content.ts`) holds Sri Lankan author names + coherent `{ rating, title, body }` templates (a shared pool + per-category pools). Two consumers import it: `prisma/seed.ts` (fresh dev seeds) and a new `scripts/update-review-content.ts` (rewrites the production DB). A new `synthetic` boolean on `Review` marks seeded rows so the rewrite only ever touches synthetic reviews.

**Tech Stack:** TypeScript, Prisma (PostgreSQL), Next.js 16, Vitest, `tsx` for scripts.

**Spec:** [docs/superpowers/specs/2026-07-03-realistic-category-reviews-design.md](../specs/2026-07-03-realistic-category-reviews-design.md)

## Global Constraints

- **No local `DATABASE_URL` in this workspace.** Never run `prisma migrate dev`, `npm run db:seed`, or `next build` (prerender needs a DB). Migrations are **hand-authored SQL** applied later via the repo's `migrate.yml` flow.
- **Type gate:** `npx tsc --noEmit` must pass. **Test gate:** `npm run test` (runs `vitest run`). Run the **full** suite — path/dir filters trip a `globalSetup` "no tests" quirk in this repo.
- **`prisma generate` is DB-free** and is required after any `schema.prisma` change so the client types (`synthetic`) resolve.
- **Categories:** dev catalogue is `cat` + `dino` only; `stitch` exists solely in the live DB. The content module must handle all three regardless of environment.
- **Voice:** mixed & balanced — mostly 4–5★, occasional honest 3★, rare 2★; category templates name their print; light Sri Lankan flavour (LKR 2190, Colombo/Kandy delivery, COD/card, oversized fit, 220 GSM fabric); occasional emoji, no heavy slang.
- **Commits:** Conventional Commits; end each message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Review-content source module + unit test

**Files:**
- Create: `app/_data/review-content.ts`
- Test: `app/_data/review-content.test.ts`

**Interfaces:**
- Consumes: nothing (pure data + one pure function; no Prisma/Next imports).
- Produces:
  - `type ReviewTemplate = { rating: number; title: string | null; body: string }`
  - `REVIEW_AUTHORS: string[]`
  - `SHARED_REVIEWS: ReviewTemplate[]`
  - `CATEGORY_REVIEWS: Record<string, ReviewTemplate[]>` (keys: `cat`, `dino`, `stitch`)
  - `reviewPoolForCategory(slug: string): ReviewTemplate[]` → `[...SHARED_REVIEWS, ...(CATEGORY_REVIEWS[slug] ?? [])]`

- [ ] **Step 1: Write the failing test**

Create `app/_data/review-content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  REVIEW_AUTHORS,
  SHARED_REVIEWS,
  CATEGORY_REVIEWS,
  reviewPoolForCategory,
  type ReviewTemplate,
} from "./review-content";

const allTemplates: ReviewTemplate[] = [
  ...SHARED_REVIEWS,
  ...Object.values(CATEGORY_REVIEWS).flat(),
];

describe("review-content", () => {
  it("every template has a 1–5 rating and a non-empty body", () => {
    for (const t of allTemplates) {
      expect(t.rating).toBeGreaterThanOrEqual(1);
      expect(t.rating).toBeLessThanOrEqual(5);
      expect(t.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("has a pool of >= 20 unique Sri Lankan author names", () => {
    expect(REVIEW_AUTHORS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(REVIEW_AUTHORS).size).toBe(REVIEW_AUTHORS.length);
  });

  it("each category template mentions its own keyword", () => {
    for (const [slug, templates] of Object.entries(CATEGORY_REVIEWS)) {
      for (const t of templates) {
        const text = `${t.title ?? ""} ${t.body}`.toLowerCase();
        expect(text).toContain(slug); // cat / dino / stitch
      }
    }
  });

  it("reviewPoolForCategory concatenates shared + category templates", () => {
    expect(reviewPoolForCategory("cat")).toEqual([
      ...SHARED_REVIEWS,
      ...CATEGORY_REVIEWS.cat,
    ]);
  });

  it("returns just the shared pool for an unknown category", () => {
    expect(reviewPoolForCategory("nope")).toEqual(SHARED_REVIEWS);
  });

  it("gives each category >= 15 templates (variety for 5–10 shown)", () => {
    for (const slug of Object.keys(CATEGORY_REVIEWS)) {
      expect(reviewPoolForCategory(slug).length).toBeGreaterThanOrEqual(15);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — the `review-content.test.ts` suite errors because `./review-content` does not exist yet.

- [ ] **Step 3: Create the module**

Create `app/_data/review-content.ts`:

```ts
// Single source of truth for seeded review content, shared by prisma/seed.ts
// (fresh dev seeds) and scripts/update-review-content.ts (live-DB rewrite).
// Pure data + one pure function — no Prisma/Next imports, so it is unit-testable
// and safe to import from a plain tsx script.

export type ReviewTemplate = {
  rating: number; // 1..5
  title: string | null;
  body: string;
};

// Sri Lankan (Sinhala) customer names. First block is the existing pool; the
// second block adds male names so reviews aren't all-female.
export const REVIEW_AUTHORS: string[] = [
  "Nethmi Perera", "Sanuli Fernando", "Tharushi Silva", "Senuri Jayawardena",
  "Dinuli Perera", "Oneli Fernando", "Yehani Silva", "Shenaya Wijesinghe",
  "Kavindi Perera", "Methmi Fernando", "Thevini Silva", "Sayuni Jayasinghe",
  "Himashi Bandara", "Rashmi Perera", "Dinethmi Fernando", "Vihangi Silva",
  "Lithumi Perera", "Senuji Fernando", "Amaaya Silva",
  "Kavindu Perera", "Sahan Fernando", "Dulaj Silva", "Ravindu Jayawardena",
  "Tharindu Bandara", "Nimesh Gunawardena",
];

// Applies to any tee: fit, fabric, delivery, sizing, value, service.
export const SHARED_REVIEWS: ReviewTemplate[] = [
  { rating: 5, title: "Perfect oversized fit", body: "Ordered a Large for that oversized look and it's exactly right. The 220 GSM fabric is thick and soft, doesn't feel cheap at all." },
  { rating: 5, title: "Fast delivery to Colombo", body: "Delivered in 2 days, nicely packed. Paid by card, no issues at all. Very happy with the whole experience." },
  { rating: 4, title: "Good but size up", body: "Material and stitching are great. I'm usually a Medium but this runs a little fitted, so size up if you want it really oversized." },
  { rating: 5, title: null, body: "Washed it a few times already and the print hasn't cracked or faded. Colour still looks new. Worth the price." },
  { rating: 5, title: "Super soft cotton", body: "The fabric feels premium and breathable, perfect for our weather. Will definitely order more colours." },
  { rating: 4, title: "Great value for 2190", body: "Honestly great value for the price. Soft cotton, clean print, comfy fit. Can't complain." },
  { rating: 3, title: "Colour slightly off", body: "Quality is good but the shade came a bit lighter than the photo. Not a dealbreaker, still wear it a lot." },
  { rating: 5, title: "Very happy", body: "Exactly as described. Oversized fit is on point and delivery to Kandy was quick. Recommended!" },
  { rating: 4, title: null, body: "Nice thick material and the fit is comfy. Took about 4 days to arrive but that's fine." },
  { rating: 5, title: "COD was smooth", body: "Ordered with cash on delivery and everything went smoothly. Tee quality is better than I expected." },
  { rating: 2, title: "A bit long for me", body: "Fabric is okay but it was longer than I expected on me. Might work better if you're taller." },
  { rating: 5, title: "Will buy again", body: "Second time ordering from here and the quality is consistent. Soft, well-stitched, prints look great." },
];

// Per-category pools — each template names its own print so the reviews read as
// specific to that design.
export const CATEGORY_REVIEWS: Record<string, ReviewTemplate[]> = {
  cat: [
    { rating: 5, title: "So cute!", body: "The cat print is adorable and came out really crisp. Got the white one and it goes with everything." },
    { rating: 5, title: null, body: "Bought the baby pink cat tee for my sister and she loves it. The design is lovely and the material is super soft." },
    { rating: 4, title: "Cute cat design", body: "Cat print is exactly like the picture. Fit is nice and oversized. Only wish there were more colours." },
    { rating: 5, title: "Love it 🐱", body: "This cat tee is my new favourite. Print quality is excellent and the ivory colour is beautiful." },
    { rating: 5, title: "Purrfect", body: "The cat graphic is so cute and hasn't faded after washing. Comfy oversized fit too." },
    { rating: 4, title: null, body: "Nice cat print and soft fabric. Runs a touch long but I like wearing it oversized anyway." },
    { rating: 3, title: "Cute but thin near print", body: "Love the cat design but the fabric feels slightly thinner around the print area. Still happy overall." },
  ],
  dino: [
    { rating: 5, title: "Love the dino design", body: "The dino print is so fun and the ivory colour is beautiful. Thick fabric, proper oversized fit." },
    { rating: 5, title: null, body: "My son is obsessed with the dino tee. Print quality is excellent and it survived several washes already." },
    { rating: 4, title: "Nice dino tee", body: "Good quality and the dino graphic is sharp. Runs a little long but I like it that way." },
    { rating: 5, title: "Roar 🦖", body: "The dino print is super cute and the material is really soft. Delivery to Colombo was fast too." },
    { rating: 5, title: "Great for kids and adults", body: "Bought matching dino tees for me and my nephew. Both fit great and the print is lovely." },
    { rating: 4, title: null, body: "Dino design is exactly like the photo and the fabric is nice and thick. Happy with it." },
    { rating: 3, title: "Wanted brighter colours", body: "The dino print is cute but I expected the colours to be a bit brighter. Fabric quality is good though." },
  ],
  stitch: [
    { rating: 5, title: "Stitch is the best 💙", body: "The Stitch print is super cute and the colour is exactly as shown. Soft, thick material — very happy!" },
    { rating: 5, title: null, body: "Been wanting a Stitch tee for ages and this one didn't disappoint. Great print, comfy oversized fit, fast delivery." },
    { rating: 4, title: "Cute, ordered a size up", body: "Love the Stitch design and the fabric feels premium. Ordered M and it fits nicely oversized." },
    { rating: 5, title: "Adorable", body: "Stitch design is adorable and the print is really sharp. Got so many compliments already!" },
    { rating: 5, title: null, body: "The Stitch tee is perfect. Colour matches the photo and the material is soft and breathable." },
    { rating: 4, title: "Nice Stitch print", body: "Stitch graphic looks great and quality is solid. Delivery took a few days but worth the wait." },
    { rating: 3, title: "Print smaller than expected", body: "The Stitch print is a little smaller than I thought, but it's cute and the fabric is good quality." },
  ],
};

export function reviewPoolForCategory(slug: string): ReviewTemplate[] {
  return [...SHARED_REVIEWS, ...(CATEGORY_REVIEWS[slug] ?? [])];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — all `review-content` cases green, rest of suite unaffected.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/_data/review-content.ts app/_data/review-content.test.ts
git commit -m "feat(reviews): add category-aware review-content source module

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `synthetic` flag on Review (schema + hand-authored migration)

**Files:**
- Modify: `prisma/schema.prisma` (Review model, ~lines 100–112)
- Create: `prisma/migrations/20260703120000_add_review_synthetic/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `Review.synthetic: boolean` (default `false`) on the generated Prisma client, used by Tasks 3 and 4.

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, in `model Review`, add the `synthetic` line after `createdAt`:

```prisma
model Review {
  id          String   @id @default(cuid())
  productId   String
  authorName  String
  rating      Int
  title       String?
  body        String
  createdAt   DateTime @default(now())
  synthetic   Boolean  @default(false)

  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, createdAt])
}
```

- [ ] **Step 2: Hand-author the migration**

Create `prisma/migrations/20260703120000_add_review_synthetic/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Review" ADD COLUMN "synthetic" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every review that exists today is seeded (no customer submission
-- path exists yet), so mark them all synthetic. This lets the content-rewrite
-- script target them while never touching future real (customer-written) reviews.
UPDATE "Review" SET "synthetic" = true;
```

- [ ] **Step 3: Validate the schema and regenerate the client**

Run: `npx prisma validate`
Expected: "The schema at prisma\schema.prisma is valid 🚀".

Run: `npx prisma generate`
Expected: "Generated Prisma Client" — no DB connection required.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (client now knows `synthetic`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260703120000_add_review_synthetic/migration.sql
git commit -m "feat(reviews): add synthetic flag to Review model

Hand-authored migration adds a synthetic boolean (default false) and backfills
all existing reviews to true, so the content-rewrite script can target seeded
reviews without ever overwriting real customer submissions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Seed from the shared module with coherent templates

**Files:**
- Modify: `prisma/seed.ts` (remove inline pools ~lines 33–63; import module; update review loop ~lines 176–188)

**Interfaces:**
- Consumes: `REVIEW_AUTHORS`, `reviewPoolForCategory` from `../app/_data/review-content`; `Review.synthetic` from Task 2.
- Produces: dev-seed reviews with coherent `{ rating, title, body }` and `synthetic: true`.

- [ ] **Step 1: Replace the inline pools with an import**

In `prisma/seed.ts`, delete the four inline constants `REVIEW_AUTHORS` (lines 33–39), `REVIEW_TITLES` (41–50), `REVIEW_BODIES` (52–61), and `RATING_POOL` (63). Add to the import block at the top (after the `mock` import on line 4):

```ts
import { REVIEW_AUTHORS, reviewPoolForCategory } from "../app/_data/review-content";
```

Keep the existing `rngFromId` and `pick` helpers (still used for stock, images, and now template selection).

- [ ] **Step 2: Update the review-generation loop**

Replace the review-building block (currently lines ~176–188) with:

```ts
    const reviews = Array.from({ length: count }, () => {
      const daysAgo = Math.floor(rng() * 90);
      const createdAt = new Date(Date.now() - daysAgo * 86400_000);
      const tpl = pick(reviewPoolForCategory(p.category), rng);
      return {
        productId: p.id,
        authorName: pick(REVIEW_AUTHORS, rng),
        rating: tpl.rating,
        title: tpl.title,
        body: tpl.body,
        createdAt,
        synthetic: true,
      };
    });
    await prisma.review.createMany({ data: reviews });
```

(`p.category` is the category slug on the mock `Product` type — the same value passed to `categorySlug` when the product is upserted above.)

- [ ] **Step 3: Type-check (no DB available to run the seed)**

Run: `npx tsc --noEmit`
Expected: no errors. This is the gate for this task — per Global Constraints the seed itself is not run here (no `DATABASE_URL`).

- [ ] **Step 4: Run the full test suite (guard against regressions)**

Run: `npm run test`
Expected: PASS — unchanged from Task 1.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "refactor(reviews): seed coherent category-aware synthetic reviews

Seed now draws {rating,title,body} together from review-content templates per
product category and marks rows synthetic:true, replacing the independent
title/body/rating pools.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Live-DB rewrite script (+ retire the old names script)

**Files:**
- Create: `scripts/update-review-content.ts`
- Delete: `scripts/update-review-names.ts`

**Interfaces:**
- Consumes: `REVIEW_AUTHORS`, `reviewPoolForCategory` from `../app/_data/review-content`; `Review.synthetic` from Task 2.
- Produces: an owner-run script that rewrites `authorName`, `rating`, `title`, `body` on synthetic reviews (keeps `createdAt`), with a `--dry-run` mode.

- [ ] **Step 1: Write the script**

Create `scripts/update-review-content.ts`:

```ts
// One-off: rewrite SYNTHETIC review content (author, rating, title, body) with
// realistic, category-aware copy from app/_data/review-content.ts (the same
// source seed.ts uses). Reviews with synthetic=false (e.g. real submissions from
// the future review form) are never touched.
//
// Run:  npx tsx scripts/update-review-content.ts --dry-run   # preview counts
//       npx tsx scripts/update-review-content.ts             # apply
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  REVIEW_AUTHORS,
  reviewPoolForCategory,
} from "../app/_data/review-content";

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

// Stable FNV-1a hash so each review's assignment is deterministic across reruns.
function hashToInt(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function main() {
  const reviews = await prisma.review.findMany({
    where: { synthetic: true },
    select: { id: true, product: { select: { categorySlug: true } } },
  });

  const perCategory: Record<string, number> = {};

  for (const r of reviews) {
    const slug = r.product.categorySlug;
    const pool = reviewPoolForCategory(slug);
    const tpl = pool[hashToInt(r.id) % pool.length];
    const author =
      REVIEW_AUTHORS[hashToInt(r.id + ":author") % REVIEW_AUTHORS.length];

    perCategory[slug] = (perCategory[slug] ?? 0) + 1;

    if (!DRY_RUN) {
      await prisma.review.update({
        where: { id: r.id },
        data: {
          authorName: author,
          rating: tpl.rating,
          title: tpl.title,
          body: tpl.body,
        },
      });
    }
  }

  const summary =
    Object.entries(perCategory)
      .map(([slug, n]) => `${slug}: ${n}`)
      .join(", ") || "none";
  console.log(
    `[update-review-content] ${DRY_RUN ? "DRY RUN — would update" : "Updated"} ` +
      `${reviews.length} synthetic reviews (${summary}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Delete the superseded names script**

```bash
git rm scripts/update-review-names.ts
```

(The new script sets author names too, from the same expanded pool, so the old one is redundant.)

- [ ] **Step 3: Type-check (no DB available to run the script)**

Run: `npx tsc --noEmit`
Expected: no errors. Per Global Constraints the script is not executed here; the owner runs it against production during rollout.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/update-review-content.ts
git commit -m "feat(reviews): add live-DB synthetic review rewrite script

Rewrites authorName/rating/title/body on synthetic reviews from the shared
review-content module, deterministically and category-aware, with a --dry-run
mode. Supersedes and removes scripts/update-review-names.ts.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Post-implementation: rollout (owner runs against production)

Not part of the code change — the deployment sequence the owner performs:

1. Apply the migration to prod via the repo's `migrate.yml` flow (adds `synthetic`, backfills existing rows → `true`).
2. `npx tsx scripts/update-review-content.ts --dry-run` → confirm per-category counts (expect cat, dino, **stitch**).
3. `npx tsx scripts/update-review-content.ts` → apply.

## Self-review notes

- **Spec coverage:** module (§5.1) → Task 1; `synthetic` guard + migration (§4) → Task 2; seed refactor (§5.2) → Task 3; live script + delete old script (§5.3, §11) → Task 4; Vitest test (§7) → Task 1; rollout (§8) → Post-implementation section. All spec sections mapped.
- **Type consistency:** `ReviewTemplate`, `REVIEW_AUTHORS`, `reviewPoolForCategory` used identically across Tasks 1/3/4; `p.category` (mock slug) matches `categorySlug` in the DB join.
- **No placeholders:** every code and command step is complete and literal.
