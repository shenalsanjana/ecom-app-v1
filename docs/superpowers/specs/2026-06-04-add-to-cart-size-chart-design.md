# Inline Size Chart in the Add-to-cart Popup

**Date:** 2026-06-04
**Status:** Approved design

## Problem

The quick **Add-to-cart popup** (`AddToCartDialog`, opened from product cards and listings) asks the customer to pick a size (S/M/L/XL) but gives them no way to check measurements first. Customers must either guess or abandon the popup to find sizing — leading to wrong-size orders and returns.

The product detail page already solves this with a `SizeChartDialog`, but that affordance is absent from the quick popup.

## Goal

Let a customer view the size chart **without leaving the Add-to-cart popup**, so they can decide their size before selecting it.

## Approach

**Inline expand.** A "Size Chart" toggle inside the popup reveals the chart image in-place (no second, stacked dialog). Chosen over a nested dialog so the customer stays in one surface, and over a content-swap so the size buttons remain visible while reading the chart.

## Design

### 1. Extract `SizeChartContent` (shared presentational component)

Pull the chart figure out of `app/_components/product/size-chart-dialog.tsx` into a new presentational component:

- **`SizeChartContent`** — renders the title ("Oversize T-shirt size chart"), the `/size-charts/oversize.jpg` image, and the caption ("Measurements in inches, ±0.5" tolerance. Unisex sizing.").
- `SizeChartDialog` keeps wrapping `SizeChartContent` in a Radix dialog → the product page is visually unchanged.
- `AddToCartDialog` renders `SizeChartContent` inline.

This gives one source of truth for the chart image path and caption; no duplication.

**Image sizing:** `SizeChartContent` must accept the layout it lives in. The dialog usage (product page) is wide (`sm:max-w-2xl`); the inline popup usage is narrow and must be height-bounded. Implement by letting the consumer control the container — `SizeChartContent` renders an image with `object-contain` that fills its parent, and each caller wraps it in an appropriately sized container:
- Product-page dialog: existing `aspect-square w-full` container.
- Add-to-cart popup: a fixed-height container (e.g. `h-64 w-full`) so the popup never exceeds the viewport (`DialogContent` has no max-height/scroll of its own).

### 2. `AddToCartDialog` changes

File: `app/_components/cart/add-to-cart-dialog.tsx`

- **State:** add `const [showChart, setShowChart] = useState(false)`.
- **Reset:** in `handleOpenChange`, set `showChart` back to `false` when the popup closes (alongside the existing `selectedSize`/`added` resets), so reopening starts collapsed.
- **Toggle control:** a button labelled "Size Chart" with a `Ruler` icon (lucide-react), placed on the **same row as the description**, right-aligned. Rendered **only when `hasSizes`** — a sizeless product has no chart to show.
  - The header must be restructured: `DialogDescription` renders a `<p>`, so the toggle (a `<button>`) cannot be nested inside it. Wrap `DialogDescription` and the toggle button together in a `flex items-center justify-between gap-2` row inside `DialogHeader`.
  - Label flips between "Size Chart" (collapsed) and "Hide chart" (expanded).
- **Chart region:** when `showChart` is true, render `SizeChartContent` (in its height-bounded container) **below the size-button row**, above the `DialogFooter`.
- **Accessibility:** the toggle gets `aria-expanded={showChart}` and `aria-controls` referencing the chart region's `id`.

### Component boundaries

- `SizeChartContent` — pure presentational; knows the chart image + copy, nothing about dialogs or cart state.
- `SizeChartDialog` — wraps `SizeChartContent` in a dialog with a link trigger (unchanged behavior).
- `AddToCartDialog` — owns popup + cart state; now also owns the inline `showChart` toggle.

## Testing

Playwright e2e (extend the flow that opens the Add-to-cart popup):

1. Open the Add-to-cart popup for a product that has sizes.
2. Assert the chart image is **not** visible initially.
3. Click "Size Chart" → assert the chart image becomes visible and the toggle reads "Hide chart".
4. Click "Hide chart" → assert the chart image is hidden again.

## Out of scope (YAGNI)

- **Per-product / per-category charts.** The chart remains the single shared "oversize t-shirt" image, exactly as today. If the catalog later needs multiple charts, that is a separate change.
- **Animated expand/collapse.** Plain conditional render; no transition work unless it looks abrupt in review.

## Validation

`npm run build` must pass before merge (per `CLAUDE.md`).
