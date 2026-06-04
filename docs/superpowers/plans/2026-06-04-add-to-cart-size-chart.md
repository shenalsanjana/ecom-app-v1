# Inline Size Chart in Add-to-cart Popup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Size Chart" toggle inside the quick Add-to-cart popup that reveals the shared size-chart image in-place, so customers can check measurements before picking a size.

**Architecture:** Extract the chart image + caption from `SizeChartDialog` into a shared presentational `SizeChartContent` component. `SizeChartDialog` (product page) keeps wrapping it in a dialog; `AddToCartDialog` renders it inline behind a `showChart` toggle. No new data — the single shared "oversize t-shirt" chart image is used everywhere.

**Tech Stack:** Next.js 16 (App Router), React client components, Tailwind, `next/image`, lucide-react icons, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-06-04-add-to-cart-size-chart-design.md`

---

## File Structure

- **Create** `app/_components/product/size-chart-content.tsx` — presentational figure: the chart `<Image>` + caption. Single source of truth for the image path and caption text. Caller controls the image container size via a `className` prop.
- **Modify** `app/_components/product/size-chart-dialog.tsx` — render `SizeChartContent` in the dialog body instead of an inline `<Image>` + `DialogDescription` caption.
- **Modify** `app/_components/cart/add-to-cart-dialog.tsx` — add the `showChart` toggle and inline chart region.
- **Create** `tests/e2e/add-to-cart-size-chart.spec.ts` — Playwright test for the toggle.

---

## Task 1: Extract `SizeChartContent` and refactor `SizeChartDialog`

Pure refactor — no behavior change beyond the caption moving from above the image (header) to below it (figure), inside the same dialog.

**Files:**
- Create: `app/_components/product/size-chart-content.tsx`
- Modify: `app/_components/product/size-chart-dialog.tsx`

- [ ] **Step 1: Create the shared `SizeChartContent` component**

Create `app/_components/product/size-chart-content.tsx`:

```tsx
import Image from "next/image";

/**
 * Shared size-chart figure (image + caption). Single source of truth for the
 * chart asset and its measurement note. The caller supplies the container
 * sizing via `className` so the same figure works both in a wide dialog and in
 * a height-bounded inline popup.
 */
export function SizeChartContent({
  className = "relative aspect-square w-full overflow-hidden rounded-md",
}: {
  className?: string;
}) {
  return (
    <figure className="space-y-2">
      <div className={className}>
        <Image
          src="/size-charts/oversize.jpg"
          alt="Oversize t-shirt size chart"
          fill
          sizes="(min-width: 640px) 42rem, 100vw"
          className="object-contain"
        />
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Measurements in inches, ±0.5&quot; tolerance. Unisex sizing.
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 2: Refactor `SizeChartDialog` to use it**

Replace the body of `app/_components/product/size-chart-dialog.tsx`. Remove the now-redundant `Image` import and the `DialogDescription` caption (the caption now lives in `SizeChartContent`):

```tsx
"use client";

import { Ruler } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SizeChartContent } from "@/app/_components/product/size-chart-content";

export function SizeChartDialog() {
  return (
    <Dialog>
      <DialogTrigger className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <Ruler className="h-3.5 w-3.5" aria-hidden />
        Size Chart
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Oversize T-shirt size chart</DialogTitle>
        </DialogHeader>
        <SizeChartContent />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no type errors. (`DialogDescription` is no longer imported in `size-chart-dialog.tsx`; confirm no unused-import lint error — if `npm run lint` flags it, the import was already removed above.)

- [ ] **Step 4: Commit**

```bash
git add app/_components/product/size-chart-content.tsx app/_components/product/size-chart-dialog.tsx
git commit -m "refactor(product): extract SizeChartContent from SizeChartDialog"
```

---

## Task 2: Write the failing e2e test for the toggle

**Files:**
- Create: `tests/e2e/add-to-cart-size-chart.spec.ts`

- [ ] **Step 1: Write the test**

Create `tests/e2e/add-to-cart-size-chart.spec.ts`. This mirrors the existing `tests/e2e/delivery-zone-pricing.spec.ts` pattern for opening the quick Add-to-cart dialog (trigger has `aria-label="Add to cart"` on each card). The Size Chart toggle only renders for products that offer sizes; the seeded catalog products are sized t-shirts, so the first card's dialog has sizes.

```ts
import { test, expect } from "@playwright/test";

test("add-to-cart popup reveals and hides the size chart", async ({ page }) => {
  await page.goto("/categories");

  // Open the quick Add-to-cart dialog on the first product card.
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  // The Size Chart toggle is present only when the product has sizes.
  const toggle = dialog.getByRole("button", { name: /^Size Chart$/i });
  await expect(toggle).toBeVisible();

  // Chart image is hidden until toggled.
  const chart = dialog.getByRole("img", { name: /size chart/i });
  await expect(chart).toHaveCount(0);

  // Reveal it.
  await toggle.click();
  await expect(chart).toBeVisible();
  const hide = dialog.getByRole("button", { name: /^Hide chart$/i });
  await expect(hide).toBeVisible();

  // Hide it again.
  await hide.click();
  await expect(chart).toHaveCount(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- add-to-cart-size-chart`
Expected: FAIL — the toggle button does not exist yet, so `expect(toggle).toBeVisible()` times out.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/e2e/add-to-cart-size-chart.spec.ts
git commit -m "test(cart): add failing e2e for inline size chart toggle"
```

---

## Task 3: Add the inline size-chart toggle to `AddToCartDialog`

**Files:**
- Modify: `app/_components/cart/add-to-cart-dialog.tsx`

- [ ] **Step 1: Add the `Ruler` icon and `SizeChartContent` imports**

In `app/_components/cart/add-to-cart-dialog.tsx`, update the icon import and add the `SizeChartContent` import:

```tsx
import { ShoppingCart, Check, Ruler } from "lucide-react";
```

Add below the existing `Button`/`buttonVariants` import line:

```tsx
import { SizeChartContent } from "@/app/_components/product/size-chart-content";
```

- [ ] **Step 2: Add the `showChart` state**

After the existing `const [added, setAdded] = useState(false);` line, add:

```tsx
const [showChart, setShowChart] = useState(false);
```

- [ ] **Step 3: Reset `showChart` when the popup closes**

In `handleOpenChange`, add the reset alongside the existing ones:

```tsx
function handleOpenChange(next: boolean) {
  setOpen(next);
  if (!next) {
    setSelectedSize("");
    setAdded(false);
    setShowChart(false);
  }
}
```

- [ ] **Step 4: Put the toggle on the description row**

Replace the existing `DialogHeader` block:

```tsx
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {formatPrice(price)}
            {hasSizes ? " — choose your size" : ""}
          </DialogDescription>
        </DialogHeader>
```

with this (wraps the description and a right-aligned toggle in one flex row; the toggle is a `<button>` sibling of `DialogDescription`, never nested inside its `<p>`):

```tsx
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <div className="flex items-center justify-between gap-2">
            <DialogDescription>
              {formatPrice(price)}
              {hasSizes ? " — choose your size" : ""}
            </DialogDescription>
            {hasSizes && (
              <button
                type="button"
                onClick={() => setShowChart((v) => !v)}
                aria-expanded={showChart}
                aria-controls="add-to-cart-size-chart"
                className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <Ruler className="h-3.5 w-3.5" aria-hidden />
                {showChart ? "Hide chart" : "Size Chart"}
              </button>
            )}
          </div>
        </DialogHeader>
```

- [ ] **Step 5: Render the inline chart below the size buttons**

Immediately after the size-buttons block (the `{hasSizes && ( <div className="flex flex-wrap gap-2"> ... </div> )}` block) and before the `{hasSizes && !selectedSize && (...)}` hint, insert:

```tsx
        {hasSizes && showChart && (
          <div id="add-to-cart-size-chart">
            <SizeChartContent className="relative h-64 w-full overflow-hidden rounded-md" />
          </div>
        )}
```

The fixed `h-64` height (with `object-contain` inside `SizeChartContent`) keeps the popup within the viewport — `DialogContent` has no max-height/scroll of its own.

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npm run test:e2e -- add-to-cart-size-chart`
Expected: PASS — toggle reveals the chart image, label flips to "Hide chart", and clicking again hides it.

- [ ] **Step 7: Commit**

```bash
git add app/_components/cart/add-to-cart-dialog.tsx
git commit -m "feat(cart): inline size chart toggle in add-to-cart popup"
```

---

## Task 4: Final validation

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: build succeeds, no type or lint errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors (watch for unused imports left in either modified component).

- [ ] **Step 3: Full e2e sanity (optional but recommended)**

Run: `npm run test:e2e -- add-to-cart-size-chart`
Expected: PASS.

---

## Self-Review

**Spec coverage:**
- "Inline expand" approach → Task 3 Step 5 (conditional inline render, no second dialog). ✓
- Extract `SizeChartContent` shared component → Task 1. ✓
- Toggle right of "choose your size", only when `hasSizes` → Task 3 Step 4. ✓
- Label flips "Size Chart" / "Hide chart" → Task 3 Step 4. ✓
- Reset on close → Task 3 Step 3. ✓
- Height-bounded container so popup never overflows → Task 3 Step 5 (`h-64`). ✓
- `aria-expanded` + `aria-controls` → Task 3 Step 4 (`add-to-cart-size-chart` id matches the region in Step 5). ✓
- Playwright test: hidden → reveal → hide → Task 2. ✓
- Out of scope (per-product charts, animation) → not added. ✓
- Validation `npm run build` → Task 4. ✓

**Type/name consistency:** `SizeChartContent` props `{ className?: string }` used consistently in Tasks 1 and 3. `aria-controls="add-to-cart-size-chart"` matches the region `id="add-to-cart-size-chart"`. Toggle accessible names (`Size Chart` / `Hide chart`) match the e2e regexes in Task 2.

**Placeholder scan:** none — every code step shows complete code.
