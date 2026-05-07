# Checkout flow — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four scoped fixes/improvements to the purchase funnel: signup respects `callbackUrl`, "Buy now" scrolls to the size picker on PDP, free-shipping progress bar on cart, and an optional order-notes field on checkout.

**Architecture:** Pure additive changes to existing pages/components plus one nullable Postgres column (`Order.notes`) and a new presentational `<FreeShippingProgress>` component. No structural refactors. Each task ends in a green `npx tsc --noEmit` and a self-contained commit.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 6 → Prisma Postgres, NextAuth 5, shadcn/ui, Tailwind, Zod. No test framework configured — verification per task is `npx tsc --noEmit` plus visual smoke checks where noted.

**Spec:** `docs/superpowers/specs/2026-05-07-checkout-flow-phase-1-design.md`

---

## File map

| Path | Status | Responsibility |
|---|---|---|
| `app/(auth)/signup/page.tsx` | modify (1 hunk) | Hidden `callbackUrl` input populated from `searchParams` |
| `app/(auth)/actions.ts` | modify (1 hunk inside `signupAction`) | Read `callbackUrl` from form, validate same-origin, redirect there |
| `app/_components/product/buy-box-client.tsx` | modify (3 hunks) | Read `?action=buy-now` on mount, scroll/highlight size picker, give the picker an `id` and `data-attention` styling |
| `prisma/schema.prisma` | modify (1 hunk in `Order` model) | Add `notes String?` |
| `prisma/migrations/<ts>_add_order_notes/migration.sql` | create | Auto-generated `ALTER TABLE` |
| `app/checkout/actions.ts` | modify (3 hunks) | Add `notes` to `ProcessOrderSchema`, persist on `Order.create.data`, pass to mailer payload |
| `app/_lib/mailer.ts` | modify (3 hunks) | Add `notes?: string` to `OrderDetails`, escape + render in text & HTML bodies, add tiny `escapeHtml` helper |
| `app/checkout/checkout-client.tsx` | modify (3 hunks) | Add `notes` state, render `<Textarea>` between Shipping and Payment sections, include `notes` in the `processOrder` call |
| `app/_components/cart/free-shipping-progress.tsx` | create | New presentational client component: progress bar + status text |
| `app/_components/cart/cart-summary.tsx` | modify (1 hunk) | Replace existing inline free-shipping text with `<FreeShippingProgress subtotal={subtotal} />` |

---

## Task 1: Signup respects `callbackUrl`

**Files:**
- Modify: `app/(auth)/signup/page.tsx` (1 hunk)
- Modify: `app/(auth)/actions.ts` (1 hunk inside `signupAction`, ~lines 30–58)

**Why:** Today's `signupAction` ends with `redirect("/")`. A guest who hits "Sign in" from checkout, then clicks "Create account" instead of signing in, signs up, lands on home, loses their checkout context. Login already supports `callbackUrl`; bring signup to parity. Open-redirect risk mitigated by the same same-origin check used in login.

- [ ] **Step 1: Read the existing `loginAction` callback pattern**

Read `app/(auth)/actions.ts` and confirm `loginAction` (around lines 60–80) reads `callbackUrl` from `formData` and uses `redirect(callbackUrl)`. The signup change mirrors this.

- [ ] **Step 2: Add hidden `callbackUrl` input to the signup form**

Open `app/(auth)/signup/page.tsx`. The current page is a `"use client"` component using `useActionState`. Two issues to handle:
- The page needs `searchParams` to read the URL — but since it's a client component, use `useSearchParams()` from `next/navigation` instead of a server prop.
- Add a hidden `<input name="callbackUrl">` inside the `<form>`.

Replace the imports block at the top:

```tsx
"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signupAction, type ActionState } from "@/app/(auth)/actions";
```

Then inside `SignupPage`, after the `useActionState` line, add:

```tsx
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
```

And inside the `<form action={formAction} className="space-y-4">` block, add the hidden input as the first child:

```tsx
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
```

- [ ] **Step 3: Update `signupAction` to honor `callbackUrl`**

Open `app/(auth)/actions.ts`. Locate `signupAction` (currently ~lines 30–58). It currently ends with `redirect("/")`. Replace the redirect with the callback-aware version.

Find:

```ts
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect("/");
}
```

Replace with:

```ts
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  const rawCallback = (formData.get("callbackUrl") as string | null) ?? "/";
  // Same-origin only — reject "//evil.com/foo" and absolute URLs.
  const safeCallback =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/";
  redirect(safeCallback);
}
```

Also update the existing successful-signup-but-email-already-exists branch (around line 43, the `NEUTRAL_SIGNUP_MESSAGE` return) — it currently returns a `success` ActionState rather than redirecting, so it does NOT need a callback change. Leave it alone.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/signup/page.tsx app/\(auth\)/actions.ts
git commit -m "fix(auth): signupAction respects callbackUrl on success"
```

---

## Task 2: Buy Now scrolls to size picker on PDP

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx` (3 hunks: imports, size-picker block, new effect)

**Why:** From a product card the "Buy now" link goes to `/products/<id>?action=buy-now`. The `?action=buy-now` query param is currently passed but never read. When the user lands on the PDP, the page sits there with no indication that they need to pick a size. Improvement: scroll to and highlight the size picker. After they pick a size and click "Buy now" themselves, the existing `handleBuyNow()` flow takes over (no auto-trigger — felt coercive in spec discussion).

- [ ] **Step 1: Add `useSearchParams` + `useEffect` imports**

Open `app/_components/product/buy-box-client.tsx`. The current top imports include `useState` from React. Add `useEffect` to that import and add a new import for `useSearchParams`. Find:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
```

Replace with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
```

- [ ] **Step 2: Read `?action=buy-now` and add the scroll/highlight effect**

Inside `BuyBoxClient`, after the existing `const [selectedSize, setSelectedSize] = useState<string>("");` line (around line 62), add:

```tsx
  const searchParams = useSearchParams();
  const buyNowIntent = searchParams.get("action") === "buy-now";

  useEffect(() => {
    if (!buyNowIntent) return;
    if (!sizeList.length) return;
    if (selectedSize) return;
    const el = document.getElementById("size-picker");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute("data-attention", "true");
    const t = setTimeout(() => el.removeAttribute("data-attention"), 2000);
    return () => clearTimeout(t);
  }, [buyNowIntent, sizeList.length, selectedSize]);
```

Notes:
- `sizeList` is computed earlier in the component (`const sizeList = sizes ? sizes.split(",").map(s => s.trim()) : [];` at line 64).
- `selectedSize` guard prevents the effect from running on every re-render after the user has picked.
- The cleanup `clearTimeout` matters because React Strict Mode can run the effect twice in dev.

- [ ] **Step 3: Add `id="size-picker"` and `data-attention` styling to the picker block**

Find this block (currently lines 121–144):

```tsx
      {/* Size Selection */}
      {sizeList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Size:</span>
            <span className="text-sm text-muted-foreground">{selectedSize || "Select a size"}</span>
            <SizeChartDialog />
          </div>
          <div className="flex flex-wrap gap-2">
            {sizeList.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSelectedSize(size)}
                className={`min-w-[48px] rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedSize === size
                    ? "border-black bg-black text-white"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}
```

Replace the outer `<div className="space-y-2">` with one that has the `id` and `data-attention` ring classes. The whole block becomes:

```tsx
      {/* Size Selection */}
      {sizeList.length > 0 && (
        <div
          id="size-picker"
          className="space-y-2 rounded-md transition-shadow data-[attention=true]:ring-2 data-[attention=true]:ring-primary data-[attention=true]:ring-offset-2 data-[attention=true]:ring-offset-background"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Size:</span>
            <span className="text-sm text-muted-foreground">{selectedSize || "Select a size"}</span>
            <SizeChartDialog />
          </div>
          <div className="flex flex-wrap gap-2">
            {sizeList.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSelectedSize(size)}
                className={`min-w-[48px] rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedSize === size
                    ? "border-black bg-black text-white"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}
```

The `data-[attention=true]:ring-2 ring-primary ring-offset-2` flashes the picker for 2 seconds when scrolled into view. The Tailwind data-attribute selector syntax (`data-[attention=true]:`) requires Tailwind 3+ which the project already uses.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/_components/product/buy-box-client.tsx
git commit -m "feat(pdp): scroll to + flash size picker when ?action=buy-now is set"
```

---

## Task 3: Add `Order.notes` column

**Files:**
- Modify: `prisma/schema.prisma` (1 hunk in the `Order` model)
- Create: `prisma/migrations/<timestamp>_add_order_notes/migration.sql` (auto-generated)

**Why:** Foundation for Task 4 (server-side notes wiring) and Task 5 (UI). A single nullable column on `Order`. Auto-generated migration. No data backfill needed.

- [ ] **Step 1: Add `notes String?` to the `Order` model**

Open `prisma/schema.prisma`. Locate the `Order` model. Find the existing `idempotencyKey String?  @unique` line (currently line 130). Add `notes String?` immediately after it. The block becomes:

```prisma
  idempotencyKey        String?  @unique
  notes                 String?
  createdAt             DateTime @default(now())
```

- [ ] **Step 2: Generate the migration**

```bash
npx prisma migrate dev --name add_order_notes
```

Expected output (approximately):

```
Applying migration `<timestamp>_add_order_notes`
The following migration(s) have been created and applied from new schema changes:
prisma/migrations/
  └─ <timestamp>_add_order_notes/
    └─ migration.sql
✔ Generated Prisma Client
```

This both creates the migration file AND applies it to the local development database (which is the same shared Prisma Postgres as production). That's intentional — schema changes are forward-only and `notes` defaults to NULL on existing rows.

- [ ] **Step 3: Verify the generated migration**

```bash
type "prisma\migrations\<timestamp>_add_order_notes\migration.sql"
```

(Use `cat` on Bash, `Get-Content` or `type` on PowerShell — replace `<timestamp>` with whatever Prisma generated, e.g. `20260507143000_add_order_notes`.)

Expected content:

```sql
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "notes" TEXT;
```

- [ ] **Step 4: Verify TypeScript still compiles (Prisma client got regenerated)**

```bash
npx tsc --noEmit
```

Expected: no errors. The new `notes` field is now part of the generated Prisma `OrderCreateInput` / `Order` types — used by Tasks 4 and 5.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Order.notes nullable column for delivery instructions"
```

---

## Task 4: Wire `notes` through the order server action and email

**Files:**
- Modify: `app/checkout/actions.ts` (3 hunks)
- Modify: `app/_lib/mailer.ts` (3 hunks: type, escape helper, body rendering)

**Why:** Server-side validation and persistence for the `notes` field, plus include it in the customer/brand confirmation email when present.

- [ ] **Step 1: Add `notes` to `ProcessOrderSchema`**

Open `app/checkout/actions.ts`. Find `ProcessOrderSchema` (currently ~lines 50–57):

```ts
const ProcessOrderSchema = z.object({
  items: z.array(ItemInputSchema).min(1, "Cart is empty"),
  shippingAddress: AddressSchema,
  paymentMethod: z.enum(["COD", "PAYHERE", "KOKO", "MINITPAY"]),
  contactPhone: LkPhoneSchema,
  guestInfo: GuestInfoSchema.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
```

Add `notes` after `idempotencyKey`:

```ts
const ProcessOrderSchema = z.object({
  items: z.array(ItemInputSchema).min(1, "Cart is empty"),
  shippingAddress: AddressSchema,
  paymentMethod: z.enum(["COD", "PAYHERE", "KOKO", "MINITPAY"]),
  contactPhone: LkPhoneSchema,
  guestInfo: GuestInfoSchema.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  notes: z.string().trim().max(500).optional(),
});
```

- [ ] **Step 2: Destructure `notes` and persist it on the order**

In the same file, find this destructuring at the top of `processOrder` (currently ~line 67):

```ts
  const { items, shippingAddress, paymentMethod, contactPhone, guestInfo, idempotencyKey } =
    parsed.data;
```

Replace with:

```ts
  const { items, shippingAddress, paymentMethod, contactPhone, guestInfo, idempotencyKey, notes } =
    parsed.data;
```

Then find the `tx.order.create` call (currently ~lines 158–188). Find this section:

```ts
          paymentMethod,
          paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
          status: "PENDING",
          idempotencyKey: idempotencyKey ?? null,
          items: {
```

Replace with:

```ts
          paymentMethod,
          paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
          status: "PENDING",
          idempotencyKey: idempotencyKey ?? null,
          notes: notes && notes.length > 0 ? notes : null,
          items: {
```

(Empty string → `null` so `WHERE notes IS NOT NULL` queries behave as expected.)

- [ ] **Step 3: Pass `notes` to the email helper**

In the same file, find the `sendOrderConfirmationEmail` call (currently ~lines 261–275):

```ts
    await sendOrderConfirmationEmail({
      orderId,
      customerName,
      customerEmail,
      customerPhone: contactPhone,
      items: orderItems,
      subtotal,
      shipping: shippingCost,
      total,
      shippingAddress,
      paymentMethod,
      paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
      trackingCode,
    });
```

Add `notes` to the call:

```ts
    await sendOrderConfirmationEmail({
      orderId,
      customerName,
      customerEmail,
      customerPhone: contactPhone,
      items: orderItems,
      subtotal,
      shipping: shippingCost,
      total,
      shippingAddress,
      paymentMethod,
      paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
      trackingCode,
      notes: notes && notes.length > 0 ? notes : undefined,
    });
```

- [ ] **Step 4: Add `notes?` to `OrderDetails`, add `escapeHtml` helper, render notes in both email bodies**

Open `app/_lib/mailer.ts`. Three sub-changes:

**4a) Add `notes?` to `OrderDetails`** (currently ~lines 75–95). Find the `OrderDetails` type:

```ts
export type OrderDetails = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: "COD" | "PAYHERE" | "KOKO" | "MINITPAY";
  paymentMethodDisplay?: string;
  trackingCode?: string;
};
```

Add `notes?: string;` before the closing brace:

```ts
export type OrderDetails = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: "COD" | "PAYHERE" | "KOKO" | "MINITPAY";
  paymentMethodDisplay?: string;
  trackingCode?: string;
  notes?: string;
};
```

**4b) Add an `escapeHtml` helper.** Right below the `import` block (after line 3), add:

```ts
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

This helper is used for the notes block in the HTML email below (and is now available for any future user-supplied string we render into HTML).

**4c) Render `notes` in both text and HTML bodies of `sendOrderConfirmationEmail`.** Find the text body's shipping address block (currently ~lines 137–141):

```
Shipping Address:
${order.shippingAddress.line1}
${order.shippingAddress.line2 ? order.shippingAddress.line2 + "\n" : ""}${order.shippingAddress.city}, ${order.shippingAddress.region} ${order.shippingAddress.postalCode}
${order.shippingAddress.country}
```

Insert a notes block immediately after `${order.shippingAddress.country}` line:

```
Shipping Address:
${order.shippingAddress.line1}
${order.shippingAddress.line2 ? order.shippingAddress.line2 + "\n" : ""}${order.shippingAddress.city}, ${order.shippingAddress.region} ${order.shippingAddress.postalCode}
${order.shippingAddress.country}
${order.notes && order.notes.trim() ? `\nDelivery Notes:\n${order.notes}\n` : ""}
```

Then in the HTML body, find the `<div class="footer">` block (currently ~lines 188–197):

```html
    <div class="footer">
      <h3>Shipping Address</h3>
      <p>
        ${order.shippingAddress.line1}<br>
        ${order.shippingAddress.line2 ? order.shippingAddress.line2 + "<br>" : ""}
        ${order.shippingAddress.city}, ${order.shippingAddress.region} ${order.shippingAddress.postalCode}<br>
        ${order.shippingAddress.country}
      </p>
      <p>Need help? Contact us at <strong>${CONTACT_NUMBER}</strong> or <a href="mailto:${brandEmail}">${brandEmail}</a>.</p>
    </div>
```

Insert a notes block between the shipping `<p>` and the "Need help?" `<p>`:

```html
    <div class="footer">
      <h3>Shipping Address</h3>
      <p>
        ${order.shippingAddress.line1}<br>
        ${order.shippingAddress.line2 ? order.shippingAddress.line2 + "<br>" : ""}
        ${order.shippingAddress.city}, ${order.shippingAddress.region} ${order.shippingAddress.postalCode}<br>
        ${order.shippingAddress.country}
      </p>
      ${order.notes && order.notes.trim() ? `<h3>Delivery Notes</h3><p>${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p>` : ""}
      <p>Need help? Contact us at <strong>${CONTACT_NUMBER}</strong> or <a href="mailto:${brandEmail}">${brandEmail}</a>.</p>
    </div>
```

`escapeHtml` neutralizes any HTML the customer might paste; the `.replace(/\n/g, "<br>")` preserves line breaks in their note.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/checkout/actions.ts app/_lib/mailer.ts
git commit -m "feat(checkout): persist Order.notes and include in confirmation email"
```

---

## Task 5: Add the order-notes textarea to the checkout UI

**Files:**
- Modify: `app/checkout/checkout-client.tsx` (3 hunks: imports, state, render between Shipping & Payment)

**Why:** The visible UI for the field. Server-side already accepts and persists `notes` (Task 4). Now wire the form input.

- [ ] **Step 1: Add `Textarea` and `FileText` imports**

Open `app/checkout/checkout-client.tsx`. Top imports currently include `lucide-react` icons and shadcn primitives. Find this import block:

```tsx
import { ArrowLeft, ShoppingBag, Truck, CreditCard, User } from "lucide-react";
import { useCart } from "@/app/_lib/cart-context";
import { processOrder } from "./actions";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
```

Replace with:

```tsx
import { ArrowLeft, ShoppingBag, Truck, CreditCard, User, FileText } from "lucide-react";
import { useCart } from "@/app/_lib/cart-context";
import { processOrder } from "./actions";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
```

- [ ] **Step 2: Add `notes` state**

Inside `CheckoutClient`, after the existing `address` state (currently lines 62–69), add:

```tsx
  const [notes, setNotes] = useState("");
```

- [ ] **Step 3: Pass `notes` into `processOrder`**

In `handleSubmit` (currently ~lines 132–168), find the `processOrder` call:

```tsx
      const result = await processOrder({
        items: items.map((it) => ({
          productId: it.productId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          size: it.size,
        })),
        shippingAddress: normalizedAddress,
        paymentMethod,
        contactPhone: phone,
        guestInfo: isGuest ? { name: guest.name, email: guest.email, phone } : undefined,
        idempotencyKey,
      });
```

Add a `notes` line:

```tsx
      const result = await processOrder({
        items: items.map((it) => ({
          productId: it.productId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          size: it.size,
        })),
        shippingAddress: normalizedAddress,
        paymentMethod,
        contactPhone: phone,
        guestInfo: isGuest ? { name: guest.name, email: guest.email, phone } : undefined,
        idempotencyKey,
        notes: notes.trim() || undefined,
      });
```

- [ ] **Step 4: Render the notes section between Shipping and Payment**

Find the closing `</div>` of the Shipping Address section (`<div className="rounded-lg border p-6">` block that opens at ~line 243 and closes at ~line 345). The next sibling is the Payment Method `<div className="rounded-lg border p-6">` (opens ~line 347).

Insert a new section between them. Find:

```tsx
                </div>

                <div className="rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Payment Method</h2>
                  </div>
```

Replace with:

```tsx
                </div>

                <div className="rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Delivery notes</h2>
                    <span className="text-xs text-muted-foreground">Optional</span>
                  </div>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                    rows={3}
                    maxLength={500}
                    placeholder="e.g. Leave at front desk; call before delivery"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {notes.length}/500
                  </p>
                </div>

                <div className="rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Payment Method</h2>
                  </div>
```

Two careful details:
- The `slice(0, 500)` on the onChange is a belt-and-braces guard alongside `maxLength={500}` (the latter is HTML-level, the former defends against paste-bypass).
- Using `<Textarea>` from shadcn — already imported by `app/contact/contact-form.tsx` so the component is wired up.

- [ ] **Step 5: Verify the build**

```bash
npm run build
```

Expected: `✓ Compiled successfully` and all 24 pages generated. (The build also validates TypeScript across the whole project, catching any type drift between actions.ts ↔ mailer.ts ↔ checkout-client.tsx.)

- [ ] **Step 6: Commit**

```bash
git add app/checkout/checkout-client.tsx
git commit -m "feat(checkout): add optional delivery-notes textarea between shipping and payment"
```

---

## Task 6: Free-shipping progress bar component

**Files:**
- Create: `app/_components/cart/free-shipping-progress.tsx`
- Modify: `app/_components/cart/cart-summary.tsx` (1 hunk: replace existing inline free-shipping text)

**Why:** Today the cart summary has plain-text "Add LKR X more for free shipping" (line 24–28 of `cart-summary.tsx`). Upgrade to a presentational component with an actual horizontal progress bar so the customer can see their proximity to the threshold at a glance.

- [ ] **Step 1: Create the new component**

Create `app/_components/cart/free-shipping-progress.tsx` with EXACTLY:

```tsx
"use client";

import { Truck } from "lucide-react";
import { formatPrice } from "@/app/_lib/format";
import { FREE_SHIPPING_THRESHOLD } from "@/app/_lib/checkout-config";

type Props = { subtotal: number };

export function FreeShippingProgress({ subtotal }: Props) {
  // Empty cart — no progress bar (a 0% strip would feel like a bug).
  if (subtotal <= 0) return null;

  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        You qualify for free shipping!
      </div>
    );
  }

  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
  const pct = Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  return (
    <div className="mb-4">
      <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Truck className="h-4 w-4 shrink-0" aria-hidden />
        Add <span className="font-semibold text-foreground">{formatPrice(remaining)}</span> more for free shipping
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Free-shipping progress: ${pct}%`}
        />
      </div>
    </div>
  );
}
```

Notes:
- Uses `formatPrice` (already in the project at `app/_lib/format.ts`) and `FREE_SHIPPING_THRESHOLD` (from `app/_lib/checkout-config.ts`).
- `Truck` icon to match the visual language of `checkout-client.tsx`'s shipping section.
- Three states: empty (renders nothing), in-progress (text + bar), qualified (success pill).
- The progress bar uses `role="progressbar"` for accessibility.

- [ ] **Step 2: Wire the component into `cart-summary.tsx`**

Open `app/_components/cart/cart-summary.tsx`. Two changes — add the import and replace the inline free-shipping block.

Find the current import block at the top:

```tsx
"use client";

import Link from "next/link";
import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/app/_lib/format";
import { calculateShipping, FREE_SHIPPING_THRESHOLD } from "@/app/_lib/checkout-config";
```

Replace with:

```tsx
"use client";

import Link from "next/link";
import { useCart } from "@/app/_lib/cart-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/app/_lib/format";
import { calculateShipping, FREE_SHIPPING_THRESHOLD } from "@/app/_lib/checkout-config";
import { FreeShippingProgress } from "@/app/_components/cart/free-shipping-progress";
```

Then find the existing free-shipping text block (currently lines 16–34):

```tsx
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Order Summary</h2>

      <Separator className="my-4" />

      {remainingForFreeShipping > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          Add {formatPrice(remainingForFreeShipping)} more for free shipping
        </p>
      )}

      {subtotal >= FREE_SHIPPING_THRESHOLD && (
        <p className="mb-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          You qualify for free shipping!
        </p>
      )}

      <div className="space-y-2 text-sm">
```

Replace with:

```tsx

  return (
    <div className="rounded-lg border p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Order Summary</h2>

      <Separator className="my-4" />

      <FreeShippingProgress subtotal={subtotal} />

      <div className="space-y-2 text-sm">
```

Three things removed: the `remainingForFreeShipping` local variable (no longer needed — the new component owns that math), the in-progress text-only paragraph, and the qualified-state paragraph. All replaced by `<FreeShippingProgress>`.

- [ ] **Step 3: Remove the now-unused `FREE_SHIPPING_THRESHOLD` import if needed**

Look at the imports of `cart-summary.tsx`. The previous code used `FREE_SHIPPING_THRESHOLD` directly; the new code does not. However, `formatPrice` is still used (in the totals lines below the section we replaced), and `FREE_SHIPPING_THRESHOLD` is no longer referenced.

Update the line:

```tsx
import { calculateShipping, FREE_SHIPPING_THRESHOLD } from "@/app/_lib/checkout-config";
```

To remove the unused import:

```tsx
import { calculateShipping } from "@/app/_lib/checkout-config";
```

If TypeScript / ESLint flags `FREE_SHIPPING_THRESHOLD` as unused on the build, this prevents a lint warning.

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: `✓ Compiled successfully`, all 24 pages generated, no warnings about unused vars.

- [ ] **Step 5: Commit**

```bash
git add app/_components/cart/free-shipping-progress.tsx app/_components/cart/cart-summary.tsx
git commit -m "feat(cart): add free-shipping progress bar with three visual states"
```

---

## Task 7: Push, deploy, smoke-test, promote to production

This task is operational, not a code commit.

- [ ] **Step 1: Push develop**

```bash
git push origin develop
```

This triggers a Preview build on Vercel.

- [ ] **Step 2: Wait for the Preview deploy**

Watch in the Vercel dashboard. The build runs `prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build`. The new `add_order_notes` migration applies to Prisma Postgres during `prisma migrate deploy`. Seed skips because the DB already has data.

If the build fails: paste the failing log into a new conversation and debug. Most likely failure modes are TypeScript errors (caught locally already) or migration application errors (very unlikely for a single nullable column).

- [ ] **Step 3: Smoke-test on the Preview URL**

On the Preview URL Vercel gives you (looks like `ecom-app-<hash>-...vercel.app`):

**Signup callback (E):**
- Add an item to cart, go to `/checkout`
- Click the "Sign in" link in the guest details section. URL becomes `/login?callbackUrl=/checkout`.
- Click "Create account" link at the bottom. URL becomes `/signup?callbackUrl=/checkout`.
- Sign up with a fresh email. After successful signup you should land back on `/checkout` (NOT home).

**Buy Now scroll (B):**
- From the home page or a category page, click "Buy now" on a product card.
- You should land on `/products/<id>?action=buy-now`.
- The page should auto-scroll to the size picker, which briefly flashes a ring outline for ~2 seconds.
- Pick a size, click "Buy now" — checkout opens with that item in the cart.

**Free-shipping progress (I):**
- With cart subtotal under LKR 5000, visit `/cart`. You should see a horizontal progress bar (filled to ~`subtotal/5000` percent) and "Add LKR X more for free shipping" text.
- Add items until subtotal ≥ LKR 5000. The bar should disappear, replaced by a green "You qualify for free shipping!" pill.
- Empty the cart and visit `/cart`. The progress component should not render at all (only the empty-cart state).

**Order notes (G):**
- Place an order. Type a multi-line note like:
  ```
  Leave at security gate.
  Call Sayuri 077-xxx-xxxx 30 min before.
  ```
- Submit the order. Confirmation page shows. Check your email — both text and HTML copies should include a "Delivery Notes" section with line breaks preserved.
- In Prisma Studio, the new order's `notes` column should match what you typed.
- Place another order leaving the notes textarea empty. The new order's `notes` column should be `NULL`, not `""`. The email should not show a Delivery Notes section.
- Try pasting >500 chars into the textarea — should be truncated to 500 client-side. Counter shows `500/500`.

- [ ] **Step 4: Promote to production**

After Preview verification:

```bash
git checkout main
git pull origin main
git merge develop --no-edit
git push origin main
git checkout develop
```

Vercel rebuilds `main`. The migration runs once against Prisma Postgres. The new `notes` column is already there from the Preview deploy (same shared DB), so `prisma migrate deploy` will see the migration as already-applied and skip.

- [ ] **Step 5: Smoke-test production**

Run the same smoke tests on `https://dressingbear.com`. Done.

---

## Self-review checklist (run after writing the plan)

- ✅ **Spec coverage:**
  - E (signup callbackUrl): Task 1
  - B (Buy Now scroll): Task 2
  - G schema (Order.notes column): Task 3
  - G server-side (Zod, persistence, email): Task 4
  - G UI (textarea between sections): Task 5
  - I (free-shipping progress bar): Task 6
  - Push + deploy + verify: Task 7

- ✅ **No placeholders:** every code block contains real code; no "TODO"/"TBD"/"implement later".

- ✅ **Type consistency:**
  - `notes: z.string().trim().max(500).optional()` (T4) ↔ `notes?: string` on `OrderDetails` (T4) ↔ `notes: notes.trim() || undefined` from client (T5) — all consistent.
  - `FreeShippingProgress` props `{ subtotal: number }` (T6 def) ↔ `<FreeShippingProgress subtotal={subtotal} />` (T6 use) — match.
  - `id="size-picker"` (T2 step 3) ↔ `document.getElementById("size-picker")` (T2 step 2) — match.

- ✅ **Verification commands:** every code task ends with `npx tsc --noEmit` or `npm run build`. Operational steps in T7 have explicit user-visible smoke checks.

- ✅ **Migration safety:** Task 3 adds a single nullable column; no backfill needed; no constraint changes; reversible if needed.
