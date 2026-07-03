# Realistic Category-Aware Customer Reviews — Design

**Date:** 2026-07-03
**Status:** Design — pending implementation plan
**Scope:** Sub-project 1 of 2. A sibling change (customer "Write a review" submission
form) is deliberately split into its own spec — see §10.

## 1. Problem

The storefront (Dressing Bear) sells oversized printed T-shirts across three
categories: **cat**, **dino**, and **stitch**. Reviews are seeded, not written by
real customers.

Two problems with today's seeded reviews:

1. **They are generic and product-agnostic.** [prisma/seed.ts](../../../prisma/seed.ts)
   draws `title`, `body`, and `rating` from three *independent* pools
   (`REVIEW_TITLES`, `REVIEW_BODIES`, `RATING_POOL`) whose bodies read like reviews
   of an anonymous gadget ("Solid build, looks good, does the job") — nothing about
   fit, fabric, print, colour, sizing, or delivery. Independent picking also lets a
   5★ rating land on a lukewarm body.
2. **They are not category-aware.** A cat tee, a dino tee, and a Stitch tee all get
   the same undifferentiated text.

The author names are already Sri Lankan Sinhala names (set by
[scripts/update-review-names.ts](../../../scripts/update-review-names.ts)), but the
pool is all-female.

**Data reality:** `stitch` exists **only in the live/production DB** (added via the
admin panel). It is not in the seed catalogue (`app/_data/mock.ts` has only `cat`
and `dino`). There is **no local `DATABASE_URL`** in this workspace, so the live
data must be updated by a script the owner runs against production — mirroring the
existing `update-review-names.ts` precedent.

## 2. Goal

Believable, mixed-voice, **category-aware** reviews (naming the cat / dino / Stitch
print and mentioning oversized fit, 220 GSM fabric, colour, sizing, and Sri Lankan
delivery) with Sri Lankan customer names, applied to **all three live categories**
and kept consistent with fresh dev seeds — **without** a future customer-submission
form clobbering genuine reviews.

## 3. Scope

**In scope**

- A shared review-content module as the single source of truth.
- Coherent review **templates** (`{ rating, title, body }` bundled) replacing the
  independent title/body/rating pools.
- Category-aware content: a shared pool (any tee) + per-category pools that name the
  print (cat / dino / stitch).
- Expanding `REVIEW_AUTHORS` with ~5 male Sinhala names.
- A one-off script that rewrites **synthetic** reviews in the live DB.
- A `synthetic Boolean` column on `Review` (+ hand-authored migration + backfill) so
  the rewrite can never touch a real customer review.
- A Vitest unit test on the content module (no DB required).

**Out of scope (explicitly)**

- The customer "Write a review" submission form — separate spec (§10).
- Any change to how reviews are *rendered*
  ([app/_components/product/reviews-section.tsx](../../../app/_components/product/reviews-section.tsx)
  is untouched).
- Adding the `stitch` category/products to code — they live only in prod and stay
  there; the seed catalogue remains `cat` + `dino`.
- Localisation/i18n of review text (English with light Sri Lankan flavour, as today).

## 4. The safety guard — `synthetic` column (the load-bearing decision)

A blanket rewrite is safe *today* because every review is synthetic. The moment the
submission form (§10) ships, re-running the rewrite script would **overwrite genuine
customer reviews**. The guard is baked in now because it is cheap to design in and
expensive to retrofit.

**Mechanism:**

- Add `synthetic Boolean @default(false)` to the `Review` model.
- Hand-authored migration (per the repo's "no local DB" workflow — SQL written by
  hand, applied through `migrate.yml`, **not** `prisma migrate dev`):
  ```sql
  ALTER TABLE "Review" ADD COLUMN "synthetic" BOOLEAN NOT NULL DEFAULT false;
  -- Every review that exists today is seeded/synthetic (no submission path exists yet).
  UPDATE "Review" SET "synthetic" = true;
  ```
- `seed.ts` creates reviews with `synthetic: true`.
- `update-review-content.ts` filters strictly on `where: { synthetic: true }`.
- The future submission form inserts reviews with the default `synthetic: false`,
  making them permanently invisible to the rewrite script.

Considered and rejected: a `createdAt` cutoff (fragile — fresh seeds create new
synthetic rows past the cutoff) and an authorName/body heuristic (brittle, goes
stale). The boolean is durable and correct forever.

## 5. Architecture — one source of truth, two consumers

```
app/_data/review-content.ts   ← NEW: single source of truth
    ├─ REVIEW_AUTHORS       (existing Sinhala names + ~5 male names)
    ├─ SHARED_REVIEWS[]     ReviewTemplate[]  (fit / fabric / delivery / sizing)
    ├─ CATEGORY_REVIEWS{}   Record<slug, ReviewTemplate[]>  (cat / dino / stitch)
    └─ reviewPoolForCategory(slug) → [...SHARED_REVIEWS, ...(CATEGORY_REVIEWS[slug] ?? [])]
          │
          ├──► prisma/seed.ts                      (fresh dev seeds; synthetic: true)
          └──► scripts/update-review-content.ts    (NEW: rewrites the LIVE DB)
```

```ts
type ReviewTemplate = { rating: number; title: string | null; body: string };
```

### 5.1 `app/_data/review-content.ts` (new)

Exports `REVIEW_AUTHORS`, `SHARED_REVIEWS`, `CATEGORY_REVIEWS`, and
`reviewPoolForCategory(slug)`. Pure data + one pure function — no Prisma import, so
it is trivially unit-testable. Colocated with `mock.ts` under `app/_data/`, which
`seed.ts` already imports from (`../app/_data/mock`); the new module is imported the
same way. Living under `app/**` is also required for Vitest to discover its test
(`include: ["app/**/*.test.ts"]`).

Pool sizing target: ~10–12 shared + ~6–8 per category ≈ 16–20 available per
category, so 5–10 shown per product repeat little. Rating distribution across the
combined pool is positive-skewed (mostly 4–5★, occasional 3★, rare 2★). Because
templates are sampled uniformly, the displayed average **rises** from today's
~3.9★ (old `RATING_POOL` mean) to ~4.4★ — a deliberate, desirable lift for a
store, not a claim of stability.

### 5.2 `prisma/seed.ts` (edit)

- Delete inline `REVIEW_AUTHORS`, `REVIEW_TITLES`, `REVIEW_BODIES`, `RATING_POOL`;
  import from the module.
- In the per-product loop, pick a `ReviewTemplate` from
  `reviewPoolForCategory(p.category)` (coherent rating+title+body) and an author from
  `REVIEW_AUTHORS`. Keep the deterministic per-product RNG (`rngFromId`), 5–10
  reviews per product, and `createdAt` within the last 90 days.
- Set `synthetic: true` on every generated review.
- Dev still only seeds `cat` + `dino` (stitch isn't in the catalogue); the module's
  `stitch` pool is exercised by the live script.

### 5.3 `scripts/update-review-content.ts` (new)

Mirrors `update-review-names.ts`:

- Loads `.env` / `.env.local`, instantiates `PrismaClient`.
- Fetches `synthetic` reviews joined to their product's `categorySlug`, ordered
  `(productId, createdAt, id)` for stable rotation.
- For each review, deterministically picks a `ReviewTemplate` from that category's
  pool and an author name, then updates **authorName + rating + title + body**
  (keeps `createdAt`). Determinism keyed off `review.id` (stable across reruns).
- `--dry-run` flag: log per-category counts and a sample, write nothing.
- Prints a summary (rows updated per category).
- **Supersedes** `update-review-names.ts` (this also sets names) — that script is
  deleted as part of this change.

Note: this rewrites `rating` as well as title/body, because coherent templates
require the stars to match the words. The template distribution is positive-skewed,
which lifts the displayed average from ~3.9★ to ~4.4★ (a deliberate, desirable
improvement for a store — not a claim that it stays put). (Alternative — freezing existing ratings — was
weighed and rejected; see §9.)

## 6. Content voice

Mixed & balanced (approved): a natural spread — some polished, some casual, some
one-liners, mostly 4–5★ with the occasional honest 3★. Category pools name the print
("the cat print is so cute", "love the dino design", "Stitch is the best 💙"). Local
flavour: Colombo/Kandy delivery, LKR 2190 value, COD/card, wash durability, oversized
fit, 220 GSM fabric, colour vs. photo. Occasional emoji, no heavy slang.

## 7. Validation

No DB in this workspace, so:

- **`tsc`** — type gate (per repo convention; `next build` prerender is unavailable
  without a DB).
- **Vitest** unit test on `app/_data/review-content.ts`: every template `rating` is 1–5, no
  empty `body`, each `CATEGORY_REVIEWS[slug]` mentions its keyword
  (cat/dino/stitch, case-insensitive), `reviewPoolForCategory` concatenates
  shared + category, and each category pool meets the minimum size for 5–10 shown.
- **`npm run test`** overall stays green.

## 8. Rollout (owner runs against prod)

1. Apply the hand-authored migration via `migrate.yml` → adds `synthetic` column and
   backfills all existing rows to `true`.
2. `npx tsx scripts/update-review-content.ts --dry-run` → sanity-check counts.
3. `npx tsx scripts/update-review-content.ts` → rewrites cat/dino/**stitch** in prod.
4. Dev `seed.ts` stays consistent for future fresh seeds; no action needed.

## 9. Decisions & defaults (surfaced for the record)

- **`synthetic` column over a lighter guard** — approved. Durable, and makes the
  submission form (§10) safe by construction.
- **Rewrite `rating` too, not just title+body** — approved. Coherent templates need
  matching stars; the positive-skewed distribution lifts the displayed average from
  ~3.9★ to ~4.4★ (intended, and fine for a store).
- **Author names re-assigned from the expanded pool** — introduces the new male
  names across existing reviews.

## 10. Relationship to the submission-form change (sub-project 2)

The customer "Write a review" form is a separate change with its own spec, because it
is an independent, interactive subsystem (client form + Server Action + persistence +
auth/moderation policy + path revalidation). This spec's `synthetic` column is the
foundation that lets the form's real reviews coexist safely with seeded ones: the
form inserts `synthetic: false`. That change will be brainstormed next.

## 11. Files touched

- `app/_data/review-content.ts` — **new** (source of truth)
- `prisma/seed.ts` — edit (import module; coherent templates; `synthetic: true`)
- `scripts/update-review-content.ts` — **new** (live-DB rewrite, `--dry-run`)
- `prisma/schema.prisma` — edit (`synthetic Boolean @default(false)` on `Review`)
- `prisma/migrations/<timestamp>_review_synthetic/migration.sql` — **new**, hand-authored
- `app/_data/review-content.test.ts` — **new** Vitest test (matches `app/**/*.test.ts`)
- `scripts/update-review-names.ts` — **deleted** (superseded)
