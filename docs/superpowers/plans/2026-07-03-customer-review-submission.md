# Customer Review Submission + Admin Moderation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone (guest or logged-in) submit a product review from the storefront; hold every submission for admin approval; show only approved reviews; give the owner an `/admin/reviews` moderation screen.

**Architecture:** A new `approved` boolean on `Review` gates visibility. All four review readers in `app/_lib/products.ts` filter `approved: true`. A client `ReviewForm` posts to a `submitReview` Server Action (zod-validated, honeypot-protected) that creates a pending review. An `/admin/reviews` page + actions approve (busting the `catalog` cache tag) or delete.

**Tech Stack:** Next.js 16 App Router, React Server/Client Components, Server Actions, Prisma (PostgreSQL), NextAuth v5, zod, shadcn/ui, sonner, Vitest.

**Spec:** [docs/superpowers/specs/2026-07-03-customer-review-submission-design.md](../specs/2026-07-03-customer-review-submission-design.md)

## Global Constraints

- **Depends on sub-project 1** ([realistic-category-reviews](2026-07-03-realistic-category-reviews.md)): the `Review.synthetic` column must already exist. This change's migration timestamp (`20260703130000`) sorts **after** sub-project 1's (`20260703120000`).
- **No local `DATABASE_URL`.** Never run `prisma migrate dev`, `npm run db:seed`, `next build`, or Playwright here. Migrations are hand-authored SQL applied later via `migrate.yml`. Browser/e2e verification is done by the owner in a DB-backed environment.
- **Type gate:** `npx tsc --noEmit`. **Test gate:** `npm run test` (full suite — path filters trip a `globalSetup` quirk). `npx prisma generate` after schema changes (DB-free).
- **Import paths (verified):** `prisma` → `@/app/_lib/prisma`; `auth` → `@/app/_lib/auth`; `requireAdmin` → `@/app/_lib/admin-auth`; shadcn `Input`/`Label`/`Textarea`/`Button` → `@/components/ui/*`; `cn` → `@/lib/utils`; `Star` → `lucide-react`.
- **Cache mechanism (verified):** the four review readers are `unstable_cache`d under tags `["catalog","product"]`; `revalidateTag("catalog", "max")` is the repo's storefront-bust call (`app/admin/categories/actions.ts:21`).
- **Server Action shape (verified):** `{ success?: boolean; error?: string; fieldErrors?: Record<string, string[]> }`, mirroring `app/contact/actions.ts`.
- **Commits:** Conventional Commits; end each message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `approved` column (schema + migration + seed consistency)

**Files:**
- Modify: `prisma/schema.prisma` (Review model)
- Create: `prisma/migrations/20260703130000_review_approved/migration.sql`
- Modify: `prisma/seed.ts` (seeded reviews also `approved: true`)

**Interfaces:**
- Consumes: `Review.synthetic` (from sub-project 1).
- Produces: `Review.approved: boolean` (default `false`) on the generated client, used by Tasks 2–5.

- [ ] **Step 1: Add the column + index to the schema**

In `prisma/schema.prisma`, `model Review` should read (note `synthetic` is already present from sub-project 1):

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
  approved    Boolean  @default(false)

  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, createdAt])
  @@index([approved])
}
```

- [ ] **Step 2: Hand-author the migration**

Create `prisma/migrations/20260703130000_review_approved/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Review" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Review_approved_idx" ON "Review"("approved");

-- Backfill: every review that exists today is seeded/trusted, so make it visible.
UPDATE "Review" SET "approved" = true;
```

- [ ] **Step 3: Set `approved: true` on seeded reviews**

In `prisma/seed.ts`, the review object (added in sub-project 1) gains one line:

```ts
      return {
        productId: p.id,
        authorName: pick(REVIEW_AUTHORS, rng),
        rating: tpl.rating,
        title: tpl.title,
        body: tpl.body,
        createdAt,
        synthetic: true,
        approved: true,
      };
```

- [ ] **Step 4: Validate schema, regenerate client, type-check**

Run: `npx prisma validate`
Expected: "schema … is valid 🚀".

Run: `npx prisma generate`
Expected: "Generated Prisma Client" (no DB needed).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260703130000_review_approved/migration.sql prisma/seed.ts
git commit -m "feat(reviews): add approved flag to Review for moderation

Hand-authored migration adds an approved boolean (default false) + index and
backfills all existing (seeded) reviews to true. Seeded reviews are marked
approved:true so they stay visible.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Filter all four review readers to `approved: true`

**Files:**
- Modify: `app/_lib/products.ts` (four `where` clauses)
- Test: `app/_lib/__tests__/reviews-approved-filter.test.ts`

**Interfaces:**
- Consumes: `Review.approved` (Task 1).
- Produces: storefront readers that count/show only approved reviews.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/reviews-approved-filter.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const {
  reviewGroupBy, reviewAggregate, reviewFindMany, productFindUnique, productFindMany,
} = vi.hoisted(() => ({
  reviewGroupBy: vi.fn(),
  reviewAggregate: vi.fn(),
  reviewFindMany: vi.fn(),
  productFindUnique: vi.fn(),
  productFindMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    review: { groupBy: reviewGroupBy, aggregate: reviewAggregate, findMany: reviewFindMany },
    product: { findUnique: productFindUnique, findMany: productFindMany },
  },
}));

import {
  getFeaturedProducts, getProductDetail, getProductReviews, getReviewHistogram,
} from "../products";

beforeEach(() => {
  reviewGroupBy.mockReset().mockResolvedValue([]);
  reviewAggregate.mockReset().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
  reviewFindMany.mockReset().mockResolvedValue([]);
  productFindUnique.mockReset().mockResolvedValue({
    id: "cat-white", name: "Cat", price: 2190, originalPrice: null, image: "/x.jpg",
    description: "d", stock: 5, categorySlug: "cat", sizes: "S,M,L,XL", archived: false,
    category: { slug: "cat", name: "Cat", image: "/x.jpg" }, images: [],
  });
  productFindMany.mockReset().mockResolvedValue([]);
});

describe("review readers only see approved reviews", () => {
  it("getProductReviews filters approved:true", async () => {
    await getProductReviews("cat-white", 5);
    expect(reviewFindMany.mock.calls[0][0].where.approved).toBe(true);
  });

  it("getReviewHistogram filters approved:true", async () => {
    await getReviewHistogram("cat-white");
    expect(reviewGroupBy.mock.calls[0][0].where.approved).toBe(true);
  });

  it("getProductDetail rating aggregate filters approved:true", async () => {
    await getProductDetail("cat-white");
    expect(reviewAggregate.mock.calls[0][0].where.approved).toBe(true);
  });

  it("list-rating aggregate filters approved:true", async () => {
    productFindMany.mockResolvedValueOnce([{
      id: "cat-white", name: "Cat", price: 2190, originalPrice: null,
      image: "/x.jpg", categorySlug: "cat", sizes: "S,M,L,XL",
    }]);
    await getFeaturedProducts();
    expect(reviewGroupBy.mock.calls[0][0].where.approved).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — all four cases fail (`where.approved` is `undefined`).

- [ ] **Step 3: Add the filter to all four readers**

In `app/_lib/products.ts`, add `approved: true` to each review `where`:

`attachAggregates` (~line 40):
```ts
  const grouped = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: ids }, approved: true },
    _avg: { rating: true },
    _count: { _all: true },
  });
```

`getProductDetail` rating aggregate (~line 147):
```ts
      prisma.review.aggregate({
        where: { productId: id, approved: true },
        _avg: { rating: true },
        _count: { _all: true },
      }),
```

`getProductReviews` (~line 179):
```ts
    return prisma.review.findMany({
      where: { productId, approved: true },
      orderBy: { createdAt: "desc" },
      take: safeTake,
    });
```

`getReviewHistogram` (~line 193):
```ts
    const rows = await prisma.review.groupBy({
      by: ["rating"],
      where: { productId, approved: true },
      _count: { _all: true },
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — all four cases green; existing `featured-products` tests still pass.

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add app/_lib/products.ts app/_lib/__tests__/reviews-approved-filter.test.ts
git commit -m "feat(reviews): show only approved reviews on the storefront

All four review readers (list aggregate, product detail avg/count, review list,
histogram) now filter approved:true so pending submissions never affect public
ratings or listings.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `submitReview` Server Action

**Files:**
- Create: `app/products/[id]/actions.ts`
- Test: `app/products/[id]/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `prisma` (`review.create`, `product.findUnique`), `auth`, `Review.approved`/`synthetic`.
- Produces:
  - `type ReviewFormState = { success?: boolean; error?: string; fieldErrors?: Record<string, string[]> }`
  - `submitReview(productId: string, prevState: ReviewFormState, formData: FormData): Promise<ReviewFormState>` — bound with `productId` in the form via `.bind(null, productId)`.

- [ ] **Step 1: Write the failing test**

Create `app/products/[id]/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { reviewCreate, productFindUnique, authMock } = vi.hoisted(() => ({
  reviewCreate: vi.fn(),
  productFindUnique: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { review: { create: reviewCreate }, product: { findUnique: productFindUnique } },
}));
vi.mock("@/app/_lib/auth", () => ({ auth: authMock }));

import { submitReview, type ReviewFormState } from "../actions";

const empty: ReviewFormState = {};
function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  reviewCreate.mockReset().mockResolvedValue({ id: "r1" });
  productFindUnique.mockReset().mockResolvedValue({ id: "cat-white" });
  authMock.mockReset().mockResolvedValue(null);
});

describe("submitReview", () => {
  it("creates a pending, non-synthetic review on valid input", async () => {
    const res = await submitReview("cat-white", empty, fd({
      rating: "5", title: "Cute", body: "The cat print is lovely and soft.", authorName: "Nimal",
    }));
    expect(res.success).toBe(true);
    const data = reviewCreate.mock.calls[0][0].data;
    expect(data.approved).toBe(false);
    expect(data.synthetic).toBe(false);
    expect(data.rating).toBe(5);
    expect(data.productId).toBe("cat-white");
  });

  it("rejects a body under 10 chars with a field error", async () => {
    const res = await submitReview("cat-white", empty, fd({
      rating: "4", body: "short", authorName: "Nimal",
    }));
    expect(res.fieldErrors?.body).toBeDefined();
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range rating", async () => {
    const res = await submitReview("cat-white", empty, fd({
      rating: "9", body: "The cat print is lovely and soft.", authorName: "Nimal",
    }));
    expect(res.fieldErrors?.rating).toBeDefined();
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("silently drops honeypot submissions", async () => {
    const res = await submitReview("cat-white", empty, fd({
      rating: "5", body: "The cat print is lovely and soft.", authorName: "Bot", company: "spam",
    }));
    expect(res.success).toBe(true);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("falls back to the session name when the name field is blank", async () => {
    authMock.mockResolvedValueOnce({ user: { name: "Session User" } });
    await submitReview("cat-white", empty, fd({
      rating: "5", body: "The cat print is lovely and soft.", authorName: "",
    }));
    expect(reviewCreate.mock.calls[0][0].data.authorName).toBe("Session User");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — `../actions` has no `submitReview` export.

- [ ] **Step 3: Write the action**

Create `app/products/[id]/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { auth } from "@/app/_lib/auth";

export type ReviewFormState = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Please select a star rating").max(5, "Please select a star rating"),
  title: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  body: z.string().trim().min(10, "Review must be at least 10 characters").max(2000),
  authorName: z.string().trim().min(1, "Please enter your name").max(80),
});

export async function submitReview(
  productId: string,
  prevState: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  // Honeypot: a hidden field real users never fill. Pretend success and drop.
  if (((formData.get("company") as string) || "").trim() !== "") {
    return { success: true };
  }

  const session = await auth();

  const parsed = reviewSchema.safeParse({
    rating: formData.get("rating"),
    title: (formData.get("title") as string) || "",
    body: formData.get("body"),
    authorName:
      ((formData.get("authorName") as string) || "").trim() ||
      session?.user?.name ||
      "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0] as string;
      (fieldErrors[path] ??= []).push(issue.message);
    }
    return { error: "Please fix the errors below", fieldErrors };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) return { error: "Product not found." };

  try {
    await prisma.review.create({
      data: {
        productId,
        authorName: parsed.data.authorName,
        rating: parsed.data.rating,
        title: parsed.data.title,
        body: parsed.data.body,
        synthetic: false,
        approved: false,
      },
    });
  } catch {
    return { error: "Could not submit your review. Please try again." };
  }

  return { success: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — all five `submitReview` cases green.

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add app/products/[id]/actions.ts "app/products/[id]/__tests__/actions.test.ts"
git commit -m "feat(reviews): add submitReview server action (pending + honeypot)

Zod-validated, honeypot-protected action that creates reviews as
synthetic:false, approved:false so they await moderation. Falls back to the
session name for logged-in users.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `ReviewForm` component + product-page wiring

**Files:**
- Create: `app/_components/product/review-form.tsx`
- Modify: `app/_components/product/reviews-section.tsx` (accept `defaultAuthorName`, render form)
- Modify: `app/products/[id]/page.tsx` (pass `defaultAuthorName` from `auth()`)

**Interfaces:**
- Consumes: `submitReview`, `ReviewFormState` (Task 3).
- Produces: a rendered "Write a review" form on every product page.

- [ ] **Step 1: Create the form component**

Create `app/_components/product/review-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Star, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitReview, type ReviewFormState } from "@/app/products/[id]/actions";

const initialState: ReviewFormState = {};

export function ReviewForm({
  productId,
  defaultAuthorName,
}: {
  productId: string;
  defaultAuthorName: string;
}) {
  const action = submitReview.bind(null, productId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  if (state.success) {
    return (
      <div className="rounded-lg border bg-green-50 p-6 text-center dark:bg-green-900/20">
        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <p className="font-medium text-green-800 dark:text-green-200">
          Thanks! Your review will appear once we&apos;ve approved it.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="relative space-y-4 rounded-lg border p-6">
      <h3 className="font-heading text-lg font-semibold">Write a review</h3>

      {state.error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Rating</Label>
        <input type="hidden" name="rating" value={rating} />
        <div className="flex gap-1" role="radiogroup" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5"
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-colors",
                  (hover || rating) >= n
                    ? "fill-amber-400 stroke-amber-400"
                    : "fill-transparent stroke-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
        {state.fieldErrors?.rating && (
          <p className="text-xs text-red-600">{state.fieldErrors.rating[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-name">Name</Label>
        <Input id="review-name" name="authorName" defaultValue={defaultAuthorName} maxLength={80} />
        {state.fieldErrors?.authorName && (
          <p className="text-xs text-red-600">{state.fieldErrors.authorName[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-title">Title (optional)</Label>
        <Input id="review-title" name="title" maxLength={120} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-body">Your review</Label>
        <Textarea id="review-body" name="body" rows={4} maxLength={2000} />
        {state.fieldErrors?.body && (
          <p className="text-xs text-red-600">{state.fieldErrors.body[0]}</p>
        )}
      </div>

      {/* Honeypot — off-screen; bots fill it, humans don't. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Render the form in `ReviewsSection`**

In `app/_components/product/reviews-section.tsx`:

Add the import near the top:
```tsx
import { ReviewForm } from "./review-form";
```

Add `defaultAuthorName` to `Props`:
```tsx
type Props = {
  productId: string;
  reviews: Review[];
  histogram: ReviewHistogram;
  ratingAvg: number;
  ratingCount: number;
  shown: number;
  defaultAuthorName: string;
};
```

Destructure it and render the form at the end of the section (so it shows even with zero reviews). Replace the component's `return (...)` closing so the structure is:

```tsx
export function ReviewsSection({
  productId, reviews, histogram, ratingAvg, ratingCount, shown, defaultAuthorName,
}: Props) {
  const hasReviews = ratingCount > 0;
  const moreAvailable = reviews.length < ratingCount;

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="space-y-6">
      <h2 id="reviews-heading" className="font-heading text-xl font-semibold tracking-tight">
        Customer reviews
      </h2>

      {!hasReviews ? (
        <p className="text-sm text-muted-foreground">No reviews yet. Be the first to write one.</p>
      ) : (
        <>
          {/* ... existing summary + histogram + list + "Show more" block, unchanged ... */}
        </>
      )}

      <ReviewForm productId={productId} defaultAuthorName={defaultAuthorName} />
    </section>
  );
}
```

Keep the existing summary/histogram/list JSX exactly as-is inside the `<>...</>`; only the `Props` type, the destructure, the empty-state copy, and the trailing `<ReviewForm />` change.

- [ ] **Step 3: Pass `defaultAuthorName` from the product page**

In `app/products/[id]/page.tsx`:

Add the import:
```tsx
import { auth } from "@/app/_lib/auth";
```

In `ProductPage`, after resolving `detail`, get the session (the page already awaits `searchParams`, so it is dynamic — this adds no de-opt):
```tsx
  const session = await auth();
```

Pass the prop into `<ReviewsSection ... />`:
```tsx
          <ReviewsSection
            productId={detail.product.id}
            reviews={reviews}
            histogram={histogram}
            ratingAvg={detail.ratingAvg}
            ratingCount={detail.ratingCount}
            shown={shown}
            defaultAuthorName={session?.user?.name ?? ""}
          />
```

- [ ] **Step 4: Type-check + full test run**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test`
Expected: PASS (unchanged; no new tests here — the component is verified by the owner in a DB-backed browser env per Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add app/_components/product/review-form.tsx app/_components/product/reviews-section.tsx "app/products/[id]/page.tsx"
git commit -m "feat(reviews): add Write a review form to the product page

Interactive star rating + name/title/body with a honeypot, wired to
submitReview. Name is prefilled from the session for logged-in users. The form
renders even when a product has no reviews yet.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `/admin/reviews` moderation page

**Files:**
- Create: `app/admin/reviews/actions.ts`
- Test: `app/admin/reviews/__tests__/actions.test.ts`
- Create: `app/_components/admin/reviews/reviews-moderation-table.tsx`
- Create: `app/admin/reviews/page.tsx`
- Modify: `app/_components/admin/admin-sidebar.tsx` (nav link)

**Interfaces:**
- Consumes: `prisma` (`review.update`/`delete`/`findMany`), `requireAdmin`, `revalidateTag`/`revalidatePath`, `Review.approved`.
- Produces:
  - `approveReview(id: string): Promise<ReviewModerationResult>`
  - `deleteReview(id: string): Promise<ReviewModerationResult>`
  - `type ReviewModerationResult = { success: true } | { success: false; error: string }`

- [ ] **Step 1: Write the failing test for the actions**

Create `app/admin/reviews/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { reviewUpdate, reviewDelete, revalidatePath, revalidateTag, requireAdmin } =
  vi.hoisted(() => ({
    reviewUpdate: vi.fn(),
    reviewDelete: vi.fn(),
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
    requireAdmin: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: { review: { update: reviewUpdate, delete: reviewDelete } },
}));
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));

import { approveReview, deleteReview } from "../actions";

beforeEach(() => {
  reviewUpdate.mockReset().mockResolvedValue({ id: "r1" });
  reviewDelete.mockReset().mockResolvedValue({ id: "r1" });
  revalidatePath.mockReset();
  revalidateTag.mockReset();
  requireAdmin.mockReset().mockResolvedValue({ user: { name: "Admin" } });
});

describe("review moderation actions", () => {
  it("approveReview sets approved:true and busts the catalog cache", async () => {
    const res = await approveReview("r1");
    expect(res.success).toBe(true);
    expect(reviewUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "r1" }, data: { approved: true },
    });
    expect(revalidateTag).toHaveBeenCalledWith("catalog", "max");
  });

  it("approveReview requires admin", async () => {
    await approveReview("r1");
    expect(requireAdmin).toHaveBeenCalled();
  });

  it("deleteReview removes the review", async () => {
    const res = await deleteReview("r1");
    expect(res.success).toBe(true);
    expect(reviewDelete.mock.calls[0][0]).toMatchObject({ where: { id: "r1" } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — `../actions` has no `approveReview`/`deleteReview`.

- [ ] **Step 3: Write the actions**

Create `app/admin/reviews/actions.ts`:

```ts
"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";

export type ReviewModerationResult =
  | { success: true }
  | { success: false; error: string };

export async function approveReview(id: string): Promise<ReviewModerationResult> {
  await requireAdmin();
  try {
    await prisma.review.update({ where: { id }, data: { approved: true } });
  } catch {
    return { success: false, error: "Could not approve review." };
  }
  revalidatePath("/admin/reviews");
  revalidateTag("catalog", "max"); // refresh the four cached storefront review readers
  return { success: true };
}

export async function deleteReview(id: string): Promise<ReviewModerationResult> {
  await requireAdmin();
  try {
    await prisma.review.delete({ where: { id } });
  } catch {
    return { success: false, error: "Could not delete review." };
  }
  revalidatePath("/admin/reviews");
  return { success: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — all three moderation-action cases green.

- [ ] **Step 5: Write the moderation table (client)**

Create `app/_components/admin/reviews/reviews-moderation-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { approveReview, deleteReview } from "@/app/admin/reviews/actions";

export type ModerationRow = {
  id: string;
  productName: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
};

export function ReviewsModerationTable({ rows }: { rows: ModerationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No reviews awaiting approval.</p>;
  }

  function run(
    id: string,
    fn: () => Promise<{ success: boolean; error?: string }>,
    ok: string,
  ) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      if (res.success) toast.success(ok);
      else toast.error(res.error ?? "Something went wrong");
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border p-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">{r.productName}</span>
            <span className="text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="mb-1 flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                aria-hidden
                className={
                  "h-3.5 w-3.5 " +
                  (i < r.rating
                    ? "fill-amber-400 stroke-amber-400"
                    : "fill-transparent stroke-muted-foreground")
                }
              />
            ))}
            <span className="ml-2 text-sm text-muted-foreground">{r.authorName}</span>
          </div>
          {r.title && <p className="font-medium">{r.title}</p>}
          <p className="text-sm leading-relaxed">{r.body}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending && busyId === r.id}
              onClick={() => run(r.id, () => approveReview(r.id), "Review approved")}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending && busyId === r.id}
              onClick={() => run(r.id, () => deleteReview(r.id), "Review deleted")}
              className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Write the admin page**

Create `app/admin/reviews/page.tsx`:

```tsx
import { prisma } from "@/app/_lib/prisma";
import { ReviewsModerationTable } from "@/app/_components/admin/reviews/reviews-moderation-table";

export default async function AdminReviewsPage() {
  const pending = await prisma.review.findMany({
    where: { approved: false, synthetic: false },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { name: true } } },
  });
  const rows = pending.map((r) => ({
    id: r.id,
    productName: r.product.name,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <span className="text-sm text-muted-foreground">{rows.length} pending</span>
      </div>
      <ReviewsModerationTable rows={rows} />
    </section>
  );
}
```

- [ ] **Step 7: Add the sidebar nav link**

In `app/_components/admin/admin-sidebar.tsx`, add a Reviews entry to `ADMIN_NAV` after Categories:

```tsx
export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
] as const;
```

- [ ] **Step 8: Type-check + full test run**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/admin/reviews app/_components/admin/reviews app/_components/admin/admin-sidebar.tsx
git commit -m "feat(reviews): add /admin/reviews moderation page

Lists pending (approved:false, synthetic:false) reviews with Approve/Delete.
Approve flips approved:true and busts the catalog cache tag so the review shows
on the storefront within seconds. Adds a Reviews link to the admin sidebar.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Post-implementation: owner verification

- Apply both migrations (`synthetic`, then `approved`) to prod via `migrate.yml`.
- In a DB-backed environment: submit a review on a product page → confirm it does **not** appear and the average is unchanged; approve it in `/admin/reviews` → confirm it appears within seconds and the count/average update. (Playwright `npm run test:e2e` is available for this flow in a DB-backed env.)

## Self-review notes

- **Spec coverage:** `approved` column + migration + backfill (§5) → T1; four-reader filter + completeness test (§6) → T2; `submitReview` + honeypot + zod (§7, §8) → T3; form + star input + prefill + placement (§7) → T4; `/admin/reviews` page/actions + `revalidateTag` + sidebar (§9) → T5; accepted risk (§10) recorded in spec. All mapped.
- **Type consistency:** `ReviewFormState` defined in T3 and imported in T4; `ReviewModerationResult` defined in T5; `submitReview` bound with `productId` in T4 matches its `(productId, prevState, formData)` signature in T3; `defaultAuthorName` prop added to `ReviewsSection` in T4 and supplied in T4 Step 3.
- **No placeholders:** every code/command step is complete and literal.
- **DB constraint honored:** no task runs migrate/seed/build; gates are `tsc` + `npm run test`; runtime behaviour is owner-verified.
