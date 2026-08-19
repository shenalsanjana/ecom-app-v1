> **Verbatim copy** of `design_handoff_home_conversion_refresh/README.md` from the
> Claude Design project `Ecom-app-v1 setup` (`d904cb16-b993-4d2e-ae78-3b58508384a5`),
> retrieved 2026-08-19. Preserved unedited for provenance. Where this document and
> `2026-08-19-home-conversion-refresh-design.md` disagree, the design spec wins and
> records the deviation.

---

# Handoff: Home Page Conversion + Visual Refresh

## Overview
This package specifies a set of **home page** changes for the Dressing Bear storefront, aimed at higher conversion and a more eye-catching look, plus a brand-color change sampled from the new logo. It is scoped to the storefront home route (`app/page.tsx`) and the components it renders — nothing else in the app changes.

## About the Design Files
The file in this bundle (`Dressing Bear Storefront.dc.html`) is a **design reference created in HTML** — a working prototype of the intended look and behavior, not production code to paste in. The task is to **recreate these changes in the existing Next.js + Tailwind + shadcn codebase** (`shenalsanjana/ecom-app-v1`, branch `main`) using its established patterns (server components, `cva` variants, the `--token` CSS variables in `app/globals.css`, `lucide-react` icons, `next/image`). Every change below maps to a specific existing repo file.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interactions are final. Recreate pixel-accurately with the codebase's primitives (`Section`, `SectionHeader`, `Button`/`buttonVariants`, `Card`, `Eyebrow`, `Price`, `Rating`, `SaleBadge`).

---

## Change 1 — Brand color (sampled from new logo)
**File:** `app/globals.css` (`:root` block)

The new logo (`uploads/Logo-01.png` in the design project; a warm terracotta lion/"D" mark) samples to **`#b27657`**. `#b27657` is the authoritative value.

- `--brand: oklch(0.62 0.075 55);` /* was `oklch(0.51 0.085 125)` olive — now terracotta #b27657 */
- `--ring: oklch(0.62 0.075 55);` (keep in sync with `--brand`, as today)
- `--chart-1: oklch(0.62 0.075 55);` (currently mirrors brand)
- Leave `--brand-foreground` (cream) unchanged.

> ⚠️ Contrast: `scripts/check-contrast.ts` gates sale-price/olive-on-cream at WCAG AA 4.5:1. Terracotta at `oklch(0.62 …)` is lighter than the old olive — **re-run the contrast check** and darken toward `oklch(0.56 0.08 52)` if brand-as-body-text (sale price) fails AA. Do not ship without re-running that script.

## Change 2 — Announcement bar → scrolling marquee
**File:** `app/_components/shared/announcement-bar.tsx` + `app/globals.css` (keyframes)

Replace the single static centered line with a horizontally scrolling marquee (motion draws the eye). Keep it non-dismissible and above the sticky header as today; keep the live `freeThreshold` prop.

- Add to `globals.css`: `@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`
- Track: one flex row, `animation: marquee 26s linear infinite`, `white-space: nowrap`, parent `overflow: hidden`. Duplicate the message set **twice** back-to-back so the `-50%` loop is seamless.
- Colors unchanged: `bg-primary text-primary-foreground` (cocoa on cream inverse).
- Item styling: `text-xs uppercase tracking-[0.06em] font-medium`, `gap: 44px`, `✦` separators at `opacity: 0.4`.
- Messages (in order), repeated x2:
  1. Free-shipping label — `freeThreshold > 0` → `Free shipping over {formatPrice(freeThreshold)}`; else `Free shipping on everything`
  2. `Pay in 3 interest-free — Koko & Mintpay` (gate Koko behind `NEXT_PUBLIC_KOKO_ENABLED` as elsewhere)
  3. `Cash on Delivery island-wide`
  4. `New drops every week`
- Respect `motion-safe:` — pause/disable the animation under `prefers-reduced-motion`.

## Change 3 — Hero refresh
**File:** `app/_components/home/hero.tsx`

Keep the existing `/banners/spring-collection.jpg` full-bleed image + left dark gradient. Add/adjust:
- **Rating chip** above the eyebrow: inline-flex pill, `white-space: nowrap`, `background: rgba(255,255,255,0.14)`, `backdrop-blur`, `1px solid rgba(255,255,255,0.28)`, `rounded-full`, `padding: 6px 14px`, `13px`. Amber star (`#f0b429`, filled) + `<b>4.8</b> · Loved by 12,000+ customers`.
- **Headline**: bump to `font-bold` (700), `clamp(42px,5.4vw,70px)`, `leading-[1.02]`, `tracking-[-0.03em]`. Wrap the final word in a **brand highlight**: `Unleash your inner <span>bear.</span>` where the span is `background: var(--brand); color:#fff; padding:0 .14em; border-radius:12px; box-decoration-break:clone; -webkit-box-decoration-break:clone`.
- Keep both CTAs (`Shop the collection` primary on cream, `View deals` underline link).

## Change 4 — Social-proof strip (NEW component)
**Files:** new `app/_components/home/social-proof.tsx`; mount in `app/page.tsx` **directly after `<Hero />`**, before `<ProductGrid />`.

Full-bleed band, `bg-card`, `border-b`, centered wrapping flex row (`gap: 14px 40px`, `padding: 18px 24px`, `max-w-7xl` inner). Four items, each icon + text, `14px`:
1. Amber star + `<b>4.8/5</b> from 850+ reviews`
2. Check (`lucide` `Check`, brand) + `<b>12,000+</b> tees delivered`
3. Card (`lucide` `CreditCard`, brand) + `Cash on Delivery island-wide`
4. Truck (`lucide` `Truck`, brand) + free-shipping label (same logic as marquee item 1)

## Change 5 — Featured cards: scarcity + social proof
**File:** `app/_components/home/product-card.tsx` (+ data source)

Add two optional signals driven by product data:
- **Badge pill** (top of card, absolute `left:12px; bottom:12px` over the image): cocoa `bg-primary text-primary-foreground`, `text-[10px] font-semibold uppercase tracking-[0.05em]`, `rounded-full`, `padding:4px 9px`. Values: `Bestseller` / `Trending` / `Almost gone`. Only render when set.
- **Stock nudge** (in card body, under `Rating`): `text-xs font-semibold text-brand` with a small clock icon — `Only {stock} left`. Render only when `stock != null && stock <= 6`.
- **Data:** extend `ProductView` (see `app/_lib/products.ts`) with optional `badge?: string` and `lowStock?: number`, and populate from the product source / mock. This is display metadata only — no checkout/stock-logic change. Example mapping used in the prototype: Cat→`Bestseller`; Bear→`Almost gone`, stock 4; Retro Sun→stock 5; Cassette→`Trending`; Mushroom→`Bestseller`, stock 6.

## Change 6 — "Deals of the day" → high-contrast dark band + countdown
**File:** `app/_components/home/deals-section.tsx`

- Section background: **`bg-primary text-primary-foreground`** (cocoa) instead of `bg-muted`. Product cards stay light (unchanged `ProductCard`), creating strong contrast.
- Header: add eyebrow `Limited time` in `color-mix(in oklab, var(--brand) 70%, white)`; enlarge `h2` to `34px font-bold`; sub-copy at `rgba(255,255,255,0.6)`.
- **Countdown pill**: `Ends in HH:MM:SS`, counting down to end of local day (`23:59:59`). `bg: rgba(255,255,255,0.1)`, `1px solid rgba(255,255,255,0.2)`, `rounded-full`. Digits use `font-mono` (the `--font-geist-mono` already loaded in `layout.tsx`) in `color-mix(in oklab, var(--brand) 65%, white)`, with a pulsing brand dot (`box-shadow: 0 0 0 4px color-mix(in oklab, var(--brand) 30%, transparent)`). Implement as a `"use client"` island (setInterval, 1s) — the rest of the section can stay a server component.
- `See all deals →` link at `rgba(255,255,255,0.75)`, hover `#fff`.

## Change 7 — Category tiles: distinct, bold
**File:** `app/_components/home/category-strip.tsx`

Replace the muddy image-under-dark-gradient tiles (they all resolved to the same cream product photo) with **solid, distinct brand-adjacent color tiles**, centered label, mono caption. Same `aspect-[3/4]`, `rounded-xl`, `grid` as today; add `hover:-translate-y-[3px]` (motion-safe).
- Per-category background (hex): Cat `#EFC4C4`, Dino `#AEBBA0`, Bear `#C4906E`, Retro `#E4D3B0`, Wave `#AEC3D1`, Nature `#BFC7A6`.
- Foreground ink computed from tile luminance: dark tiles → `#F1EDE4`, light tiles → `#3a332c` (see `ink()`/`inkSoft()` in the prototype logic).
- Content: centered `28px font-bold` category name; below it, `font-mono text-[10px] uppercase tracking-[0.16em]` `Shop {name} →` in the soft-ink color.
- If real category imagery becomes available later, these can revert to photos — but keep them visually distinct per category.

---

## Interactions & Behavior
- **Marquee & countdown**: continuous; gate marquee behind `motion-safe:`. Countdown recomputes every second to local end-of-day.
- **Card hover**: existing `Card` primitive already does `-translate-y-0.5 + shadow-card` at `--duration-base`; category tiles add `-translate-y-[3px]`.
- **Navigation** unchanged: cards → `/products/{id}`, category tiles → `/categories/{slug}`, deals header → `/deals`.
- **Responsive**: all rows use `grid-cols` breakpoints already in the codebase; strips wrap via flex-wrap. No new breakpoints needed.

## State Management
- Only new client state is the **countdown** (`useState`/`useEffect` interval) in the deals island. Everything else remains server-rendered.
- Optional product `badge`/`lowStock` are data fields, not runtime state.

## Design Tokens
| Token | Value |
|-------|-------|
| Brand (new) | `#b27657` ≈ `oklch(0.62 0.075 55)` — verify AA, may darken to `oklch(0.56 0.08 52)` |
| Cocoa / primary | `oklch(0.235 0.018 60)` (unchanged) |
| Cream / bg | `oklch(0.972 0.013 80)` (unchanged) |
| Card | `oklch(0.985 0.008 80)` |
| Muted-fg | `oklch(0.54 0.018 60)` |
| Border | `oklch(0.89 0.014 75)` |
| Amber star | `#f0b429` |
| Radius | `--radius: 1rem` (cards `rounded-2xl`, tiles `rounded-xl`, pills `rounded-full`) |
| Card shadow | `0 12px 32px -16px rgba(122,80,40,0.18)` |
| Category tints | Cat `#EFC4C4`, Dino `#AEBBA0`, Bear `#C4906E`, Retro `#E4D3B0`, Wave `#AEC3D1`, Nature `#BFC7A6` |
| Fonts | Poppins (400/500/600/700), Geist Mono (countdown) — already in `layout.tsx` |

## Assets
- `public/logo.png` — existing, used in header/footer (brand color sampled from the newer `uploads/Logo-01.png` provided by the client; if that becomes the official mark, replace `public/logo.png`).
- `public/banners/spring-collection.jpg` — existing hero image, unchanged.
- All icons from `lucide-react` (already a dependency): `Star`, `Check`, `CreditCard`, `Truck`, `Clock`, `ArrowRight`.

## Files
- `Dressing Bear Storefront.dc.html` (in this bundle) — the full clickable prototype of the home page (and the rest of the storefront) with all seven changes applied. Open it in a browser to see exact spacing, motion, and copy.
- Repo files to edit: `app/globals.css`, `app/_components/shared/announcement-bar.tsx`, `app/_components/home/hero.tsx`, `app/_components/home/deals-section.tsx`, `app/_components/home/category-strip.tsx`, `app/_components/home/product-card.tsx`, `app/page.tsx`; new `app/_components/home/social-proof.tsx`; data: `app/_lib/products.ts`.
