# Storefront Home Page (Dummy) — Design

**Date:** 2026-04-27
**Status:** Approved for implementation planning
**Scope:** Customer-facing landing page at `/`, scaffolded with mock data

## Goal

Replace the default `create-next-app` placeholder at `app/page.tsx` with a realistic ecommerce storefront landing page composed of typical sections, backed by local mock data. This is scaffolding — no backend, no real cart, no routes other than `/`. It establishes the component structure and design system that real features will later plug into.

## Stack constraints

- Next.js **16.2.4** (App Router; private-folder `_` convention)
- React **19.2.4** (Server Components by default; Server Actions for form stubs)
- Tailwind CSS **v4** (already configured in `app/globals.css`)
- TypeScript strict mode, `@/*` path alias to project root
- shadcn/ui as the component primitive library

Existing dark mode uses `prefers-color-scheme` only — no theme toggle in scope.

## File layout

```
app/
  page.tsx                       # composes sections (server component)
  layout.tsx                     # unchanged
  globals.css                    # shadcn CSS variables added
  _components/home/
    site-header.tsx
    hero.tsx
    category-strip.tsx
    product-grid.tsx
    deals-section.tsx
    newsletter.tsx
    site-footer.tsx
    product-card.tsx             # shared by product-grid + deals-section
  _data/
    mock.ts                      # types + mock arrays
components/ui/                   # shadcn primitives (generated)
lib/utils.ts                     # shadcn cn() helper
components.json                  # shadcn config
```

The `_components` and `_data` folders use the underscore prefix so Next.js's App Router treats them as private folders and never routes to them.

## Tooling setup

1. `npx shadcn@latest init` — generates `components.json`, `lib/utils.ts`, and updates `app/globals.css` with CSS variables and the base layer (Tailwind v4 compatible).
2. `npx shadcn@latest add button card input badge separator` — installs only the primitives this design uses. Components are written as source under `components/ui/`, not added as a runtime dependency.
3. New runtime dependencies introduced by `shadcn init`: `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `tw-animate-css`.

The shadcn init may overwrite `app/globals.css`. Existing custom variables (`--background`, `--foreground`, `--font-sans`, `--font-mono`) and the dark-mode media query must be preserved or merged into the shadcn variable set.

## Sections

Each section is its own server component. None require `"use client"` for this dummy version.

### SiteHeader (`site-header.tsx`)
Sticky top bar. Contents:
- Brand wordmark "Shoply" (left)
- Nav links: Shop, Categories, Deals, About (center, hidden below `md`)
- Search `Input` with leading icon (center-right)
- Cart `Button` with `Badge` showing item count `3` (right)

### Hero (`hero.tsx`)
Full-width banner, two-column at `md+`:
- Left: eyebrow text, large headline, supporting paragraph, two `Button`s — primary "Shop now", outline "Browse categories"
- Right: hero image (reuses an existing `public/*.svg`) on a gradient background

### CategoryStrip (`category-strip.tsx`)
Horizontal row of 6 circular category tiles (image + label) with section heading "Shop by category". Wraps on small screens.

Categories: Electronics, Fashion, Home, Beauty, Sports, Books.

### ProductGrid (`product-grid.tsx`)
Section heading "Featured products" + responsive grid of 8 `ProductCard`s.
Grid: 2 columns mobile / 3 tablet / 4 desktop.

### DealsSection (`deals-section.tsx`)
Contrast-background band. Section heading "Deals of the day" + grid of 4 `ProductCard`s. Each card displays a discount `Badge` (e.g., "-30%") in the corner because every deal product has an `originalPrice`.

### Newsletter (`newsletter.tsx`)
Centered band: heading "Get 10% off your first order", supporting text, and a row containing an email `Input` and a "Subscribe" `Button`. Wrapped in `<form action={subscribeAction}>` where `subscribeAction` is a no-op Server Action defined inline (`"use server"` directive). This demonstrates the Next 16 server-action pattern without adding real logic.

### SiteFooter (`site-footer.tsx`)
4-column link grid (Shop / Help / Company / Social) above a `Separator` and a bottom row with copyright on the left and small print on the right.

### ProductCard (`product-card.tsx`)
Shared building block. Displays:
- Product image on a gradient `Card` header background
- Optional discount `Badge` overlay (when `originalPrice` is set)
- Product name (line-clamped to 2 lines)
- Star rating row + review count
- Price (current) with strike-through `originalPrice` when present
- "Add to cart" `Button` (full-width, non-functional in this version)

## Data shape

`app/_data/mock.ts`:

```ts
export type Category = {
  slug: string;
  name: string;
  image: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;            // current price in USD cents or whole units — pick one and stay consistent
  originalPrice?: number;   // present => render strike-through and discount badge
  image: string;            // path under /public
  rating: number;           // 0–5, can be fractional
  reviewCount: number;
  category: Category["slug"];
};

export const categories: Category[];        // length 6
export const featuredProducts: Product[];   // length 8
export const dealsProducts: Product[];      // length 4, all with originalPrice
```

Price unit decision: store as **whole-unit numbers** (e.g., `49.99`) for this dummy. Easier to read in the file; revisit when real money handling lands.

Images for products and categories reuse the existing public SVGs (`next.svg`, `globe.svg`, `file.svg`, `window.svg`, `vercel.svg`). No new binary assets are added. Visual variety comes from per-card gradient backgrounds applied via Tailwind classes.

## Composition

`app/page.tsx` becomes:

```tsx
import { SiteHeader } from "@/app/_components/home/site-header";
import { Hero } from "@/app/_components/home/hero";
import { CategoryStrip } from "@/app/_components/home/category-strip";
import { ProductGrid } from "@/app/_components/home/product-grid";
import { DealsSection } from "@/app/_components/home/deals-section";
import { Newsletter } from "@/app/_components/home/newsletter";
import { SiteFooter } from "@/app/_components/home/site-footer";

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

`app/layout.tsx`'s body remains `min-h-full flex flex-col` so the footer settles correctly when content is short.

## Rendering & interactivity model

- All section components are React Server Components.
- The Newsletter form uses an inline Server Action that is a no-op (`async () => { "use server"; }`) so the form is fully server-rendered and demonstrates the Next 16 pattern.
- Header search input and product "Add to cart" buttons render as plain non-interactive elements. They will become client components when real behavior is added — out of scope here.

## Verification

Static markup over mock data — there is nothing meaningful to unit-test.

Verification is:
1. `npm run lint` passes
2. `npm run build` succeeds with no type errors
3. `npm run dev` renders all 7 sections at `/`, in light and dark mode, at mobile / tablet / desktop widths
4. No console errors or hydration warnings

## Out of scope (deliberate exclusions)

- Real cart state, search functionality, checkout
- Routes other than `/`
- Theme toggle (dark mode stays driven by `prefers-color-scheme`)
- CMS, API, or database integration
- Authentication
- Internationalization
- Tests

## Open questions

None. Proceed to implementation planning.
