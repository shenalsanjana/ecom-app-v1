# Category-wise Ad Links + Category Pixel Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner paste-ready per-category ad URLs in the admin and fire a custom `ViewCategory` Meta Pixel event on category pages so retargeting audiences survive slug renames.

**Architecture:** Add a `trackCustom` path + `trackViewCategory()` helper to the existing client-only Meta Pixel wrapper. Fire it from a tiny client child rendered by the ISR category Server Component. Surface a copy-able absolute ad URL per row in the existing `/admin/categories` table via the shared `absoluteUrl()` helper.

**Tech Stack:** Next.js 16 App Router, React client components, TypeScript, Vitest, Meta Pixel (`window.fbq`).

**Design spec:** [docs/superpowers/specs/2026-06-29-category-ad-links-pixel-design.md](../specs/2026-06-29-category-ad-links-pixel-design.md)

## Global Constraints

- Pixel calls MUST no-op when `NEXT_PUBLIC_META_PIXEL_ID` is unset and MUST be try/catch-wrapped — the pixel can never break the page. (existing contract in `app/_lib/meta-pixel.ts`)
- Currency for product events is `LKR`. The category event carries **no** value/currency (category-level, not product-level).
- Never render an `async` Server Component inside a `"use client"` component.
- Absolute URLs come only from the shared `absoluteUrl()` helper — never hand-built.
- Validate with `npm run test` and the `tsc` type-check gate (`npx tsc --noEmit`). Do **not** rely on `next build` — there is no local `DATABASE_URL` and prerender fails here.
- Commits follow Conventional Commits; this work goes on `main` or a `feat/*` branch off `main`.

---

### Task 1: `trackViewCategory` helper + `trackCustom` path

**Files:**
- Modify: `app/_lib/meta-pixel.ts`
- Test: `app/_lib/__tests__/meta-pixel.test.ts`

**Interfaces:**
- Consumes: existing `fbq()` accessor and module structure in `app/_lib/meta-pixel.ts`.
- Produces: `export function trackViewCategory(categoryName: string): void` — fires `fbq('trackCustom', 'ViewCategory', { content_category, content_name })`, both set to `categoryName`; no-ops when `fbq` absent.

- [ ] **Step 1: Write the failing tests**

Add these two tests to `app/_lib/__tests__/meta-pixel.test.ts`, inside the existing `describe("meta-pixel", …)` block (after the `trackAddToCart` test):

```ts
  it("trackViewCategory fires a custom ViewCategory event with the category name", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackViewCategory("Dresses");
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("trackCustom");
    expect(calls[0][1]).toBe("ViewCategory");
    expect(calls[0][2]).toMatchObject({
      content_category: "Dresses",
      content_name: "Dresses",
    });
  });

  it("trackViewCategory no-ops when fbq is absent (no throw)", async () => {
    installWindow(false);
    const m = await import("@/app/_lib/meta-pixel");
    expect(() => m.trackViewCategory("Dresses")).not.toThrow();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- meta-pixel`
Expected: FAIL — `m.trackViewCategory is not a function`.

- [ ] **Step 3: Implement `trackCustom` + `trackViewCategory`**

In `app/_lib/meta-pixel.ts`, add a `trackCustom` helper right after the existing `track()` function (after line 53), then the public helper:

```ts
function trackCustom(name: string, payload?: Record<string, unknown>): void {
  const f = fbq();
  if (!f) return;
  try {
    f("trackCustom", name, payload ?? {});
  } catch {
    // Pixel must never break the page.
  }
}

export function trackViewCategory(categoryName: string): void {
  // Custom event (not ViewContent) so the product-level conversion signal stays
  // clean. Carries the category NAME, not the slug, so audiences survive slug
  // renames (the app rewrites slugs via getCategorySlugRedirect).
  trackCustom("ViewCategory", {
    content_category: categoryName,
    content_name: categoryName,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- meta-pixel`
Expected: PASS — all meta-pixel tests green, including the two new ones.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/meta-pixel.ts app/_lib/__tests__/meta-pixel.test.ts
git commit -m "feat(ads): add trackViewCategory custom Meta Pixel event"
```

---

### Task 2: Fire `ViewCategory` from the category page

**Files:**
- Create: `app/_components/analytics/track-category-view.tsx`
- Modify: `app/categories/[slug]/page.tsx`

**Interfaces:**
- Consumes: `trackViewCategory` from Task 1.
- Produces: `export function TrackCategoryView({ name }: { name: string }): null` — a client component that fires `trackViewCategory(name)` once per `name` on mount.

- [ ] **Step 1: Create the client component**

Create `app/_components/analytics/track-category-view.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { trackViewCategory } from "@/app/_lib/meta-pixel";

// Fires a ViewCategory pixel event once per category view. The category page is
// an ISR Server Component and cannot run client tracking itself, so this tiny
// leaf does it — mirroring how buy-box-client fires ViewContent. Keyed on `name`
// so a client-side navigation between categories re-fires for the new one.
export function TrackCategoryView({ name }: { name: string }) {
  useEffect(() => {
    trackViewCategory(name);
  }, [name]);
  return null;
}
```

- [ ] **Step 2: Render it from the category page**

In `app/categories/[slug]/page.tsx`, add the import near the other component imports (after the `SortSelect` import on line 7):

```tsx
import { TrackCategoryView } from "@/app/_components/analytics/track-category-view";
```

Then render it inside the returned fragment, immediately after `<SiteHeader />` (line 67), so it mounts only once the category is known to exist (the `notFound()` / redirect guards run before this return):

```tsx
      <SiteHeader />
      <TrackCategoryView name={category.name} />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full unit suite**

Run: `npm run test`
Expected: PASS — no regressions.

- [ ] **Step 5: Commit**

```bash
git add app/_components/analytics/track-category-view.tsx app/categories/[slug]/page.tsx
git commit -m "feat(ads): fire ViewCategory pixel event on category pages"
```

---

### Task 3: Copy-able ad URL per category in admin

**Files:**
- Create: `app/_components/admin/categories/copy-ad-link-button.tsx`
- Modify: `app/admin/categories/page.tsx`
- Modify: `app/_components/admin/categories/categories-table.tsx`

**Interfaces:**
- Consumes: `absoluteUrl` from `app/_lib/absolute-url.ts`.
- Produces:
  - `export function CopyAdLinkButton({ url }: { url: string }): JSX.Element` — client button that copies `url` to the clipboard and shows brief "Copied" feedback.
  - `Row` type in `categories-table.tsx` gains `adUrl: string`.

- [ ] **Step 1: Create the copy button client component**

Create `app/_components/admin/categories/copy-ad-link-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Copies a category's absolute ad URL to the clipboard for pasting into Meta Ads
// Manager. Best-effort: a clipboard failure simply shows no "Copied" state and
// never throws to the user.
export function CopyAdLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied) — no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={url}
      aria-label={copied ? "Ad link copied" : "Copy ad link"}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/60"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy ad link"}
    </button>
  );
}
```

- [ ] **Step 2: Compute the ad URL per row in the admin page**

In `app/admin/categories/page.tsx`, add the import after the `CategoriesTable` import (line 3):

```tsx
import { absoluteUrl } from "@/app/_lib/absolute-url";
```

Then add `adUrl` to each row mapping (replace the existing `rows` map, lines 10-12):

```tsx
  const rows = categories.map((c) => ({
    slug: c.slug, name: c.name, image: c.image, productCount: c._count.products,
    adUrl: absoluteUrl(`/categories/${c.slug}`),
  }));
```

- [ ] **Step 3: Render the "Ad link" column in the table**

In `app/_components/admin/categories/categories-table.tsx`:

Add the import after the `DeleteCategoryButton` import (line 3):

```tsx
import { CopyAdLinkButton } from "./copy-ad-link-button";
```

Extend the `Row` type (line 5):

```tsx
type Row = { slug: string; name: string; image: string; productCount: number; adUrl: string };
```

Add a header cell — change the `<thead>` row (lines 12-15) so there is an "Ad link" column before Actions:

```tsx
        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
          <th className="p-2"></th><th className="p-2">Name</th><th className="p-2">Slug</th>
          <th className="p-2">Products</th><th className="p-2">Ad link</th><th className="p-2 text-right">Actions</th>
        </tr>
```

Add the body cell — insert a new `<td>` after the Products cell (after line 25):

```tsx
            <td className="p-2">{c.productCount}</td>
            <td className="p-2"><CopyAdLinkButton url={c.adUrl} /></td>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full unit suite**

Run: `npm run test`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add app/_components/admin/categories/copy-ad-link-button.tsx app/admin/categories/page.tsx app/_components/admin/categories/categories-table.tsx
git commit -m "feat(ads): add copy-able category ad links to admin categories table"
```

---

## Self-Review

**Spec coverage:**
- §4.1 `trackViewCategory` + `trackCustom` path → Task 1. ✓
- §4.2 client child on ISR category page → Task 2. ✓
- §4.3 admin copy-able ad URL via `absoluteUrl()` → Task 3. ✓
- §7 unit tests for `trackViewCategory`, validate with `npm run test` + `tsc`, no new e2e → Task 1 tests + each task's tsc/test steps. ✓
- §3 out-of-scope (no content_ids, no new admin page, no UTM, no e2e) → respected. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows full code. ✓

**Type consistency:** `trackViewCategory(categoryName: string)` used identically in Tasks 1 & 2. `TrackCategoryView({ name })` produced in Task 2 Step 1, consumed in Step 2. `Row.adUrl` added in Task 3 Step 3, populated in Step 2, consumed by `CopyAdLinkButton({ url })`. ✓
