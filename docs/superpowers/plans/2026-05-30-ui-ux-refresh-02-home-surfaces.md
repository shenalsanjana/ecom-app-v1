# UI/UX Refresh — Plan 02: Home Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the storefront's first impression — a site-wide announcement bar, a Fraunces wordmark + refined nav, an editorial hero, editorial category tiles, and an elevated product card/grid (tall 4:5 imagery, category eyebrow, single Add-to-cart) — reusing the boutique palette and Plan 01 primitives.

**Architecture:** Mostly presentational edits to existing server/client components. No data-model changes. Pure styling is verified with `npm run build` + visual check (this repo has **no** RTL/jsdom — do not write `render()` tests). The one piece of logic (category-slug prettifier) is TDD'd with vitest. Each task is independently committable and leaves the app building.

**Tech Stack:** Next.js 16 (App Router, React 19), Tailwind v4 (existing cream/cocoa/olive tokens: `bg-primary`, `text-brand`, `font-heading` = Fraunces, etc.), shadcn, lucide-react, vitest (node env).

**Spec:** `docs/superpowers/specs/2026-05-30-ui-ux-boutique-refresh-design.md`
**Builds on:** Plan 01 (foundation primitives — already merged into this branch).

**Carried decisions:** colour swatches are CUT (no colour data); category sub-labels OMITTED (no grouping data); product card shows a SINGLE "Add to cart" (the "Buy now" express path is removed).

> **Note on ProductCard reuse:** `ProductCard` is used on the home grid, related-strip, search, and category pages. Task 7's visual changes (4:5 image, single CTA) therefore apply to **all** product cards site-wide — this is intended (consistency). Required props are unchanged (the new `category` is optional), so all call sites keep compiling.

---

### Task 1: Site-wide `AnnouncementBar`

**Files:**
- Create: `app/_components/shared/announcement-bar.tsx`
- Modify: `app/layout.tsx` (render it once, at the top of `<body>`)

- [ ] **Step 1: Create the component**

```tsx
// app/_components/shared/announcement-bar.tsx
import { FREE_DELIVERY_THRESHOLD } from "@/app/_lib/checkout-config";
import { formatPrice } from "@/app/_lib/format";

// Site-wide promo strip: free-shipping threshold + Koko/Mintpay "pay in 3".
// Scrolls away above the sticky header. Static (not dismissible) by design.
export function AnnouncementBar() {
  return (
    <div className="bg-primary text-primary-foreground">
      <p className="mx-auto max-w-7xl px-4 py-2 text-center text-xs tracking-wide sm:px-6 lg:px-8">
        Free shipping over{" "}
        <span className="font-medium">{formatPrice(FREE_DELIVERY_THRESHOLD)}</span>
        {"  ·  "}Pay in 3 interest-free with{" "}
        <span className="font-medium">Koko</span> &amp;{" "}
        <span className="font-medium">Mintpay</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Confirm the threshold export exists**

Run: `npx grep -n "FREE_DELIVERY_THRESHOLD" app/_lib/checkout-config.ts` (or use the Grep tool).
Expected: a line like `export const FREE_DELIVERY_THRESHOLD = ...`. If it is NOT exported there, STOP and report BLOCKED.

- [ ] **Step 3: Render it once at the top of `<body>` in `app/layout.tsx`**

Add the import near the other component imports:

```tsx
import { AnnouncementBar } from "@/app/_components/shared/announcement-bar";
```

Then change the body open from:

```tsx
      <body className="min-h-full flex flex-col">
        <SessionProvider>
```

to:

```tsx
      <body className="min-h-full flex flex-col">
        <AnnouncementBar />
        <SessionProvider>
```

(It needs no providers; placing it first keeps it as the top flex child, scrolling away above each page's sticky header.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add app/_components/shared/announcement-bar.tsx app/layout.tsx
git commit -m "feat(ui): add site-wide announcement bar (free shipping + pay in 3)"
```

---

### Task 2: Header wordmark + refined nav

**Files:**
- Modify: `app/_components/home/site-header.tsx`

Make the logo a Fraunces wordmark and give the nav an uppercase, letter-spaced treatment.

- [ ] **Step 1: Update the logo and nav classes**

In `app/_components/home/site-header.tsx`:

Change the logo `Link` from:
```tsx
        <Link href="/" className="text-lg font-semibold tracking-tight">Dressing Bear</Link>
```
to:
```tsx
        <Link href="/" className="font-heading text-xl font-semibold tracking-tight text-foreground">Dressing Bear</Link>
```

Change the nav link `className` from:
```tsx
              className="text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
```
to:
```tsx
              className="text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
```

Leave the search form, icons, and structure unchanged.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/site-header.tsx
git commit -m "feat(ui): Fraunces wordmark + refined uppercase nav in header"
```

---

### Task 3: Editorial hero

**Files:**
- Modify: `app/_components/home/hero.tsx`

Replace the bottom-up black gradient with a directional one (keeps the image visible), tighten the headline, and make the primary CTA confident with a quieter secondary.

- [ ] **Step 1: Replace the gradient + content block**

In `app/_components/home/hero.tsx`, change the gradient overlay from:
```tsx
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
```
to:
```tsx
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-black/5" />
```

Change the eyebrow paragraph from:
```tsx
            <p className="text-sm font-medium uppercase tracking-wider text-white/85">
              Spring collection
            </p>
```
to:
```tsx
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-white/80">
              Spring Collection 2026
            </p>
```

Change the secondary CTA from:
```tsx
              <Link
                href="/categories"
                className={buttonVariants({
                  size: "lg",
                  variant: "outline",
                  className:
                    "border-white/70 bg-white/10 text-white hover:bg-white/20 hover:text-white",
                })}
              >
                Browse categories
              </Link>
```
to:
```tsx
              <Link
                href="/categories"
                className="inline-flex items-center gap-2 border-b border-white/70 pb-1 text-sm font-medium text-white transition-colors hover:border-white"
              >
                Browse categories <ArrowRight className="h-4 w-4" />
              </Link>
```

Leave the image, container, primary "Shop now" button, headline `<h1>`, and sub-paragraph as they are.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`. (`ArrowRight` is already imported in this file.)

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/hero.tsx
git commit -m "feat(ui): editorial hero — directional gradient + refined CTAs"
```

---

### Task 4: Editorial category tiles

**Files:**
- Modify: `app/_components/home/category-strip.tsx`

Replace the small round thumbnails with larger 3:4 editorial tiles (name over a soft gradient, hover zoom). No sub-label (no grouping data).

- [ ] **Step 1: Replace the `<ul>` list markup**

In `app/_components/home/category-strip.tsx`, replace the entire `<ul>...</ul>` block with:

```tsx
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-muted"
              >
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="(min-width:1024px) 16vw, (min-width:640px) 33vw, 50vw"
                  className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-3 text-sm font-semibold text-white">
                  {c.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
```

(Keep the existing `<section>`, heading, and `getCategories()` call as-is.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/category-strip.tsx
git commit -m "feat(ui): editorial category tiles replace round thumbnails"
```

---

### Task 5: `prettifyCategory` slug helper (for the card eyebrow)

**Files:**
- Create: `app/_lib/category-label.ts`
- Test: `app/_lib/__tests__/category-label.test.ts`

The product `category` field is a slug (e.g. `"t-shirts"`). The card eyebrow shows a Title-Cased label.

- [ ] **Step 1: Write the failing test**

```ts
// app/_lib/__tests__/category-label.test.ts
import { describe, it, expect } from "vitest";
import { prettifyCategory } from "../category-label";

describe("prettifyCategory", () => {
  it("title-cases a hyphenated slug", () => {
    expect(prettifyCategory("t-shirts")).toBe("T-Shirts");
    expect(prettifyCategory("day-dresses")).toBe("Day Dresses");
  });

  it("handles a single word", () => {
    expect(prettifyCategory("denim")).toBe("Denim");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(prettifyCategory("")).toBe("");
    expect(prettifyCategory("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `npx vitest run app/_lib/__tests__/category-label.test.ts`
Expected: FAIL — `Cannot find module '../category-label'`.

- [ ] **Step 3: Write the helper**

```ts
// app/_lib/category-label.ts
// Product category is stored as a slug. Render a human label for UI eyebrows.
// Rule: split on hyphens, capitalise each token. Join with a hyphen when the
// first token is a single letter (e.g. "t-shirts" -> "T-Shirts"); otherwise
// join with spaces ("day-dresses" -> "Day Dresses").
export function prettifyCategory(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("-").map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p));
  const joiner = parts[0]?.length === 1 ? "-" : " ";
  return parts.join(joiner);
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `npx vitest run app/_lib/__tests__/category-label.test.ts`
Expected: PASS (3 tests). (`"t-shirts"`→`"T-Shirts"`, `"day-dresses"`→`"Day Dresses"`, `"denim"`→`"Denim"`, `""`→`""`.)

- [ ] **Step 5: Commit**

```bash
git add app/_lib/category-label.ts app/_lib/__tests__/category-label.test.ts
git commit -m "feat(ui): add prettifyCategory slug-to-label helper"
```

---

### Task 6: Parameterise `AddToCartDialog` trigger

**Files:**
- Modify: `app/_components/cart/add-to-cart-dialog.tsx`

The product card needs the Add-to-cart trigger as a full-width **primary** button. Add optional props that default to the current behaviour (so existing usage is unchanged).

- [ ] **Step 1: Add optional trigger props**

In `app/_components/cart/add-to-cart-dialog.tsx`, extend the `Props` type:

```tsx
type Props = {
  productId: string;
  name: string;
  price: number;
  image: string;
  sizes: string;
  triggerVariant?: "outline" | "default";
  triggerClassName?: string;
};
```

Update the function signature destructuring:

```tsx
export function AddToCartDialog({
  productId,
  name,
  price,
  image,
  sizes,
  triggerVariant = "outline",
  triggerClassName = "flex-1 min-w-0 whitespace-nowrap",
}: Props) {
```

Change the `DialogTrigger` className from:

```tsx
        className={buttonVariants({
          size: "sm",
          variant: "outline",
          className: "flex-1 min-w-0 whitespace-nowrap",
        })}
```
to:
```tsx
        className={buttonVariants({
          size: "sm",
          variant: triggerVariant,
          className: triggerClassName,
        })}
```

Leave everything else (dialog body, size picker, add logic) unchanged.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`. (Existing call site in `quick-buy-buttons.tsx` still compiles — the new props are optional and default to today's values.)

- [ ] **Step 3: Commit**

```bash
git add app/_components/cart/add-to-cart-dialog.tsx
git commit -m "refactor(cart): make AddToCartDialog trigger variant/class configurable"
```

---

### Task 7: Elevated product card (tall imagery, eyebrow, single CTA)

**Files:**
- Modify: `app/_components/home/product-card.tsx`
- Delete: `app/_components/cart/quick-buy-buttons.tsx` (the "Buy now" express path is removed; this becomes dead code)

- [ ] **Step 1: Confirm `QuickBuyButtons` has no other consumers**

Run (Grep tool): search the repo for `QuickBuyButtons`.
Expected: references only in `app/_components/home/product-card.tsx` (import + usage) and its own file. If it is imported anywhere else, STOP and report DONE_WITH_CONCERNS instead of deleting.

- [ ] **Step 2: Rewrite `product-card.tsx`**

Replace the entire file with:

```tsx
// app/_components/home/product-card.tsx
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { AddToCartDialog } from "@/app/_components/cart/add-to-cart-dialog";
import { WishlistHeart } from "@/app/_components/wishlist/wishlist-heart";
import { formatPrice } from "@/app/_lib/format";
import { prettifyCategory } from "@/app/_lib/category-label";

export type ProductCardProps = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  image: string;
  rating: number;
  reviewCount: number;
  sizes: string;
  category?: string;
  fromPath?: string;
};

function discountPct(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

export function ProductCard({
  id,
  name,
  price,
  originalPrice,
  image,
  rating,
  reviewCount,
  sizes,
  category,
  fromPath = "/",
}: ProductCardProps) {
  const onSale = originalPrice != null && originalPrice > price;
  const pct = onSale ? discountPct(price, originalPrice as number) : 0;
  const href = `/products/${id}`;
  const eyebrow = category ? prettifyCategory(category) : "";

  return (
    <Card className="group overflow-hidden p-0">
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {onSale && (
          <Badge
            variant="outline"
            className="absolute left-3 top-3 z-10 bg-card/90 text-brand"
          >
            -{pct}%
          </Badge>
        )}
        <Link href={href} aria-label={name} className="absolute inset-0">
          <Image
            src={image}
            alt={name}
            fill
            sizes="(min-width:1024px) 25vw, 50vw"
            className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105"
          />
        </Link>
        <div className="absolute right-2 top-2 z-10">
          <WishlistHeart productId={id} fromPath={fromPath} />
        </div>
      </div>
      <CardContent className="space-y-1.5 p-4">
        {eyebrow && (
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h3 className="font-heading line-clamp-2 min-h-[2.75rem] text-base font-medium leading-snug">
          <Link href={href} className="hover:underline underline-offset-4">{name}</Link>
        </h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
          <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
          <span>({reviewCount.toLocaleString()})</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={"font-heading text-base font-semibold " + (onSale ? "text-brand" : "")}>
            {formatPrice(price)}
          </span>
          {onSale && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(originalPrice as number)}
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <AddToCartDialog
          productId={id}
          name={name}
          price={price}
          image={image}
          sizes={sizes}
          triggerVariant="default"
          triggerClassName="w-full"
        />
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 3: Delete the now-unused `quick-buy-buttons.tsx`**

Run:
```bash
git rm app/_components/cart/quick-buy-buttons.tsx
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, and no error about a missing `QuickBuyButtons` import anywhere.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/product-card.tsx
git commit -m "feat(ui): elevate product card — 4:5 imagery, category eyebrow, single add-to-cart"
```

---

### Task 8: Product grid section header + category eyebrow wiring

**Files:**
- Modify: `app/_components/home/product-grid.tsx`

Add an eyebrow + underlined "View all", and pass `category` so the card eyebrow renders.

- [ ] **Step 1: Update the section header and ProductCard props**

In `app/_components/home/product-grid.tsx`, replace the header `<div>` from:
```tsx
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Featured products</h2>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            View all
          </a>
        </div>
```
to:
```tsx
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand">Editor's picks</p>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Featured products</h2>
          </div>
          <a href="/categories" className="border-b border-border pb-0.5 text-sm font-medium text-foreground hover:border-foreground">
            View all
          </a>
        </div>
```

Then add `category={p.category}` to the `<ProductCard ... />` props (the featured product object exposes `category`):
```tsx
              sizes={p.sizes}
              category={p.category}
              fromPath="/"
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/product-grid.tsx
git commit -m "feat(ui): editorial product-grid header + category eyebrow wiring"
```

---

## Visual verification (controller, after all tasks)

Component changes are not unit-tested (no RTL). After Task 8, the controller runs the app and
visually confirms the home page: announcement bar, wordmark, hero gradient/CTAs, category
tiles, and the elevated cards (tall imagery, eyebrow, single Add-to-cart). Use the `run`/`verify`
skill or `npm run dev` + a screenshot of `/`.

## Self-Review

**Spec coverage (Home surfaces slice):**
- Announcement bar (free shipping + pay in 3) → Task 1 ✅
- Fraunces wordmark + refined nav → Task 2 ✅
- Editorial hero (directional gradient, eyebrow, CTAs) → Task 3 ✅
- Editorial category tiles (no sub-label) → Task 4 ✅
- Category eyebrow on card → Tasks 5 + 7 + 8 ✅
- Elevated card: 4:5 imagery, quieter badge, hover zoom, single Add-to-cart → Tasks 6 + 7 ✅
- Editorial grid header → Task 8 ✅
- Swatches → correctly absent (cut) ✅
- Product page, cart, checkout, footer, type/spacing pass → out of scope (Plans 03–05) ✅

**Placeholder scan:** none — every step has exact paths, full code, exact commands, and
expected output.

**Type consistency:** `prettifyCategory` (Task 5) imported in Task 7. `AddToCartDialog`'s new
`triggerVariant`/`triggerClassName` props (Task 6) are exactly the ones passed by the card
(Task 7). `ProductCardProps.category?` (Task 7) is the optional prop set in Task 8. `category`
exists on the featured-product objects (`ProductView.category`, a slug).

**Carry-forward:** Plans 03–05 wire `InstallmentNote`/`StockIndicator`/`PaymentMethodIcon` into
the product page, cart, and checkout, and handle the alternate-mobile migration + footer.
