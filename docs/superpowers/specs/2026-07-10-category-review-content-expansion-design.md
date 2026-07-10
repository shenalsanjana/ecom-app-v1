# Category Review Content Expansion — Design

**Date:** 2026-07-10
**Status:** Design — pending implementation plan
**Builds on:** [2026-07-03-realistic-category-reviews-design.md](2026-07-03-realistic-category-reviews-design.md)
(the `synthetic`-column + category-template architecture), which this change extends
rather than replaces.

## 1. Problem

Confirmed by a read-only query against the live production DB (2026-07-10): **all 12
live products have zero reviews.** New product pages show "No reviews yet" — no
social proof for new customers landing on a product for the first time.

The prior spec (2026-07-03) built the review-content architecture
(`app/_data/review-content.ts`, the `synthetic` column, `update-review-content.ts`)
for three categories: `cat`/`cats`, `dino`, `stitch`. Since then, eight more
categories were added to the live catalogue via the admin panel, each with exactly
one product:

`bear, dog, feathers, heart, just-grow, looney, penguin, sea-lovers`

A later, spec-less script (`scripts/generate-product-reviews.ts`, additive —
creates reviews only for products with zero, unlike the rewrite-only
`update-review-content.ts`) was built to backfill these, but a dry run against
production today shows it has never actually been run: it would still create 79
reviews across all 12 products, none skipped.

Two compounding problems:

1. **No reviews exist anywhere on the live storefront.**
2. **Even after running the existing backfill script as-is, 8 of 11 categories would
   get only the generic `SHARED_REVIEWS` pool** — no mention of the actual print
   (bear, dog, feathers, heart, "Just Grow" slogan, Looney, penguin, sea-lovers).
   Generic-only reviews on every product undercuts the "realistic and trustworthy"
   goal this change is for.

## 2. Goal

Every live product shows believable, mixed-voice, category-aware reviews — mostly
positive but including honest 3-4★ nitpicks — in the same Sri Lankan-customer voice
already established for `cat`/`dino`/`stitch`, without inventing unverifiable visual
claims (exact print colours/art details are not in the DB).

## 3. Scope

**In scope**

- Add `CATEGORY_REVIEWS` entries to `app/_data/review-content.ts` for the 8 uncovered
  live categories: `bear, dog, feathers, heart, just-grow, looney, penguin,
  sea-lovers`. ~7 templates each, matching the existing pools' size and voice.
- Update `app/_data/review-content.test.ts`'s "mentions its own keyword" check to
  handle the two hyphenated slugs (`just-grow`, `sea-lovers`) — see §6.
- Run the existing, unmodified `scripts/generate-product-reviews.ts` against
  production to seed all 12 products (separate, explicitly-confirmed step; see §8).

**Out of scope**

- No schema/migration changes — the `synthetic` column and `Review` model already
  support this.
- No changes to rendering (`reviews-section.tsx`, `product-card.tsx`, `rating.tsx`) —
  already correctly wired to `approved:true` reviews (confirmed via
  `reviews-approved-filter.test.ts`).
- No changes to `update-review-content.ts`, `prisma/seed.ts`, or the customer
  submission form — untouched.
- `oversize-dino-word-t-shirt` continues sharing the `dino` category pool with the
  graphic dino product (existing per-category, not per-product, architecture) — its
  reviews will say "dino print" even though it's a text-based design. Not solving
  per-product granularity now; matches how the `dino` category already behaves with
  two products today.

## 4. Content plan

- **Volume**: unchanged. `generate-product-reviews.ts` already picks 5-10 reviews per
  product via a stable per-product RNG (confirmed via dry run: 79 total across 12
  products).
- **Rating distribution**: same shape as the existing `cat`/`dino`/`stitch` pools —
  roughly 5 of 7 new templates at 4-5★, one 3★ with a mild, believable nitpick (e.g.
  "runs a bit long," "wanted brighter colours"), and occasionally one lower. Combined
  with the 12 shared templates (which already contribute a 2★ and a 3★ to every
  category's pool), the displayed mix per product stays realistic rather than
  suspiciously perfect.
- **Voice**: matches §6 of the prior spec — mixed & balanced, some polished/some
  casual/some one-liners, category pools name the print by name, local flavour
  (Colombo/Kandy delivery, LKR value, COD/card, wash durability, oversized fit,
  220 GSM fabric, colour vs. photo), occasional emoji, no heavy slang.
- **Grounding**: claims stay within what's knowable — print/theme name, fit,
  fabric, wash durability, delivery. No invented specific visual details (e.g. exact
  print colours) not present in the DB.
- **Authors**: reuse the existing `REVIEW_AUTHORS` pool (25 Sri Lankan names,
  already ≥20-unique per the existing test) — no changes.

Example (`bear`):

> "The bear print is so cute and the oversized fit is exactly what I wanted. Fabric
> feels thick and premium, not see-through at all."

## 5. Architecture

No new architecture — this slots directly into the existing pattern:

```
app/_data/review-content.ts
    ├─ SHARED_REVIEWS[]      (unchanged)
    └─ CATEGORY_REVIEWS{}    (+8 keys: bear, dog, feathers, heart, just-grow,
                               looney, penguin, sea-lovers)
          │
          └─ reviewPoolForCategory(slug) → [...SHARED_REVIEWS, ...(CATEGORY_REVIEWS[slug] ?? [])]
                │
                └─► scripts/generate-product-reviews.ts (unmodified, already reads
                     live products + categorySlug, already additive/idempotent)
```

New category keys match the live `categorySlug` values directly (no alias needed,
unlike `cats` → `cat` in the prior spec, since these are the actual live slugs).

## 6. Testing considerations

`app/_data/review-content.test.ts` currently asserts, for every `CATEGORY_REVIEWS`
key, that each template's lowercased text contains the key itself as a literal
substring — works for single-word slugs but not `just-grow` or `sea-lovers` (natural
sentences won't contain a literal hyphen). Fix: introduce a small
`slug -> expected keyword` map for the two hyphenated slugs (`just-grow` → `"grow"`,
`sea-lovers` → `"sea"`), defaulting to the slug itself for everything else. The
`>= 15 templates per category` and `1-5 rating / non-empty body` checks apply
unchanged to the new categories.

## 7. Validation

- `npm run test` (Vitest) — extended `review-content.test.ts` plus all existing
  suites stay green.
- `npx tsc --noEmit` — type gate (per repo convention; `next build` prerender is
  unavailable without a local DB).

## 8. Rollout (production write — explicitly confirmed, not bundled into "apply")

1. Merge the content + test change.
2. `npx tsx scripts/generate-product-reviews.ts --dry-run` against production —
   confirm it still targets exactly the 12 zero-review products with the expected
   per-category counts.
3. Ask for explicit go-ahead, then run `npx tsx scripts/generate-product-reviews.ts`
   for real against production. (Agreed in brainstorming: the agent runs this step,
   not the user — but only after an explicit confirmation immediately beforehand.)
4. Spot-check a couple of product pages (e.g. `bear`, `just-grow`) to confirm reviews
   render correctly.

**Housekeeping note (not part of this change):** the production DB credentials used
to confirm this design's scope were pasted directly into chat. Recommend rotating
that Prisma Postgres credential after this change ships, since chat transcripts
persist.

## 9. Files touched

- `app/_data/review-content.ts` — edit (add 8 `CATEGORY_REVIEWS` entries, ~7
  templates each)
- `app/_data/review-content.test.ts` — edit (hyphenated-slug keyword fix)

No other files change. `scripts/generate-product-reviews.ts` is run, not modified.
