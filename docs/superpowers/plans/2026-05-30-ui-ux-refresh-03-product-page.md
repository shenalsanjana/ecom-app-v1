# UI/UX Refresh — Plan 03: Product Page Buy Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the product-page buy box (`BuyBoxClient`) — replace the bright stock pills with the palette `StockIndicator`, add the "Pay in 3" `InstallmentNote`, a quantity stepper, a trust row, and desktop sticky behaviour — reusing Plan 01 primitives.

**Architecture:** Targeted edits to one client component (`app/_components/product/buy-box-client.tsx`) plus one container class change (`app/products/[id]/page.tsx`) and the deletion of a dead legacy file. No data-model or logic changes (size selection + cart wiring already exist). Verified with `npm run build` + visual check (no RTL — no `render()` tests).

**Tech Stack:** Next.js 16 (App Router, React 19), Tailwind v4 (cocoa/olive/cream tokens), shadcn, lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-30-ui-ux-boutique-refresh-design.md`
**Builds on:** Plans 01–02 (this branch). Uses `StockIndicator` and `InstallmentNote` from Plan 01.

**Reality check (important):** The buy box `BuyBoxClient` **already** has a working size picker, size-chart link, quantity control, Add-to-cart (with `requiresSize` enforcement), Buy Now, and wishlist. This plan does NOT add a size selector. It only does the polish below. The `Buy Now` button on the PDP stays (express checkout in full product context).

---

### Task 1: Replace bright stock pills with `StockIndicator` + delete dead `buy-box.tsx`

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx`
- Delete: `app/_components/product/buy-box.tsx` (legacy, unused)

- [ ] **Step 1: Confirm `buy-box.tsx` is dead**

Search the repo (Grep) for imports of `buy-box` / the `BuyBox` symbol. Expected: the only match is the `export function BuyBox` definition inside `app/_components/product/buy-box.tsx` itself — NO `import ... from ".../buy-box"` anywhere. If anything imports it, STOP and report DONE_WITH_CONCERNS (do not delete).

- [ ] **Step 2: Import `StockIndicator` in `buy-box-client.tsx`**

Add to the imports block:
```tsx
import { StockIndicator } from "@/app/_components/shared/stock-indicator";
```

- [ ] **Step 3: Remove the local `StockChip` function**

Delete the entire `function StockChip({ stock }: { stock: number }) { ... }` block (the one returning the bright `bg-red-100` / `bg-amber-100` / `bg-emerald-100` pills) from `buy-box-client.tsx`.

- [ ] **Step 4: Use `StockIndicator` where `StockChip` was rendered**

Change:
```tsx
      <div><StockChip stock={stock} /></div>
```
to:
```tsx
      <div><StockIndicator stock={stock} /></div>
```

- [ ] **Step 5: Delete the dead legacy file**

Run:
```bash
git rm app/_components/product/buy-box.tsx
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, no unused-symbol error for `StockChip`, no missing-import error for `buy-box`.

- [ ] **Step 7: Commit**

```bash
git add app/_components/product/buy-box-client.tsx
git commit -m "feat(product): palette stock indicator in buy box; drop dead buy-box.tsx"
```

---

### Task 2: Add the "Pay in 3" `InstallmentNote` under the price

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx`

- [ ] **Step 1: Import the component**

Add to the imports block:
```tsx
import { InstallmentNote } from "@/app/_components/shared/installment-note";
```

- [ ] **Step 2: Render it right after the price block**

Find the price block (ends with the `-{pct}%` `Badge` and its closing `</div>`):
```tsx
      <div className="flex items-baseline gap-3">
        <span
          className={
            "font-heading text-2xl font-semibold " + (onSale ? "text-brand" : "")
          }
        >
          {formatPrice(price)}
        </span>
        {onSale && (
          <>
            <span className="text-base text-muted-foreground line-through">
              {formatPrice(originalPrice as number)}
            </span>
            <Badge variant="brand">-{pct}%</Badge>
          </>
        )}
      </div>
```
Immediately AFTER that closing `</div>`, add:
```tsx
      <InstallmentNote total={price} />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add app/_components/product/buy-box-client.tsx
git commit -m "feat(product): show Pay-in-3 installment note under price"
```

---

### Task 3: Quantity stepper (replace the `<select>`)

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx`

- [ ] **Step 1: Replace the quantity `<select>` block**

Find this block:
```tsx
      {inStock && (
        <div className="flex items-center gap-3">
          <label htmlFor="qty" className="text-sm font-medium">Quantity</label>
          <select
            id="qty"
            name="qty"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {Array.from({ length: qtyMax }).map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
          {inCartQty > 0 && (
            <span className="text-sm text-muted-foreground">
              ({inCartQty} in cart)
            </span>
          )}
        </div>
      )}
```
Replace it with:
```tsx
      {inStock && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Quantity</span>
          <div className="inline-flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className="px-3 py-2 text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[2.5rem] border-x border-border px-2 py-2 text-center text-sm tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(qtyMax, q + 1))}
              disabled={quantity >= qtyMax}
              aria-label="Increase quantity"
              className="px-3 py-2 text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              +
            </button>
          </div>
          {inCartQty > 0 && (
            <span className="text-sm text-muted-foreground">({inCartQty} in cart)</span>
          )}
        </div>
      )}
```

(`quantity`, `setQuantity`, `qtyMax`, `inStock`, `inCartQty` all already exist in this component.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/_components/product/buy-box-client.tsx
git commit -m "feat(product): quantity stepper replaces the qty dropdown"
```

---

### Task 4: Trust row (shipping / returns / secure)

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx`

- [ ] **Step 1: Extend the lucide import + add the threshold import**

The component already imports from `lucide-react` (e.g. `Heart, Star, Loader2`). Add `Truck`, `RotateCcw`, and `ShieldCheck` to that existing import so it reads:
```tsx
import { Heart, Star, Loader2, Truck, RotateCcw, ShieldCheck } from "lucide-react";
```
And add, with the other `@/app/_lib` imports:
```tsx
import { FREE_DELIVERY_THRESHOLD } from "@/app/_lib/checkout-config";
```

- [ ] **Step 2: Add the trust row after the CTA button group**

Find the closing of the button group `<div className="flex flex-col gap-2 sm:flex-row"> ... </div>` (it contains AddToCartButton, the Buy Now `Button`, and the wishlist `Button`). Immediately AFTER that group's closing `</div>`, add:
```tsx
      <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <Truck className="h-4 w-4" aria-hidden /> Free shipping over {formatPrice(FREE_DELIVERY_THRESHOLD)}
        </li>
        <li className="flex items-center gap-1.5">
          <RotateCcw className="h-4 w-4" aria-hidden /> Free 14-day returns
        </li>
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Secure checkout
        </li>
      </ul>
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add app/_components/product/buy-box-client.tsx
git commit -m "feat(product): trust row (shipping, returns, secure checkout)"
```

---

### Task 5: Sticky buy box on desktop

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx`

The buy box is the right-hand grid cell of the PDP. Make it stick on large screens so it stays in view as the gallery scrolls.

- [ ] **Step 1: Add sticky classes to the buy box root**

Change the component's root element from:
```tsx
    <div className="space-y-5">
```
to:
```tsx
    <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
```

(`top-24` clears the sticky header + announcement bar; `self-start` stops the grid from stretching the cell so sticky can take effect.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/_components/product/buy-box-client.tsx
git commit -m "feat(product): sticky buy box on desktop"
```

---

## Deferred (NOT in this plan)
- **Mobile sticky add-to-cart bar.** Worth doing for mobile conversion, but it needs careful
  UX (a fixed bottom bar mirroring size/price/add without duplicating `AddToCartButton`
  logic or conflicting with the inline CTAs). Deferred to a later polish pass so this plan
  stays low-risk; `log`ged here so it isn't silently dropped.

## Visual verification (controller, after all tasks)
Run the app and open a product page (e.g. `/products/<id>` — get a valid id from `/categories`).
Confirm: olive stock indicator (no bright pills), "Pay in 3" line under the price, quantity
stepper, trust row, and that the buy box sticks while the gallery scrolls on desktop.

## Self-Review

**Spec coverage (Product page slice):**
- Palette stock indicator (retire bright pills) → Task 1 ✅
- "Pay in 3" installment line → Task 2 ✅
- Quantity stepper → Task 3 ✅
- Trust row → Task 4 ✅
- Sticky buy box (desktop) → Task 5 ✅
- Size selector → already exists; correctly NOT re-added ✅
- Mobile sticky bar → explicitly deferred (logged) ✅
- Gallery, description, reviews, related strip → unchanged (out of scope) ✅

**Placeholder scan:** none — exact file, full snippets, exact commands, expected output.

**Type consistency:** `StockIndicator` (Plan 01) and `InstallmentNote` (Plan 01) imported by
exact path. `FREE_DELIVERY_THRESHOLD` is exported from `app/_lib/checkout-config.ts` (used in
Plan 02 Task 1 already). `quantity`/`setQuantity`/`qtyMax`/`inStock`/`inCartQty` already exist
in `BuyBoxClient`. `formatPrice` is already imported there.

**Carry-forward:** Plan 04 (cart + checkout) wires `InstallmentNote`/`PaymentMethodIcon`, the
alternate-mobile migration, optional email, and the order-confirmed restyle; also aligns
`PAYMENT_METHOD_DISPLAY` ("PayHere" → "Credit / Debit Card") per Plan 01's carry-forward note.
