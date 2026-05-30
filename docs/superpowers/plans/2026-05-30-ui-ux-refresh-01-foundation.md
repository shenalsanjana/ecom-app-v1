# UI/UX Refresh — Plan 01: Foundation (shared primitives) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, reused, testable primitives the rest of the refresh depends on — a "pay in 3" installment line, a palette-aligned stock indicator, a customer-friendly card-payment label, and a premium payment-method icon — without touching any page layout yet.

**Architecture:** Pure helper functions (TDD with vitest, node env) paired with thin presentational components that consume them. Components are verified with `npm run build` + visual check (this repo has **no** RTL/jsdom — do not write `render()` tests). Each task is independently committable and leaves the app working.

**Tech Stack:** Next.js 16 (App Router, React 19), Tailwind v4 (existing cream/cocoa/olive tokens), shadcn components, lucide-react, vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-05-30-ui-ux-boutique-refresh-design.md`

---

### Task 1: `installmentAmount` pricing helper

**Files:**
- Create: `app/_lib/installments.ts`
- Test: `app/_lib/__tests__/installments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/_lib/__tests__/installments.test.ts
import { describe, it, expect } from "vitest";
import { installmentAmount, INSTALMENT_COUNT } from "../installments";

describe("installmentAmount", () => {
  it("splits a total into 3 equal parts by default", () => {
    expect(INSTALMENT_COUNT).toBe(3);
    expect(installmentAmount(11100)).toBe(3700);
  });

  it("rounds to 2 decimal places", () => {
    expect(installmentAmount(1000)).toBe(333.33);
  });

  it("returns 0 for non-positive or invalid totals", () => {
    expect(installmentAmount(0)).toBe(0);
    expect(installmentAmount(-5)).toBe(0);
    expect(installmentAmount(Number.NaN)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/installments.test.ts`
Expected: FAIL — `Cannot find module '../installments'`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// app/_lib/installments.ts
// Koko and Mintpay both split an order into equal, interest-free instalments
// ("pay in 3"). This is display-only — the gateways compute their own schedules.
export const INSTALMENT_COUNT = 3;

/** Per-instalment amount for a "pay in 3" plan, rounded to 2 decimals. */
export function installmentAmount(total: number, count: number = INSTALMENT_COUNT): number {
  if (!Number.isFinite(total) || total <= 0 || count <= 0) return 0;
  return Math.round((total / count) * 100) / 100;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/installments.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/installments.ts app/_lib/__tests__/installments.test.ts
git commit -m "feat(pricing): add installmentAmount pay-in-3 helper"
```

---

### Task 2: `InstallmentNote` component

**Files:**
- Create: `app/_components/shared/installment-note.tsx`

This is a presentational server component (no client state). Reused by the product page, cart, and checkout in later plans. No RTL here — verify via build.

- [ ] **Step 1: Write the component**

```tsx
// app/_components/shared/installment-note.tsx
import { formatPrice } from "@/app/_lib/format";
import { installmentAmount, INSTALMENT_COUNT } from "@/app/_lib/installments";

type Props = { total: number; className?: string };

// "or 3 interest-free payments of Rs X with Koko / Mintpay"
export function InstallmentNote({ total, className }: Props) {
  if (total <= 0) return null;
  const per = installmentAmount(total);
  if (per <= 0) return null;

  return (
    <p className={"text-sm text-muted-foreground " + (className ?? "")}>
      or {INSTALMENT_COUNT} interest-free payments of{" "}
      <span className="font-medium text-foreground">{formatPrice(per)}</span> with{" "}
      <span className="font-medium text-brand">Koko</span> /{" "}
      <span className="font-medium text-brand">Mintpay</span>
    </p>
  );
}
```

- [ ] **Step 2: Verify it type-checks and builds**

Run: `npm run build`
Expected: `✓ Compiled successfully`. No type errors referencing `installment-note.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/_components/shared/installment-note.tsx
git commit -m "feat(ui): add InstallmentNote pay-in-3 component"
```

---

### Task 3: Relabel the card payment option ("PayHere" → "Credit / Debit Card")

**Files:**
- Modify: `app/_lib/payments/registry.ts:13-27` (the `checkoutPaymentOptions` PAYHERE entry)
- Test: `app/_lib/payments/__tests__/registry.test.ts`

The customer-facing name should not be the processor brand. Option `id` stays `PAYHERE` (used by the initiation code) — only `name`/`description` change.

- [ ] **Step 1: Add a failing test for the new label**

Add this test inside the existing `describe("payment registry", ...)` block in `app/_lib/payments/__tests__/registry.test.ts`:

```ts
  it("labels the PayHere option as a customer-friendly card option", () => {
    const card = checkoutPaymentOptions().find((o) => o.id === "PAYHERE");
    expect(card?.name).toBe("Credit / Debit Card");
    expect(card?.description).toMatch(/secured by PayHere/i);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/payments/__tests__/registry.test.ts`
Expected: FAIL — current name is `"PayHere"`, not `"Credit / Debit Card"`.

- [ ] **Step 3: Update the option label**

In `app/_lib/payments/registry.ts`, change the PAYHERE entry in `checkoutPaymentOptions`:

```ts
    { id: "PAYHERE", name: "Credit / Debit Card", description: "Visa, Mastercard & more — secured by PayHere", icon: "💳" },
```

- [ ] **Step 4: Run the registry tests to verify they pass**

Run: `npx vitest run app/_lib/payments/__tests__/registry.test.ts`
Expected: PASS (existing id-order tests still pass; new label test passes).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/payments/registry.ts app/_lib/payments/__tests__/registry.test.ts
git commit -m "feat(checkout): relabel PayHere option as Credit / Debit Card"
```

---

### Task 4: `stockStatus` helper + `StockIndicator` component

**Files:**
- Create: `app/_lib/stock-indicator.ts`
- Test: `app/_lib/__tests__/stock-indicator.test.ts`
- Create: `app/_components/shared/stock-indicator.tsx`

Replaces the bright `red/amber/emerald-100` pills in `buy-box.tsx` with a palette-aligned
indicator (olive dot for in/low stock; the palette's muted-brick `destructive` for out).
The buy box is rewired to use it in **Plan 03** — this task only creates the primitive.

- [ ] **Step 1: Write the failing helper test**

```ts
// app/_lib/__tests__/stock-indicator.test.ts
import { describe, it, expect } from "vitest";
import { stockStatus } from "../stock-indicator";

describe("stockStatus", () => {
  it("reports out of stock at 0 or below", () => {
    expect(stockStatus(0)).toEqual({ tone: "out", label: "Out of stock" });
    expect(stockStatus(-2)).toEqual({ tone: "out", label: "Out of stock" });
  });

  it("reports low stock at or below the threshold", () => {
    expect(stockStatus(3)).toEqual({ tone: "low", label: "Only 3 left" });
    expect(stockStatus(5)).toEqual({ tone: "low", label: "Only 5 left" });
  });

  it("reports in stock above the threshold", () => {
    expect(stockStatus(6)).toEqual({ tone: "in", label: "In stock" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/stock-indicator.test.ts`
Expected: FAIL — `Cannot find module '../stock-indicator'`.

- [ ] **Step 3: Write the helper**

```ts
// app/_lib/stock-indicator.ts
export type StockTone = "out" | "low" | "in";
export type StockStatus = { tone: StockTone; label: string };

export function stockStatus(stock: number, lowThreshold = 5): StockStatus {
  if (stock <= 0) return { tone: "out", label: "Out of stock" };
  if (stock <= lowThreshold) return { tone: "low", label: `Only ${stock} left` };
  return { tone: "in", label: "In stock" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/stock-indicator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the presentational component**

```tsx
// app/_components/shared/stock-indicator.tsx
import { stockStatus } from "@/app/_lib/stock-indicator";

export function StockIndicator({ stock }: { stock: number }) {
  const { tone, label } = stockStatus(stock);
  const textClass = tone === "out" ? "text-destructive" : "text-brand";
  const dotClass = tone === "out" ? "bg-destructive" : "bg-brand";
  return (
    <span className={"inline-flex items-center gap-2 text-sm " + textClass}>
      <span className={"h-1.5 w-1.5 rounded-full " + dotClass} aria-hidden />
      {label}
    </span>
  );
}
```

- [ ] **Step 6: Verify it builds**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/stock-indicator.ts app/_lib/__tests__/stock-indicator.test.ts app/_components/shared/stock-indicator.tsx
git commit -m "feat(ui): add palette-aligned StockIndicator + stockStatus helper"
```

---

### Task 5: Payment-method logo assets + `PaymentMethodIcon`

**Files:**
- Create: `public/payment/koko.jpg` (copied from `tmp/koko_logo.jpg`)
- Create: `public/payment/mintpay.png` (copied from `tmp/mintpay_logo.png`)
- Create: `app/_components/shared/payment-method-icon.tsx`

Provides the premium per-method icon used by the checkout payment tiles (Plan 04). COD and
card use lucide line icons; Koko/Mintpay use the real brand logos.

> Production note (not a blocker): `koko.jpg` is a 417 KB white-background JPEG. After this
> refresh, replace both with trimmed/transparent **SVG or PNG** for crisp edges on any
> surface and faster load. Tracked in the spec's "Dependencies & backend impact".

- [ ] **Step 1: Stage the brand logos into `public/`**

Run:
```bash
mkdir -p public/payment
cp tmp/koko_logo.jpg public/payment/koko.jpg
cp tmp/mintpay_logo.png public/payment/mintpay.png
ls -la public/payment
```
Expected: both files listed (`koko.jpg` ~417 KB, `mintpay.png` ~27 KB).

- [ ] **Step 2: Write the icon component**

```tsx
// app/_components/shared/payment-method-icon.tsx
import Image from "next/image";
import { Banknote, CreditCard } from "lucide-react";

// Renders the brand mark / icon for a checkout payment method.
// Koko & Mintpay use their real logos; Card (PAYHERE) and COD use line icons.
export function PaymentMethodIcon({ method }: { method: string }) {
  if (method === "KOKO") {
    return (
      <Image src="/payment/koko.jpg" alt="Koko" width={52} height={24} className="object-contain" />
    );
  }
  if (method === "MINTPAY") {
    return (
      <Image src="/payment/mintpay.png" alt="Mintpay" width={28} height={28} className="rounded object-contain" />
    );
  }
  if (method === "COD") {
    return <Banknote className="h-5 w-5 text-muted-foreground" aria-hidden />;
  }
  // PAYHERE / card
  return <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden />;
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: `✓ Compiled successfully`. (Next's `<Image>` for local `public/` assets needs no
config.)

- [ ] **Step 4: Commit**

```bash
git add public/payment/koko.jpg public/payment/mintpay.png app/_components/shared/payment-method-icon.tsx
git commit -m "feat(checkout): add PaymentMethodIcon with real Koko/Mintpay logos"
```

> Note: `tmp/` is gitignored, but `public/payment/*` is **not** — confirm the two logo files
> are staged by the `git add` above (they are real committed assets).

---

## Self-Review

**Spec coverage (Foundation slice):**
- Installment "Pay in 3" line → Tasks 1–2 ✅
- Palette-aligned stock indicator (retire bright pills) → Task 4 ✅
- "Credit / Debit Card" label instead of PayHere → Task 3 ✅
- Premium payment icons + real Koko/Mintpay logos → Task 5 ✅
- Swatches → correctly **absent** (cut per decision) ✅
- Announcement bar, hero, cards, buy box, cart, checkout layout, alternate-mobile migration,
  footer, type/spacing pass → **out of scope for Plan 01**, handled in Plans 02–05 ✅

**Placeholder scan:** none — every step has exact paths, full code, exact commands, expected output.

**Type consistency:** `installmentAmount`/`INSTALMENT_COUNT` (Task 1) are imported exactly as
named in Task 2. `stockStatus`/`StockTone`/`StockStatus` (Task 4) are consistent. Option `id`
`PAYHERE` is unchanged (Task 3) so `getPaymentProvider`/initiation code is unaffected.

**Carry-forward for later plans:** Plan 03 rewires `buy-box.tsx` to use `StockIndicator` and
adds `InstallmentNote`; Plan 04 uses `PaymentMethodIcon` + `InstallmentNote` in checkout/cart
and restyles the order-confirmed screen off `green-*`.
