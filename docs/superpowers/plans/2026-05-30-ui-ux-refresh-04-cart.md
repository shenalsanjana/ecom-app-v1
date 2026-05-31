# UI/UX Refresh — Plan 04: Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the cart's conversion polish — add the "Pay in 3" `InstallmentNote` and a payment-method reassurance row (real Koko/Mintpay logos) to the order summary, and align the cart heading with the boutique type scale. The line items and free-shipping progress bar are already well-built and stay.

**Architecture:** Two small presentational edits to existing client components (`cart-summary.tsx`, `cart-page-client.tsx`), reusing Plan 01 primitives (`InstallmentNote`, `PaymentMethodIcon`). No data or logic changes. Verified with `npm run build` + visual check (no RTL — no `render()` tests).

**Tech Stack:** Next.js 16, Tailwind v4 (cocoa/olive/cream tokens), shadcn, lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-30-ui-ux-boutique-refresh-design.md`
**Builds on:** Plans 01–03 (this branch). Uses `InstallmentNote` + `PaymentMethodIcon` from Plan 01.

**Reality check:** `CartItemRow` already has a thumbnail, name, size, a quantity stepper, per-line subtotal, and remove. `CartSummary` already has the free-shipping progress bar. This plan does NOT rebuild those — it only adds the two reassurance pieces below and polishes the heading. (Colour chips are not added — no colour data.) The split-out **Checkout** work + the alternate-mobile migration is **Plan 05**, not here.

---

### Task 1: Pay-in-3 note + payment-method reassurance row in the order summary

**Files:**
- Modify: `app/_components/cart/cart-summary.tsx`

- [ ] **Step 1: Add the two imports**

In `app/_components/cart/cart-summary.tsx`, add to the import block:
```tsx
import { InstallmentNote } from "@/app/_components/shared/installment-note";
import { PaymentMethodIcon } from "@/app/_components/shared/payment-method-icon";
```

- [ ] **Step 2: Add the `InstallmentNote` right after the Total row**

Find the Total row block:
```tsx
      <div className="flex justify-between text-base font-semibold">
        <span className="font-heading">Total</span>
        <span className="font-heading">{formatPrice(total)}</span>
      </div>
```
Immediately AFTER that block's closing `</div>`, add:
```tsx
      <InstallmentNote total={total} className="mt-3 text-center" />
```

- [ ] **Step 3: Add the payment-method reassurance row after the checkout button**

Find the checkout button block:
```tsx
      <Link href="/checkout" className="block mt-6">
        <Button className="w-full" size="lg">
          Proceed to checkout
        </Button>
      </Link>
```
Immediately AFTER that `</Link>`, add:
```tsx
      <div className="mt-4 flex items-center justify-center gap-4">
        {(["KOKO", "MINTPAY", "PAYHERE", "COD"] as const).map((m) => (
          <span key={m} className="flex h-6 items-center" aria-hidden>
            <PaymentMethodIcon method={m} />
          </span>
        ))}
      </div>
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add app/_components/cart/cart-summary.tsx
git commit -m "feat(cart): pay-in-3 note + payment-method reassurance in summary"
```

---

### Task 2: Align the cart page heading with the boutique type scale

**Files:**
- Modify: `app/_components/cart/cart-page-client.tsx`

- [ ] **Step 1: Add `font-heading` to the `<h1>`**

In `app/_components/cart/cart-page-client.tsx`, change:
```tsx
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">Shopping Cart</h1>
```
to:
```tsx
      <h1 className="mb-8 font-heading text-2xl font-semibold tracking-tight">Shopping Cart</h1>
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/_components/cart/cart-page-client.tsx
git commit -m "feat(cart): Fraunces heading on cart page"
```

---

## Visual verification (controller, after all tasks)
Run the app, add an item to the cart, open `/cart`. Confirm: the "Pay in 3" line under the
total, the payment-method icon row (real Koko + Mintpay logos, card + COD line icons) under
the checkout button, the existing free-shipping progress bar intact, and the Fraunces heading.

## Self-Review

**Spec coverage (Cart slice):**
- Free-shipping progress bar → already present (kept) ✅
- "Pay in 3" line in summary → Task 1 ✅
- Payment-method reassurance row → Task 1 ✅
- Refined line items (thumbnail, size, qty stepper, remove) → already present ✅
- Heading on the boutique type scale → Task 2 ✅
- Colour chips → not added (no colour data) ✅
- Checkout + alternate-mobile migration → Plan 05 (out of scope here) ✅

**Placeholder scan:** none — exact files, full snippets, exact commands, expected output.

**Type consistency:** `InstallmentNote` takes `total: number` + optional `className` (Plan 01);
`total` exists in `CartSummary` (`const total = subtotal + shipping`). `PaymentMethodIcon`
takes `method: string` (Plan 01); the `as const` array passes valid method ids. `formatPrice`
and the `Link`/`Button` imports already exist in `cart-summary.tsx`.

**Carry-forward:** Plan 05 = checkout (payment tiles via `PaymentMethodIcon`, numbered steps,
optional email, order-confirmed restyle, `PAYMENT_METHOD_DISPLAY` alignment) + the
alternate-mobile Prisma migration and its form/action/courier-email wiring.
