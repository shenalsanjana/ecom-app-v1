# Storefront Home Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the create-next-app placeholder at `app/page.tsx` with a 7-section ecommerce storefront landing page (header, hero, categories, featured products, deals, newsletter, footer) backed by mock data, using shadcn/ui primitives.

**Architecture:** All sections are React Server Components composed in `app/page.tsx`. Component files live under `app/_components/home/` (private folder, not routed). Mock data and types live in `app/_data/mock.ts`. shadcn/ui primitives are generated as source under `components/ui/`. Newsletter uses a no-op inline Server Action to demonstrate the Next 16 pattern.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4 (Server Components, Server Actions), Tailwind CSS v4, TypeScript strict, shadcn/ui (button, card, input, badge, separator), lucide-react.

**Spec:** `docs/superpowers/specs/2026-04-27-storefront-home-design.md`

**Verification model (per spec):** No unit tests — this is static markup over mock data. Each task verifies via `npm run lint` and TypeScript check; the final task verifies the rendered page in a browser.

**Next.js 16 reading list:** Before implementation, skim these bundled docs (per `AGENTS.md`):
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` (Server Actions)
- `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md` (next/image)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`

Task 2 covers this reading.

---

## File Map

**Created in this plan:**
- `app/_data/mock.ts` — types and mock arrays
- `app/_components/home/product-card.tsx` — shared card primitive
- `app/_components/home/site-header.tsx`
- `app/_components/home/hero.tsx`
- `app/_components/home/category-strip.tsx`
- `app/_components/home/product-grid.tsx`
- `app/_components/home/deals-section.tsx`
- `app/_components/home/newsletter.tsx`
- `app/_components/home/site-footer.tsx`

**Created by shadcn CLI (Task 3 & 4):**
- `components.json`
- `lib/utils.ts`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `components/ui/badge.tsx`
- `components/ui/separator.tsx`

**Modified:**
- `app/globals.css` — shadcn writes its CSS variables here; we re-add a `prefers-color-scheme` block (see Task 3)
- `app/page.tsx` — replaced with section composition (Task 14)
- `package.json` / `package-lock.json` — shadcn dependency additions

---

## Task 1: Initial scaffolding commit

**Files:**
- All currently untracked files in the repo

The repo has zero commits. Create a baseline commit so subsequent task commits are meaningful.

- [ ] **Step 1: Inspect what's untracked**

Run: `git status --short`

Expected: a list of `??` entries including `.gitignore`, `app/`, `package.json`, `docs/`, etc. No staged or modified entries.

- [ ] **Step 2: Confirm `.gitignore` excludes `node_modules` and `.next`**

Run: `cat .gitignore`

Expected output contains lines for `node_modules`, `.next`, `next-env.d.ts`, `.env*`. If any are missing, stop and report — do not modify silently.

- [ ] **Step 3: Stage everything currently in the working tree**

Run: `git add .`

Then: `git status --short` — expected: only `A` (added) entries, no `??` entries other than possibly `.idea/` if you intentionally excluded it. `node_modules/` must NOT appear.

- [ ] **Step 4: Commit baseline**

Run:
```bash
git commit -m "chore: initial scaffolding from create-next-app + design spec"
```

Expected: commit succeeds. `git log --oneline` shows one commit.

---

## Task 2: Read Next.js 16 reference docs

**Files:** none — research only.

Per `AGENTS.md`, this Next.js version has breaking changes from training-data Next.js. Read before writing any code.

- [ ] **Step 1: Read server vs client components**

Read: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

Note: Server Components are the default. `"use client"` directive opts a file (and its imports) into the client bundle. We do NOT need `"use client"` for any section in this plan.

- [ ] **Step 2: Read Server Actions section of mutating-data doc**

Read: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`

Note the inline server action syntax (`async function name() { "use server"; ... }`) used by Newsletter (Task 12).

- [ ] **Step 3: Read next/image guide**

Read: `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md`

Note: `width` and `height` are required for non-`fill` images. SVGs from `/public` work as `src` directly.

- [ ] **Step 4: Read page file convention**

Read: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`

Note: default export must be a function returning JSX. No params object needed for the static `/` route.

No commit — research only.

---

## Task 3: Initialize shadcn/ui

**Files:**
- Create: `components.json`, `lib/utils.ts`
- Modify: `app/globals.css`, `package.json`, `package-lock.json`

- [ ] **Step 1: Run shadcn init**

Run: `npx shadcn@latest init`

When prompted:
- "Which color would you like to use as the base color?" → `Neutral`
- Any other prompt → accept the default

This creates `components.json`, `lib/utils.ts`, adds `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `tw-animate-css` to `package.json`, and rewrites `app/globals.css` with shadcn CSS variables and a `.dark` class variant.

Expected: command exits 0. New files exist at `components.json` and `lib/utils.ts`.

- [ ] **Step 2: Verify `lib/utils.ts` content**

Run: `cat lib/utils.ts`

Expected:
```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Restore `prefers-color-scheme` dark mode**

shadcn init's `app/globals.css` enables dark mode only via a `.dark` class (`@custom-variant dark (&:is(.dark *))`). Per the spec, dark mode must follow system preference without a toggle. Append a media query to the file so the dark variables also apply when the OS prefers dark.

Open `app/globals.css`. Find the `.dark { ... }` block (added by shadcn init). Immediately AFTER it, add:

```css
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --background: var(--color-background, oklch(0.145 0 0));
    --foreground: var(--color-foreground, oklch(0.985 0 0));
  }
  :root:not(.light) {
    color-scheme: dark;
  }
}
```

If shadcn used different variable names (e.g., the `.dark` block lists `--background`, `--foreground`, `--card`, etc.), copy that entire body — the property names and values, not the selector — into the `:root:not(.light) { ... }` block above so every dark token applies. Skip this step if you cannot reliably mirror the values; report and ask.

- [ ] **Step 4: Run lint and type check**

Run: `npm run lint`
Expected: exits 0 (warnings allowed, errors not).

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add components.json lib/utils.ts app/globals.css package.json package-lock.json
git commit -m "chore: initialize shadcn/ui (neutral base, system dark mode preserved)"
```

---

## Task 4: Add shadcn primitives

**Files:**
- Create: `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/input.tsx`, `components/ui/badge.tsx`, `components/ui/separator.tsx`
- Modify: `package.json`, `package-lock.json` (separator pulls in `@radix-ui/react-separator`)

- [ ] **Step 1: Install primitives**

Run: `npx shadcn@latest add button card input badge separator`

Expected: 5 new files under `components/ui/`, plus any needed Radix dependencies added to `package.json`.

- [ ] **Step 2: Verify files exist**

Run: `ls components/ui/`

Expected: `badge.tsx  button.tsx  card.tsx  input.tsx  separator.tsx`

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add components/ui package.json package-lock.json
git commit -m "chore: add shadcn primitives (button, card, input, badge, separator)"
```

---

## Task 5: Mock data module

**Files:**
- Create: `app/_data/mock.ts`

The underscore prefix on `_data/` is a Next.js App Router convention that excludes the folder from the route tree.

- [ ] **Step 1: Create the file**

Create `app/_data/mock.ts` with this exact content:

```ts
export type Category = {
  slug: string;
  name: string;
  image: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  reviewCount: number;
  category: Category["slug"];
};

export const categories: Category[] = [
  { slug: "electronics", name: "Electronics", image: "/window.svg" },
  { slug: "fashion", name: "Fashion", image: "/file.svg" },
  { slug: "home", name: "Home", image: "/globe.svg" },
  { slug: "beauty", name: "Beauty", image: "/vercel.svg" },
  { slug: "sports", name: "Sports", image: "/next.svg" },
  { slug: "books", name: "Books", image: "/file.svg" },
];

export const featuredProducts: Product[] = [
  { id: "p1", name: "Wireless Noise-Cancelling Headphones", price: 249.99, image: "/window.svg", rating: 4.6, reviewCount: 1284, category: "electronics" },
  { id: "p2", name: "Minimalist Leather Wallet", price: 39.0, image: "/file.svg", rating: 4.8, reviewCount: 642, category: "fashion" },
  { id: "p3", name: "Ceramic Pour-Over Coffee Set", price: 64.5, image: "/globe.svg", rating: 4.4, reviewCount: 318, category: "home" },
  { id: "p4", name: "Hydrating Vitamin C Serum", price: 28.0, image: "/vercel.svg", rating: 4.7, reviewCount: 2104, category: "beauty" },
  { id: "p5", name: "Trail Running Shoes", price: 129.99, originalPrice: 159.99, image: "/next.svg", rating: 4.5, reviewCount: 887, category: "sports" },
  { id: "p6", name: "The Pragmatic Programmer", price: 34.0, image: "/file.svg", rating: 4.9, reviewCount: 5421, category: "books" },
  { id: "p7", name: "Smart Fitness Watch", price: 199.0, image: "/window.svg", rating: 4.3, reviewCount: 712, category: "electronics" },
  { id: "p8", name: "Linen Throw Blanket", price: 89.0, image: "/globe.svg", rating: 4.6, reviewCount: 254, category: "home" },
];

export const dealsProducts: Product[] = [
  { id: "d1", name: "Bluetooth Portable Speaker", price: 69.99, originalPrice: 99.99, image: "/window.svg", rating: 4.4, reviewCount: 1820, category: "electronics" },
  { id: "d2", name: "Cotton Crewneck Sweatshirt", price: 34.99, originalPrice: 59.99, image: "/file.svg", rating: 4.5, reviewCount: 410, category: "fashion" },
  { id: "d3", name: "Stainless Steel Cookware Set", price: 179.0, originalPrice: 259.0, image: "/globe.svg", rating: 4.7, reviewCount: 333, category: "home" },
  { id: "d4", name: "Yoga Mat Premium", price: 29.5, originalPrice: 49.0, image: "/next.svg", rating: 4.6, reviewCount: 1011, category: "sports" },
];
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/_data/mock.ts
git commit -m "feat: add mock catalog data (categories, featured, deals)"
```

---

## Task 6: ProductCard component

**Files:**
- Create: `app/_components/home/product-card.tsx`

Shared by ProductGrid and DealsSection. Server component, no `"use client"`.

- [ ] **Step 1: Create the file**

Create `app/_components/home/product-card.tsx`:

```tsx
import Image from "next/image";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { Product } from "@/app/_data/mock";

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function discountPct(price: number, original: number): number {
  return Math.round(((original - price) / original) * 100);
}

export function ProductCard({ product }: { product: Product }) {
  const onSale = product.originalPrice !== undefined && product.originalPrice > product.price;
  const pct = onSale ? discountPct(product.price, product.originalPrice as number) : 0;

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
        {onSale && (
          <Badge className="absolute left-3 top-3" variant="destructive">
            -{pct}%
          </Badge>
        )}
        <Image
          src={product.image}
          alt={product.name}
          width={96}
          height={96}
          className="opacity-90 dark:invert"
        />
      </div>
      <CardContent className="space-y-2 p-4">
        <h3 className="line-clamp-2 min-h-[2.75rem] text-sm font-medium leading-snug">
          {product.name}
        </h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
          <span className="font-medium text-foreground">{product.rating.toFixed(1)}</span>
          <span>({product.reviewCount.toLocaleString()})</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold">{formatPrice(product.price)}</span>
          {onSale && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.originalPrice as number)}
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full" size="sm">Add to cart</Button>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add app/_components/home/product-card.tsx
git commit -m "feat(home): add ProductCard component"
```

---

## Task 7: SiteHeader

**Files:**
- Create: `app/_components/home/site-header.tsx`

- [ ] **Step 1: Create the file**

Create `app/_components/home/site-header.tsx`:

```tsx
import Link from "next/link";
import { Search, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NAV_LINKS = [
  { href: "#", label: "Shop" },
  { href: "#", label: "Categories" },
  { href: "#", label: "Deals" },
  { href: "#", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Shoply
        </Link>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="text-muted-foreground hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="relative ml-auto hidden flex-1 max-w-sm md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Search products" className="pl-9" />
        </div>
        <Button variant="ghost" size="icon" className="relative ml-auto md:ml-0" aria-label="Cart">
          <ShoppingCart className="h-5 w-5" />
          <Badge className="absolute -right-1 -top-1 h-5 min-w-[1.25rem] rounded-full px-1 text-[10px]">
            3
          </Badge>
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/site-header.tsx
git commit -m "feat(home): add SiteHeader (logo, nav, search, cart)"
```

---

## Task 8: Hero

**Files:**
- Create: `app/_components/home/hero.tsx`

- [ ] **Step 1: Create the file**

Create `app/_components/home/hero.tsx`:

```tsx
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="border-b bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-black dark:to-zinc-900">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24 lg:px-8">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Spring collection
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Everyday essentials, curated for you.
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Discover hand-picked products from independent makers and trusted brands —
            shipped fast, returned freely.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg">
              Shop now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline">
              Browse categories
            </Button>
          </div>
        </div>
        <div className="relative flex h-72 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 via-rose-100 to-fuchsia-100 dark:from-amber-950 dark:via-rose-950 dark:to-fuchsia-950 md:h-96">
          <Image
            src="/window.svg"
            alt="Featured product"
            width={200}
            height={200}
            priority
            className="dark:invert"
          />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/hero.tsx
git commit -m "feat(home): add Hero section"
```

---

## Task 9: CategoryStrip

**Files:**
- Create: `app/_components/home/category-strip.tsx`

- [ ] **Step 1: Create the file**

Create `app/_components/home/category-strip.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { categories } from "@/app/_data/mock";

export function CategoryStrip() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Shop by category</h2>
        <ul className="grid grid-cols-3 gap-6 sm:grid-cols-6">
          {categories.map((c) => (
            <li key={c.slug} className="flex flex-col items-center gap-3">
              <Link
                href="#"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <Image src={c.image} alt={c.name} width={36} height={36} className="dark:invert" />
              </Link>
              <span className="text-sm font-medium">{c.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/category-strip.tsx
git commit -m "feat(home): add CategoryStrip section"
```

---

## Task 10: ProductGrid

**Files:**
- Create: `app/_components/home/product-grid.tsx`

- [ ] **Step 1: Create the file**

Create `app/_components/home/product-grid.tsx`:

```tsx
import { ProductCard } from "@/app/_components/home/product-card";
import { featuredProducts } from "@/app/_data/mock";

export function ProductGrid() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Featured products</h2>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            View all
          </a>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {featuredProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/product-grid.tsx
git commit -m "feat(home): add ProductGrid (featured products)"
```

---

## Task 11: DealsSection

**Files:**
- Create: `app/_components/home/deals-section.tsx`

- [ ] **Step 1: Create the file**

Create `app/_components/home/deals-section.tsx`:

```tsx
import { ProductCard } from "@/app/_components/home/product-card";
import { dealsProducts } from "@/app/_data/mock";

export function DealsSection() {
  return (
    <section className="border-b bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Deals of the day</h2>
            <p className="mt-1 text-sm text-muted-foreground">Limited-time savings on everyday picks.</p>
          </div>
          <a href="#" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            See all deals
          </a>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {dealsProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/deals-section.tsx
git commit -m "feat(home): add DealsSection"
```

---

## Task 12: Newsletter (with Server Action)

**Files:**
- Create: `app/_components/home/newsletter.tsx`

The form's `action` is an inline async function with the `"use server"` directive — a no-op for now. This demonstrates the Next 16 Server Action pattern without adding real logic.

- [ ] **Step 1: Create the file**

Create `app/_components/home/newsletter.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function subscribe(formData: FormData) {
  "use server";
  // No-op: real subscribe logic lands when the email backend exists.
  // The form is intentionally non-functional in this dummy version.
  void formData;
}

export function Newsletter() {
  return (
    <section className="border-b bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Get 10% off your first order
        </h2>
        <p className="mt-3 text-base opacity-80">
          Join the newsletter for new arrivals, member-only sales, and styling tips.
        </p>
        <form action={subscribe} className="mx-auto mt-6 flex max-w-md gap-2">
          <Input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="bg-white text-zinc-900 placeholder:text-zinc-500 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400"
          />
          <Button type="submit" variant="secondary">Subscribe</Button>
        </form>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/newsletter.tsx
git commit -m "feat(home): add Newsletter section with no-op server action"
```

---

## Task 13: SiteFooter

**Files:**
- Create: `app/_components/home/site-footer.tsx`

- [ ] **Step 1: Create the file**

Create `app/_components/home/site-footer.tsx`:

```tsx
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

const COLUMNS = [
  {
    heading: "Shop",
    links: ["New arrivals", "Best sellers", "Sale", "Gift cards"],
  },
  {
    heading: "Help",
    links: ["Contact us", "Shipping", "Returns", "FAQ"],
  },
  {
    heading: "Company",
    links: ["About", "Careers", "Press", "Sustainability"],
  },
  {
    heading: "Social",
    links: ["Instagram", "TikTok", "YouTube", "Newsletter"],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="text-sm font-semibold tracking-wide uppercase">{col.heading}</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {col.links.map((label) => (
                  <li key={label}>
                    <Link href="#" className="hover:text-foreground">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator className="my-8" />
        <div className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Shoply. All rights reserved.</p>
          <p>Built with Next.js. Prices and stock for demonstration only.</p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/site-footer.tsx
git commit -m "feat(home): add SiteFooter"
```

---

## Task 14: Compose sections in `app/page.tsx`

**Files:**
- Modify: `app/page.tsx` (full replacement)

- [ ] **Step 1: Replace `app/page.tsx` content**

Overwrite `app/page.tsx` with:

```tsx
import { CategoryStrip } from "@/app/_components/home/category-strip";
import { DealsSection } from "@/app/_components/home/deals-section";
import { Hero } from "@/app/_components/home/hero";
import { Newsletter } from "@/app/_components/home/newsletter";
import { ProductGrid } from "@/app/_components/home/product-grid";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SiteHeader } from "@/app/_components/home/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <CategoryStrip />
        <ProductGrid />
        <DealsSection />
        <Newsletter />
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Type check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: compose storefront home page from section components"
```

---

## Task 15: Final verification

**Files:** none modified — verification only.

- [ ] **Step 1: Production build**

Run: `npm run build`

Expected: build completes with exit 0. The output lists `/` as a route. No type errors. No "Module not found" errors.

If the build fails, fix the cause in the relevant earlier task's file before continuing — do not paper over the error here.

- [ ] **Step 2: Start dev server**

Run: `npm run dev`

Expected: server logs `Ready` and a local URL (default `http://localhost:3000`).

- [ ] **Step 3: Visual walkthrough — desktop light mode**

Open `http://localhost:3000` in a browser at desktop width (≥ 1024px) with light system theme.

Confirm in order:
1. Sticky header with "Shoply" wordmark, 4 nav links, search bar, cart button with badge "3"
2. Hero with "Spring collection" eyebrow, large headline, two buttons, gradient image panel on the right
3. "Shop by category" with 6 circular category tiles
4. "Featured products" — 4-column grid of 8 cards, each showing rating, price, "Add to cart"
5. "Deals of the day" on a tinted background — 4-column grid of 4 cards, each with a red "-XX%" badge and strike-through original price
6. Dark band with "Get 10% off your first order" + email input + "Subscribe" button
7. 4-column footer + separator + copyright row

Browser console: no errors, no React hydration warnings.

- [ ] **Step 4: Visual walkthrough — dark mode**

Switch the OS to dark mode (or use the browser devtools "Emulate CSS prefers-color-scheme" override). Reload.

Expected: backgrounds become dark, foreground text light, gradients and tinted bands invert appropriately. All sections remain legible. No light-mode flashes.

- [ ] **Step 5: Visual walkthrough — mobile width**

Resize the viewport to ~390px (or use devtools mobile emulation).

Expected:
- Header collapses: nav links hidden, search bar hidden, only logo + cart visible
- Hero stacks vertically (text above image)
- Category tiles in 3 columns
- Featured products in 2 columns
- Deals products in 2 columns
- Footer columns in 2 columns

- [ ] **Step 6: Stop the dev server**

`Ctrl+C` in the dev-server terminal.

- [ ] **Step 7: Final lint check**

Run: `npm run lint`
Expected: exits 0.

No commit — verification only. The plan is complete when all checkboxes above are ticked.

---

## Acceptance criteria recap

- [x] All 7 sections from the spec render at `/`
- [x] All section components are React Server Components (no `"use client"` anywhere in `app/_components/home/`)
- [x] Newsletter form uses an inline Server Action
- [x] No new binary assets — all images reuse existing `public/*.svg`
- [x] Dark mode follows system preference
- [x] `npm run build` succeeds, `npm run lint` clean
- [x] No routes added other than `/`
