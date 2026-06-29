# Storefront Cohesion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared design-language foundation (tokens + 8 presentational primitives) for the customer storefront and prove it by refactoring `ProductCard` and the home section headers onto it.

**Architecture:** Extract small, presentational, dependency-light React primitives under `app/_components/ui/` plus one pure pricing helper under `app/_lib/`. Each primitive encodes one approved token decision (spacing, Poppins type roles, restrained motion). The existing shadcn `Card`/`Button`/`Badge` stay; we align tokens, not replace them. `ProductCard` + home headers are the reference consumers that validate the system end-to-end.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Tailwind CSS v4, shadcn (Base UI), lucide-react, Vitest (node env).

## Global Constraints

These apply to **every** task:

- **Validation gate is `npx tsc --noEmit` + `npm run test`.** No `next build` and no Prisma commands — there is no local database in this environment (prerender/migrate fail here).
- **Vitest runs in node env (`environment: "node"`, no RTL/jsdom).** TDD applies to **pure logic only**. Components are verified by `tsc` + visual review — **never write `render()` / DOM tests for `.tsx`**.
- **WCAG AA preserved.** Sale/brand color stays olive (`text-brand`), never red. Re-run `npm run check:contrast` after any token edit; it must pass.
- **No dark mode.** Do not add `.dark` blocks or new `dark:` semantics.
- **No new webfonts.** Poppins only (`--font-sans` / `--font-heading` both Poppins).
- **Keep shadcn primitives.** Do not fork/replace `components/ui/{card,button,badge}.tsx`.
- **Imports:** `@` alias = repo root. Use `cn` from `@/lib/utils`. Reuse `formatPrice` from `@/app/_lib/format` — do not duplicate currency formatting.
- **New primitives live in `app/_components/ui/`** (storefront-specific), distinct from shadcn's generic `components/ui/`.
- **Spacing decisions (Balanced):** section padding `py-12 md:py-20`; grid gap `gap-6` (24px); section-header offset `mb-10` (40px); container `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app/_lib/pricing.ts` | `discountPct` pure helper (extracted from product-card) |
| `app/_lib/__tests__/pricing.test.ts` | Unit tests for `discountPct` |
| `docs/superpowers/tokens-reference.md` | Human-readable spacing/type/motion/focus token reference |
| `app/_components/ui/eyebrow.tsx` | `Eyebrow` label (tone: brand \| inverse) |
| `app/_components/ui/text-link.tsx` | `TextLink` animated-underline link + focus ring |
| `app/_components/ui/price.tsx` | `Price` current + optional original |
| `app/_components/ui/rating.tsx` | `Rating` star + value + count |
| `app/_components/ui/sale-badge.tsx` | `SaleBadge` rounded olive `−N%` chip |
| `app/_components/ui/section.tsx` | `Section` + `Container` layout primitives |
| `app/_components/ui/section-header.tsx` | `SectionHeader` (eyebrow + title + optional action) |
| `app/_components/home/product-card.tsx` | **Modify** — consume Price/Rating/SaleBadge/Eyebrow |
| `app/_components/home/product-grid.tsx` | **Modify** — Section + SectionHeader (reference) |
| `app/_components/home/category-strip.tsx` | **Modify** — Section + SectionHeader (reference) |

---

## Task 1: `discountPct` pricing helper (TDD)

**Files:**
- Create: `app/_lib/pricing.ts`
- Test: `app/_lib/__tests__/pricing.test.ts`

**Interfaces:**
- Produces: `discountPct(price: number, original: number): number` — integer percent off, `0` when not on sale or inputs invalid.

- [ ] **Step 1: Write the failing test**

```ts
// app/_lib/__tests__/pricing.test.ts
import { describe, it, expect } from "vitest";
import { discountPct } from "../pricing";

describe("discountPct", () => {
  it("rounds the percentage off to the nearest integer", () => {
    expect(discountPct(3900, 5200)).toBe(25);
    expect(discountPct(70, 99)).toBe(29);
  });

  it("returns 0 when there is no discount", () => {
    expect(discountPct(5200, 5200)).toBe(0);
    expect(discountPct(6000, 5200)).toBe(0);
  });

  it("returns 0 for invalid originals", () => {
    expect(discountPct(100, 0)).toBe(0);
    expect(discountPct(100, -10)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — the `pricing` suite errors on import (`Cannot find module '../pricing'`). (Use the full `npm run test`, not a filename filter — filters trip a "no tests" globalSetup quirk in this repo.)

- [ ] **Step 3: Write minimal implementation**

```ts
// app/_lib/pricing.ts
export function discountPct(price: number, original: number): number {
  if (original <= 0 || price >= original) return 0;
  return Math.round(((original - price) / original) * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS — the full suite is green, including the 3 new `discountPct` tests.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/pricing.ts app/_lib/__tests__/pricing.test.ts
git commit -m "feat(storefront): add discountPct pricing helper"
```

---

## Task 2: Tokens reference doc

**Files:**
- Create: `docs/superpowers/tokens-reference.md`

**Interfaces:** none (documentation). Captures the approved decisions so follow-on per-surface plans need no new token choices.

> **Why no `app/globals.css` edit:** the motion tokens (`--duration-*`, `--ease-out`), radius, and color tokens already exist there, and spacing uses Tailwind's default 4px ladder. The type scale was never CSS-variable-ized and the approved decision keeps it as class recipes encoded in the primitives. So the foundation's "token layer" is this doc + the primitives, not new CSS variables — `globals.css` is left untouched (which also keeps the AA-tuned `--brand` exactly as-is).

- [ ] **Step 1: Write the reference doc**

```markdown
# Storefront Design Tokens — Reference

Single source for the cohesion foundation. Primitives in `app/_components/ui/`
encode these; new surfaces reuse the primitives rather than re-deciding values.

## Spacing (Balanced) — 4px ladder (Tailwind defaults)
- Section vertical padding: `py-12 md:py-20` (48px mobile / 80px desktop)
- Grid gap: `gap-6` (24px)
- Section-header → content offset: `mb-10` (40px)
- Container: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8` (unchanged; kept)

## Type scale (Poppins only)
| Role | Class recipe |
|------|--------------|
| eyebrow | `text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-brand` |
| display (hero h1) | `font-heading text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight` |
| h2 (section) | `font-heading text-2xl font-semibold tracking-tight` |
| h3 (card) | `font-heading text-base font-medium leading-snug` |
| body | `text-[0.9375rem] leading-relaxed` |
| meta | `text-xs text-muted-foreground` |
| price | `font-heading text-base font-semibold` (`text-brand` when on sale) |

## Motion (Restrained) — existing tokens
- Durations: `--duration-fast 150ms`, `--duration-base 200ms`, `--duration-slow 320ms`; ease `--ease-out`.
- Card hover: `translateY(-2px)` + `shadow-card`, `duration-base` (Card primitive already does this).
- Media zoom: `scale-105`, `duration-slow`.
- Press: `active:translate-y-px`.
- Underline link: underline wipes in from left on hover (`TextLink`).
- All transitions gated behind `motion-safe:`.

## Focus ring (one style)
`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` (olive).
```

- [ ] **Step 2: Verify contrast gate still passes**

Run: `npm run check:contrast`
Expected: PASS (no token values were changed; this confirms the documented olive `text-brand` recipe still clears AA).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/tokens-reference.md
git commit -m "docs(storefront): add design tokens reference"
```

---

## Task 3: `Eyebrow` primitive

**Files:**
- Create: `app/_components/ui/eyebrow.tsx`

**Interfaces:**
- Produces: `Eyebrow(props: React.ComponentProps<"p"> & { tone?: "brand" | "inverse" })` — default tone `"brand"` (olive); `"inverse"` for over-image white.

- [ ] **Step 1: Write the component**

```tsx
// app/_components/ui/eyebrow.tsx
import { cn } from "@/lib/utils";

type EyebrowProps = React.ComponentProps<"p"> & {
  tone?: "brand" | "inverse";
};

export function Eyebrow({ className, tone = "brand", ...props }: EyebrowProps) {
  return (
    <p
      className={cn(
        "text-[0.6875rem] font-semibold uppercase tracking-[0.16em]",
        tone === "brand" ? "text-brand" : "text-white/80",
        className
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/eyebrow.tsx
git commit -m "feat(storefront): add Eyebrow primitive"
```

---

## Task 4: `TextLink` primitive

**Files:**
- Create: `app/_components/ui/text-link.tsx`

**Interfaces:**
- Consumes: `next/link`.
- Produces: `TextLink(props: React.ComponentProps<typeof Link>)` — animated-underline link carrying the standard focus ring.

- [ ] **Step 1: Write the component**

```tsx
// app/_components/ui/text-link.tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

type TextLinkProps = React.ComponentProps<typeof Link>;

export function TextLink({ className, children, ...props }: TextLinkProps) {
  return (
    <Link
      className={cn(
        "group/textlink relative inline-flex items-center rounded-sm text-sm font-medium text-foreground outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    >
      <span className="relative">
        {children}
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-current transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:group-hover/textlink:scale-x-100"
        />
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/text-link.tsx
git commit -m "feat(storefront): add TextLink primitive"
```

---

## Task 5: `Price` primitive

**Files:**
- Create: `app/_components/ui/price.tsx`

**Interfaces:**
- Consumes: `formatPrice` from `@/app/_lib/format`.
- Produces: `Price(props: { price: number; originalPrice?: number | null; className?: string })` — renders current price, plus strikethrough original + olive sale color when `originalPrice > price`.

- [ ] **Step 1: Write the component**

```tsx
// app/_components/ui/price.tsx
import { cn } from "@/lib/utils";
import { formatPrice } from "@/app/_lib/format";

type PriceProps = {
  price: number;
  originalPrice?: number | null;
  className?: string;
};

export function Price({ price, originalPrice, className }: PriceProps) {
  const onSale = originalPrice != null && originalPrice > price;
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span
        className={cn(
          "font-heading text-base font-semibold",
          onSale && "text-brand"
        )}
      >
        {formatPrice(price)}
      </span>
      {onSale && (
        <span className="text-sm text-muted-foreground line-through">
          {formatPrice(originalPrice as number)}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/price.tsx
git commit -m "feat(storefront): add Price primitive"
```

---

## Task 6: `Rating` primitive

**Files:**
- Create: `app/_components/ui/rating.tsx`

**Interfaces:**
- Consumes: `Star` from `lucide-react`.
- Produces: `Rating(props: { rating: number; reviewCount: number; className?: string })`.

- [ ] **Step 1: Write the component**

```tsx
// app/_components/ui/rating.tsx
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type RatingProps = {
  rating: number;
  reviewCount: number;
  className?: string;
};

export function Rating({ rating, reviewCount, className }: RatingProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        className
      )}
    >
      <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" aria-hidden />
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      <span>({reviewCount.toLocaleString()})</span>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/rating.tsx
git commit -m "feat(storefront): add Rating primitive"
```

---

## Task 7: `SaleBadge` primitive

**Files:**
- Create: `app/_components/ui/sale-badge.tsx`

**Interfaces:**
- Produces: `SaleBadge(props: { pct: number; className?: string })` — rounded olive `−N%` chip (uses a real minus sign `−`).

- [ ] **Step 1: Write the component**

```tsx
// app/_components/ui/sale-badge.tsx
import { cn } from "@/lib/utils";

type SaleBadgeProps = {
  pct: number;
  className?: string;
};

export function SaleBadge({ pct, className }: SaleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border border-brand/25 bg-card/90 px-2 py-0.5 text-xs font-semibold text-brand",
        className
      )}
    >
      −{pct}%
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/sale-badge.tsx
git commit -m "feat(storefront): add SaleBadge primitive"
```

---

## Task 8: `Section` + `Container` primitives

**Files:**
- Create: `app/_components/ui/section.tsx`

**Interfaces:**
- Produces:
  - `Container(props: React.ComponentProps<"div">)` — `max-w-7xl` gutter wrapper.
  - `Section(props: React.ComponentProps<"section"> & { bordered?: boolean })` — `<section>` (default `border-b`) wrapping a `Container` padded with the Balanced vertical rhythm (`py-12 md:py-20`).

- [ ] **Step 1: Write the component**

```tsx
// app/_components/ui/section.tsx
import { cn } from "@/lib/utils";

export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}

type SectionProps = React.ComponentProps<"section"> & {
  bordered?: boolean;
};

export function Section({
  className,
  bordered = true,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn(bordered && "border-b", className)} {...props}>
      <Container className="py-12 md:py-20">{children}</Container>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/section.tsx
git commit -m "feat(storefront): add Section and Container primitives"
```

---

## Task 9: `SectionHeader` primitive

**Files:**
- Create: `app/_components/ui/section-header.tsx`

**Interfaces:**
- Consumes: `Eyebrow` (Task 3), `TextLink` (Task 4).
- Produces: `SectionHeader(props: { eyebrow?: string; title: string; action?: { label: string; href: string }; className?: string })` — optional eyebrow + `h2` title + optional right-aligned action link, with the `mb-10` offset baked in.

- [ ] **Step 1: Write the component**

```tsx
// app/_components/ui/section-header.tsx
import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";
import { TextLink } from "./text-link";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  action?: { label: string; href: string };
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-10 flex items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      {action && <TextLink href={action.href}>{action.label}</TextLink>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/section-header.tsx
git commit -m "feat(storefront): add SectionHeader primitive"
```

---

## Task 10: Refactor `ProductCard` onto the primitives (reference)

**Files:**
- Modify: `app/_components/home/product-card.tsx`

**Interfaces:**
- Consumes: `discountPct` (Task 1), `Eyebrow` (Task 3), `Price` (Task 5), `Rating` (Task 6), `SaleBadge` (Task 7).
- Produces: same `ProductCard` public props (unchanged `ProductCardProps`).

Replace the inline local `discountPct`, the `Badge` sale chip, the eyebrow `<p>`, the rating block, and the price block with the new primitives. Keep `AddToCartDialog`, the "Buy it now" link, image, and wishlist heart exactly as they are.

- [ ] **Step 1: Replace imports and helper**

Replace the top imports block (lines 1–11) so the local `discountPct` and `Badge` import are gone and the primitives are pulled in:

```tsx
// app/_components/home/product-card.tsx
import Image from "next/image";
import Link from "next/link";
import { Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { AddToCartDialog } from "@/app/_components/cart/add-to-cart-dialog";
import { WishlistHeart } from "@/app/_components/wishlist/wishlist-heart";
import { prettifyCategory } from "@/app/_lib/category-label";
import { discountPct } from "@/app/_lib/pricing";
import { Eyebrow } from "@/app/_components/ui/eyebrow";
import { Price } from "@/app/_components/ui/price";
import { Rating } from "@/app/_components/ui/rating";
import { SaleBadge } from "@/app/_components/ui/sale-badge";
```

Delete the local `function discountPct(...) { ... }` definition (old lines 26–28).

- [ ] **Step 2: Replace the media badge**

Replace the `onSale && <Badge ...>-{pct}%</Badge>` block with:

```tsx
        {onSale && <SaleBadge pct={pct} className="absolute left-3 top-3 z-10" />}
```

- [ ] **Step 3: Replace the card body (eyebrow, rating, price)**

Replace the `<CardContent>` block so it uses the primitives:

```tsx
      <CardContent className="space-y-1.5 p-4">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h3 className="font-heading line-clamp-2 min-h-[2.75rem] text-base font-medium leading-snug">
          <Link href={href} className="hover:underline underline-offset-4">
            {name}
          </Link>
        </h3>
        <Rating rating={rating} reviewCount={reviewCount} />
        <Price price={price} originalPrice={originalPrice} />
      </CardContent>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If TS flags an unused `Badge` or `Star` import, remove it — they are no longer used.)

- [ ] **Step 5: Run the full test suite (no regressions)**

Run: `npm run test`
Expected: PASS — same suite result as before the change (no test imports `ProductCard`; this confirms nothing broke).

- [ ] **Step 6: Commit**

```bash
git add app/_components/home/product-card.tsx
git commit -m "refactor(storefront): build ProductCard from shared primitives"
```

---

## Task 11: Refactor home section headers onto `Section`/`SectionHeader` (reference)

**Files:**
- Modify: `app/_components/home/product-grid.tsx`
- Modify: `app/_components/home/category-strip.tsx`

**Interfaces:**
- Consumes: `Section` (Task 8), `SectionHeader` (Task 9).
- Produces: unchanged exported async components `ProductGrid` / `CategoryStrip`.

This applies the Balanced rhythm (`py-12 md:py-20`, `gap-6`, `mb-10`) and the shared header. `product-grid` exercises the eyebrow + action path; `category-strip` exercises the title-only path.

- [ ] **Step 1: Refactor `product-grid.tsx`**

Replace the whole file body with:

```tsx
import { ProductCard } from "@/app/_components/home/product-card";
import { getFeaturedProducts } from "@/app/_lib/products";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";

export async function ProductGrid() {
  const products = await getFeaturedProducts(8);
  return (
    <Section>
      <SectionHeader
        eyebrow="Editor's picks"
        title="Featured products"
        action={{ label: "View all", href: "/categories" }}
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            price={p.price}
            originalPrice={p.originalPrice}
            image={p.image}
            rating={p.rating}
            reviewCount={p.reviewCount}
            sizes={p.sizes}
            category={p.category}
            fromPath="/"
          />
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Refactor `category-strip.tsx`**

Replace the whole file body with:

```tsx
import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/app/_lib/products";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";

export async function CategoryStrip() {
  const categories = await getCategories();
  return (
    <Section>
      <SectionHeader title="Shop by category" />
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 50vw"
                className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-4 text-base font-semibold text-white">
                {c.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run the full test suite (no regressions)**

Run: `npm run test`
Expected: PASS — unchanged suite result.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/product-grid.tsx app/_components/home/category-strip.tsx
git commit -m "refactor(storefront): adopt Section/SectionHeader on home grids"
```

---

## Final verification

- [ ] **Step 1: Full typecheck + tests + contrast**

Run: `npx tsc --noEmit && npm run test && npm run check:contrast`
Expected: all PASS.

- [ ] **Step 2: Visual confirmation**

Start `npm run dev` and confirm the home page Featured/Category sections and the product cards match the approved companion "after" mockups: 11px olive eyebrow, olive sale price + rounded olive `−N%` badge, equal section padding (`py-12 md:py-20`), 24px grid gaps, 40px header offset, restrained 2px card hover lift. No red sale color, no layout shift.

---

## Notes for follow-on plans (out of scope here)

These reuse the primitives above — no new token decisions needed:
- **Home surfaces** — hero, deals-section, trust-strip adopt `Section`/`SectionHeader`/`Eyebrow`.
- **Product listing** — category/search/deals grids, toolbar, sort, pagination.
- **PDP** — gallery, buy box, reviews, related strip.
- **Cart & checkout** — line items, summary, free-shipping progress, steps, success.
