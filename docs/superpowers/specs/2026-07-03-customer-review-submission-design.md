# Customer Review Submission + Admin Moderation — Design

**Date:** 2026-07-03
**Status:** Design — pending implementation plan
**Scope:** Sub-project 2 of 2. Depends on the `synthetic` flag introduced by
[Realistic Category-Aware Reviews](2026-07-03-realistic-category-reviews-design.md)
(sub-project 1).

## 1. Problem

Reviews on the storefront are currently seeded only —
[app/_components/product/reviews-section.tsx](../../../app/_components/product/reviews-section.tsx)
*displays* reviews but there is no way for a real customer to write one. The owner
wants a "Write a review" form on the product page.

Because the store supports **guest checkout** (`Order.userId` is optional in
`prisma/schema.prisma`), most buyers have no account, so review submission must be
open to guests — which in turn means public, anonymous input that needs a gate
before it goes live.

## 2. Goal

Let anyone (guest or logged-in) submit a review from the product page; hold every
submission for admin approval; show only approved reviews on the storefront; give the
owner a simple moderation screen. Seeded reviews remain visible without moderation.

## 3. Decisions (approved)

- **Who can submit:** anyone — guest or logged-in. (Guest checkout makes a
  login-gate too restrictive.)
- **Moderation:** every submission is held `approved = false` and appears only after
  an admin approves it. Seeded reviews are pre-approved.
- **Name prefill:** for logged-in users the name field is prefilled from the session
  but remains editable; guests type their name.

## 4. Scope

**In scope**

- A "Write a review" form (interactive star rating + optional title + body + name +
  hidden honeypot) at the bottom of `ReviewsSection`.
- A `submitReview` Server Action with zod validation.
- An `approved Boolean @default(false)` column on `Review` (+ hand-authored
  migration + backfill of existing rows to `true`).
- Filtering **all four** review readers in `app/_lib/products.ts` to
  `approved: true`.
- A new `/admin/reviews` moderation page with **Approve** and **Delete**, busting the
  storefront cache on approve.

**Out of scope (v1, explicit)**

- Email capture (the `Review` model has no email column; moderation is by content).
- `userId` attribution and a "Verified Purchase" badge (future; enabled later by
  joining `Order → OrderItem`).
- Per-user / per-product duplicate prevention.
- Rate limiting (see §10, accepted risk).
- Editing, replying to, or voting on reviews.

## 5. Schema — `approved` boolean

Add to `model Review` (alongside `synthetic` from sub-project 1):

```prisma
approved    Boolean  @default(false)

@@index([approved])
```

Hand-authored migration (per the repo's no-local-DB workflow — SQL by hand, applied
via `migrate.yml`):

```sql
-- AlterTable
ALTER TABLE "Review" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Review_approved_idx" ON "Review"("approved");

-- Backfill: all reviews existing today are seeded/trusted, so make them visible.
UPDATE "Review" SET "approved" = true;
```

Two orthogonal booleans:

| Review kind | `synthetic` | `approved` |
|---|---|---|
| Seeded (from seed.ts / rewrite script) | `true` | `true` |
| Real submission, pending | `false` | `false` |
| Real submission, approved | `false` | `true` |

**Dependency on sub-project 1:** sub-project 1's seed review block also sets
`approved: true`. The `scripts/update-review-content.ts` rewrite is unaffected
(existing rows are already `approved: true` from the backfill; the script only edits
content fields).

## 6. The four-reader `approved` filter (load-bearing correctness)

`approved: true` is added to **all four** review readers in
[app/_lib/products.ts](../../../app/_lib/products.ts) as one indivisible change:

1. list-rating aggregate — `review.groupBy` (~line 38)
2. `getProductDetail` avg/count — `review.aggregate` (~line 147)
3. `getProductReviews` — `review.findMany` (~line 179)
4. `getReviewHistogram` — `review.groupBy` (~line 193)

The failure mode is adding the filter to three of four: if the list hides a pending
review but the aggregate still counts it, the star average and `ratingCount` are
wrong, and `ReviewsSection`'s `moreAvailable = reviews.length < ratingCount` desyncs.

**Verification test (proves completeness, since self-inspection cannot):** a product
with 1 approved + 1 pending review; assert the average, count, histogram, and
list-aggregate each reflect **only the approved review**.

## 7. Submission form

New client component `app/_components/product/review-form.tsx`, rendered at the bottom
of `ReviewsSection`:

- **Interactive star rating** — required, 1–5 (client state).
- **Body** — required, ≥ 10 characters.
- **Title** — optional (`Review.title` is nullable).
- **Name** — required; prefilled from the session for logged-in users (via a
  `defaultAuthorName` prop), editable.
- **Honeypot** — a visually-hidden field (e.g. `company`); if non-empty the action
  returns a fake success and silently drops the submission (bot filter).
- Built with `useActionState` and shadcn `Input`/`Textarea`/`Label`/`Button`, mirroring
  [contact-form.tsx](../../../app/contact/contact-form.tsx).
- On success the form is replaced with *"Thanks! Your review will appear once we've
  approved it."*

`ReviewsSection` receives `defaultAuthorName`;
[app/products/[id]/page.tsx](../../../app/products/[id]/page.tsx) supplies it by
calling `auth()`. The page already awaits `searchParams`, so it is dynamic and the
`auth()` call adds no rendering de-opt.

## 8. `submitReview` Server Action

`app/products/[id]/actions.ts`:

- `"use server"`, zod schema (rating 1–5 int, body min 10, title optional, name
  required, honeypot must be empty), returning
  `{ success?: boolean; error?: string; fieldErrors?: Record<string, string[]> }`
  exactly like `contact/actions.ts`.
- Reads `auth()` to source the author name (session name if the field is blank).
- Creates `Review { productId, authorName, rating, title, body, synthetic: false,
  approved: false }`.
- **No `revalidate*` on submit** — pending reviews are not displayed, so there is
  nothing to invalidate.

## 9. Admin moderation — `/admin/reviews`

- New page `app/admin/reviews/page.tsx` listing pending reviews
  (`where: { approved: false, synthetic: false }`) with product name, stars, author,
  body, and date. Protected by the existing admin layout auth guard.
- `app/admin/reviews/actions.ts`:
  - **approveReview(id)** → set `approved: true`, then
    **`revalidateTag("catalog", "max")`** — the same mechanism as
    [app/admin/categories/actions.ts:21](../../../app/admin/categories/actions.ts).
    All four readers carry the `"catalog"` cache tag, so one bust makes the review
    appear within seconds instead of waiting out the 300s revalidate window.
  - **deleteReview(id)** → delete spam/abuse; `revalidatePath("/admin/reviews")`.
- Follows the existing admin section shape (page + `actions.ts`).

## 10. Accepted risk

Open guest submission with no rate limiting means bots that slip past the honeypot can
**flood the moderation queue**. Accepted for v1: nothing reaches the public without
approval, so the blast radius is admin time, not the storefront. Rate limiting is a
noted future addition.

## 11. Files touched

- `prisma/schema.prisma` — edit (`approved` + index on `Review`)
- `prisma/migrations/<timestamp>_review_approved/migration.sql` — **new**, hand-authored
- `app/_lib/products.ts` — edit (four `approved: true` filters)
- `prisma/seed.ts` — edit (seeded reviews also `approved: true`)
- `app/_components/product/review-form.tsx` — **new** (client form)
- `app/_components/product/reviews-section.tsx` — edit (render form; accept `defaultAuthorName`)
- `app/products/[id]/page.tsx` — edit (pass `defaultAuthorName` from `auth()`)
- `app/products/[id]/actions.ts` — **new** (`submitReview`)
- `app/admin/reviews/page.tsx` — **new** (moderation list)
- `app/admin/reviews/actions.ts` — **new** (approve / delete)
- Tests — **new**: the four-reader `approved` filter (§6) and `submitReview` validation

## 12. Sequencing

Ship after sub-project 1 (it introduces `synthetic`, which this change's backfill and
seed edits assume). Both share the `Review` model and `seed.ts` review block, so the
two migrations (`synthetic`, then `approved`) apply in order.
