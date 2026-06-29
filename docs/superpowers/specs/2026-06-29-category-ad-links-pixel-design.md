# Category-wise Ad Links + Category Pixel Signal — Design

**Date:** 2026-06-29
**Status:** Design — pending implementation plan
**Related:** [2026-06-26 Social Commerce / Meta Integration](2026-06-26-social-commerce-meta-integration-design.md)

## 1. Problem

The owner runs (or wants to run) **category-wise Meta ad campaigns** — one ad per
category — and needs:

1. **Paste-ready landing URLs** for each category to drop into Ads Manager.
2. The **existing Meta Pixel** to recognise category visits so audiences can be
   built per category.

Today the app already has category pages at `/categories/<slug>` and a Meta Pixel
that auto-fires `PageView` on every navigation plus `ViewContent` / `AddToCart` /
`InitiateCheckout` / `Purchase` on the product → checkout flow
([app/_lib/meta-pixel.ts](../../../app/_lib/meta-pixel.ts),
[app/_components/analytics/meta-pixel-script.tsx](../../../app/_components/analytics/meta-pixel-script.tsx)).

## 2. Honest calibration — what is and isn't already covered

This matters so expectations are right and we don't build redundant work:

- **Basic per-category retargeting already works today.** A Meta Custom Audience
  with a "URL contains `/categories/dresses`" rule captures category visitors off
  the existing `PageView`. No code needed for that.
- **The specific, non-redundant win in *this* repo: rename-proof audiences.**
  Category slugs can be **renamed** here — the app keeps slug history and redirects
  retired slugs (`getCategorySlugRedirect`,
  [app/categories/[slug]/page.tsx](../../../app/categories/[slug]/page.tsx)).
  URL-based audiences **fragment** across the old and new slug whenever a category
  is renamed. An event carrying the stable category **name** gives audiences that
  survive slug renames.
- **Scope of the event: it powers Custom *Audiences*, not an optimization target.**
  To optimize *delivery* toward category views, register a Custom Conversion in
  Events Manager pointing at the `ViewCategory` event — that is a dashboard action,
  no code.
- **Plain URLs, no UTM — deliberate.** Meta attribution runs through the pixel +
  Ads Manager, not UTM query tags. UTM tagging was considered and intentionally
  left out; the URLs are clean `/categories/<slug>`.

## 3. Scope

**In scope**

- A custom `ViewCategory` pixel event carrying the category **name** only.
- Firing that event once per category-page view.
- Surfacing a copy-able absolute ad URL per category in the existing
  `/admin/categories` table.

**Out of scope (explicitly)**

- Product `content_ids` in the event payload (only useful for Advantage+/catalog
  dynamic ads, which are not being run — decided 2026-06-29).
- A separate `/admin/marketing` page (we augment the existing categories table).
- UTM builder / query-param tagging.
- New Playwright e2e (unit coverage only — decided 2026-06-29).

## 4. Design

### 4.1 Pixel event — `trackViewCategory`

Add to [app/_lib/meta-pixel.ts](../../../app/_lib/meta-pixel.ts):

- A **`trackCustom` path**. The current `track()` wrapper only calls the standard
  `fbq('track', …)`. Custom events use a different fbq method:
  `fbq('trackCustom', '<name>', payload)`. Add a small internal `trackCustom(name,
  payload)` that mirrors `track()`'s safety: no-op when `fbq` is absent (pixel not
  configured), wrapped in try/catch so the pixel can never break the page.
- A public helper:

  ```ts
  export function trackViewCategory(categoryName: string): void {
    trackCustom("ViewCategory", {
      content_category: categoryName,
      content_name: categoryName,
    });
  }
  ```

  No `value` / `currency` (those are product-level and would muddy the
  `ViewContent` conversion signal — the reason we use a *custom* event rather than
  reusing `ViewContent`).

`MetaEvent` is the standard-event union and stays unchanged; `ViewCategory` is a
custom event name passed as a string to `trackCustom`.

### 4.2 Firing the event — client child on the ISR category page

`app/categories/[slug]/page.tsx` is an ISR Server Component (`revalidate = 300`)
and cannot run client tracking directly. Add a tiny client component that fires
once on mount, mirroring how `buy-box-client` fires `trackViewContent`
([app/_components/product/buy-box-client.tsx:62](../../../app/_components/product/buy-box-client.tsx)):

```tsx
// app/_components/analytics/track-category-view.tsx
"use client";
import { useEffect } from "react";
import { trackViewCategory } from "@/app/_lib/meta-pixel";

export function TrackCategoryView({ name }: { name: string }) {
  useEffect(() => {
    trackViewCategory(name);
  }, [name]);
  return null;
}
```

Rendered in the category page after the category is resolved:
`<TrackCategoryView name={category.name} />`. Keyed on `name` so a client
navigation between categories re-fires for the new category.

### 4.3 Admin — copy-able ad URL per category

Augment the **existing** categories admin — no new page.

- [app/admin/categories/page.tsx](../../../app/admin/categories/page.tsx) (Server
  Component): for each row, compute the absolute ad URL with the existing shared
  helper `absoluteUrl()` ([app/_lib/absolute-url.ts](../../../app/_lib/absolute-url.ts)) —
  `absoluteUrl(\`/categories/${slug}\`)` — and pass it on each row.
- `app/_components/admin/categories/categories-table.tsx` (Client Component): add
  an **"Ad link"** cell showing the URL (truncated) with a **Copy** button that
  writes the full URL to the clipboard (`navigator.clipboard.writeText`) and shows
  brief "Copied" feedback. Degrade gracefully if the table currently has no room —
  a compact icon button is fine.

`absoluteUrl()` already defaults to `http://localhost:3000` when `APP_URL` is unset,
so the cell renders sensibly in dev and the real origin in production.

## 5. Data flow

```
Admin opens /admin/categories
  → server builds rows incl. absoluteUrl(/categories/<slug>)
  → Copy button → clipboard → paste into Meta Ads Manager

Visitor clicks the ad → /categories/<slug>
  → existing PageView fires (as today)
  → TrackCategoryView mounts → trackViewCategory(name)
      → fbq('trackCustom','ViewCategory',{content_category,content_name})
  → Meta builds a Custom Audience keyed on category name (rename-proof)
```

## 6. Error handling / safety

- Pixel calls are no-ops when `NEXT_PUBLIC_META_PIXEL_ID` is unset and are
  try/catch-wrapped — unchanged contract; the site behaves exactly as before when
  the pixel is off.
- Clipboard copy is best-effort; failure shows no success state but never throws to
  the user.

## 7. Testing & validation

- **Unit (Vitest)** in
  [app/_lib/__tests__/meta-pixel.test.ts](../../../app/_lib/__tests__/meta-pixel.test.ts):
  - `trackViewCategory` calls `fbq('trackCustom', 'ViewCategory', …)` with
    `content_category` and `content_name` set to the category name.
  - no-ops (no `fbq` call) when the pixel is unconfigured.
- **No new Playwright e2e** (decided 2026-06-29) — the logic lives in the helper,
  which the unit test covers.
- **Validation:** `npm run test` plus the `tsc` type-check gate. **Not** `next
  build` — there is no local `DATABASE_URL` in this environment and prerender fails
  here (see project memory `no-local-database`).

## 8. Files touched

| File | Change |
| --- | --- |
| `app/_lib/meta-pixel.ts` | Add `trackCustom` path + `trackViewCategory()` |
| `app/_components/analytics/track-category-view.tsx` | New tiny client component |
| `app/categories/[slug]/page.tsx` | Render `<TrackCategoryView name={category.name} />` |
| `app/admin/categories/page.tsx` | Compute `absoluteUrl(/categories/<slug>)` per row |
| `app/_components/admin/categories/categories-table.tsx` | "Ad link" cell + Copy button |
| `app/_lib/__tests__/meta-pixel.test.ts` | Tests for `trackViewCategory` |

## 9. Decisions log

- Goal = paste-ready URLs **and** richer category tracking. (2026-06-29)
- URL delivery = copy buttons in the **existing** admin categories table. (2026-06-29)
- Ad type = traffic/conversion → category **name** signal, no product IDs. (2026-06-29)
- Event = **custom `ViewCategory`** (not reused `ViewContent`) to keep the product
  conversion signal clean and give rename-proof audiences. (2026-06-29)
- Tests = unit only. (2026-06-29)
