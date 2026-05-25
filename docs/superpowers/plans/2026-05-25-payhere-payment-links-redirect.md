# PayHere Payment Links Redirect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable PayHere payments via redirect-based Payment Links — no SDK needed, more reliable.

**Architecture:** On checkout submit with PayHere, redirect user to PayHere-hosted payment page → PayHere redirects back to success/cancel URL with order details → webhook confirms payment asynchronously.

**Tech Stack:** Next.js App Router API routes, Prisma, PayHere Payment Links API, HMAC-SHA256 webhook verification.

---

## File Map

| File | Role |
|---|---|
| `app/_lib/payhere-config.ts` | **Modify** — remove SDK URL, add Payment Link URL |
| `app/api/payhere/payment/route.ts` | **Modify** — switch from payment ticket to redirect URL generation |
| `app/api/payhere/webhook/route.ts` | **No change needed** — webhook already handles PayHere callbacks |
| `app/checkout/success/page.tsx` | **Modify** — handle payment status from URL params |
| `app/checkout/checkout-client.tsx` | **Modify** — remove SDK loading, use redirect flow |

---

## Task 1: Update PayHere Config — Remove SDK URL

**Files:**
- Modify: `app/_lib/payhere-config.ts`

- [ ] **Step 1: Update the config**

Replace `payHereCheckoutScriptUrl()` and add Payment Link URL helper:

```typescript
// app/_lib/payhere-config.ts

/** PayHere base API URL for creating a payment ticket. */
export function payHereApiUrl(): string {
  return process.env.PAYHERE_MODE === "live"
    ? "https://www.payhere.lk/paycheckout.ps?identifier=payment_ticket"
    : "https://sandbox.payhere.lk/paycheckout.ps?identifier=payment_ticket";
}

/** PayHere Payment Links base URL for redirect-based checkout. */
export function payHerePaymentLinkUrl(): string {
  return process.env.PAYHERE_MODE === "live"
    ? "https://www.payhere.lk/pay"
    : "https://sandbox.payhere.lk/pay";
}

/** Merchant ID from PayHere dashboard. */
export function payHereMerchantId(): string {
  const id = process.env.PAYHERE_MERCHANT_ID;
  if (!id) {
    throw new Error("PAYHERE_MERCHANT_ID must be set in environment");
  }
  return id;
}

/** PayHere app credentials — server-side only. */
export function payHereCredentials(): { app_id: string; app_secret: string } {
  const app_id = process.env.PAYHERE_APP_ID;
  const app_secret = process.env.PAYHERE_APP_SECRET;
  if (!app_id || !app_secret) {
    throw new Error("PAYHERE_APP_ID and PAYHERE_APP_SECRET must be set in environment");
  }
  return { app_id, app_secret };
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit app/_lib/payhere-config.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/_lib/payhere-config.ts
git commit -m "refactor(payhere): remove SDK URL, add Payment Link helper"
```

---

## Task 2: Update Payment Route — Generate Redirect URL

**Files:**
- Modify: `app/api/payhere/payment/route.ts`
- Modify: `.env.local` — add `PAYHERE_MERCHANT_ID`

- [ ] **Step 1: Add merchant ID to .env.local**

Add to the PayHere section:
```env
PAYHERE_MERCHANT_ID="256312"
```

- [ ] **Step 2: Rewrite the payment route**

Replace the payment ticket API with a redirect URL generator:

```typescript
// app/api/payhere/payment/route.ts
import { NextResponse } from "next/server";
import { payHereCredentials, payHereMerchantId, payHerePaymentLinkUrl } from "@/app/_lib/payhere-config";
import { z } from "zod";
import crypto from "crypto";

const PaymentRequestSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.literal("LKR").default("LKR"),
  items: z
    .array(z.object({ name: z.string(), quantity: z.number().int().positive(), amount: z.number().nonnegative() }))
    .default([]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string(),
  }),
  returnUrl: z.string().url().default(`${process.env.APP_URL}/checkout/success`),
  notifyUrl: z.string().url().default(`${process.env.APP_URL}/api/payhere/webhook`),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PaymentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { orderId, amount, currency, items, customer, returnUrl, notifyUrl } = parsed.data;

  const merchantId = payHereMerchantId();
  const { app_secret } = payHereCredentials();
  const baseUrl = payHerePaymentLinkUrl();

  // Build PayHere Payment Link URL with query params
  // PayHere Payment Link format:
  // https://www.payhere.lk/pay/{merchant_id}?xxxxx
  const params = new URLSearchParams({
    _fp_id: merchantId,
    _amount: String(amount),
    _currency: currency,
    _order_id: orderId,
    _items_description: items.length > 0
      ? items.map((it) => `${it.name} x${it.quantity}`).join(", ")
      : "Dressing Bear Order",
    _payer_name: customer.name,
    _payer_email: customer.email,
    _payer_phone: customer.phone,
    _return_url: returnUrl,
    _cancel_url: returnUrl,
    _notify_url: notifyUrl,
  });

  // Generate HMAC-MD5 signature for payment link
  // Signature format: md5(merchant_id + order_id + amount + currency + app_secret)
  const sigString = `${merchantId}${orderId}${amount}${currency}${app_secret}`;
  const signature = crypto.createHash("md5").update(sigString).digest("hex").toUpperCase();
  params.set("_signature", signature);

  const paymentUrl = `${baseUrl}/${merchantId}?${params.toString()}`;

  return NextResponse.json({ paymentUrl });
}
```

> **Note:** The exact query parameter names may vary. PayHere Payment Links typically use `?_fp_id=`, `?_amount=`, etc. or PayHere-specific params like `?business=`, `?item_name=`, etc. Check PayHere docs for the exact Payment Link parameter names. The route is designed to be flexible — adjust based on actual PayHere Payment Link API requirements.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit app/api/payhere/payment/route.ts`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/api/payhere/payment/route.ts .env.local
git commit -m "refactor(payhere): switch to Payment Links redirect flow"
```

---

## Task 3: Update Checkout Client — Remove SDK, Use Redirect

**Files:**
- Modify: `app/checkout/checkout-client.tsx`

- [ ] **Step 1: Remove SDK loading code**

Remove from the `useEffect` that loads the SDK (around lines 60-72):

```typescript
// REMOVE THIS:
const [payhereReady, setPayhereReady] = useState(false);

useEffect(() => {
  if (paymentMethod !== "PAYHERE") return;
  if (typeof window === "undefined") return;
  if ((window as unknown as Record<string, unknown>)["PayHerePayment"]) {
    setPayhereReady(true);
    return;
  }
  const script = document.createElement("script");
  script.src = payHereCheckoutScriptUrl();
  script.onload = () => setPayhereReady(true);
  script.onerror = () => console.error("[checkout] Failed to load PayHere SDK");
  document.head.appendChild(script);
}, [paymentMethod]);
```

Remove the `payHereCheckoutScriptUrl` import if it's no longer needed:
```typescript
// Remove this line:
import { payHereCheckoutScriptUrl } from "@/app/_lib/payhere-config";
```

- [ ] **Step 2: Update handleSubmit for redirect flow**

Replace the PayHere branch in `handleSubmit` (lines 186-223):

```typescript
if (paymentMethod === "PAYHERE") {
  setOrderId(result.orderId);
  setOrderReference(result.webNumber ?? result.orderId);

  // Call /api/payhere/payment to get redirect URL
  try {
    const res = await fetch("/api/payhere/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: result.orderId,
        amount: Math.round(total),
        items: items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          amount: Math.round(it.price * it.quantity),
        })),
        customer: {
          name: isGuest ? guest.name : (user?.name ?? "Customer"),
          email: isGuest ? guest.email : (user?.email ?? ""),
          phone,
        },
      }),
    });

    const data = await res.json();
    if (data.paymentUrl) {
      // Redirect to PayHere payment page
      window.location.href = data.paymentUrl;
      return;
    } else {
      setError("Payment gateway error. Your order is saved. Please contact support.");
    }
  } catch {
    setError("Failed to initialize PayHere. Your order is saved. Please contact support.");
  }
  return;
}
```

- [ ] **Step 3: Update the submit button**

Remove the `payhereReady` check from the disabled condition (line 502):

```typescript
// Before:
disabled={isSubmitting || (paymentMethod === "PAYHERE" && !payhereReady)}

// After:
disabled={isSubmitting}
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit app/checkout/checkout-client.tsx`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/checkout/checkout-client.tsx
git commit -m "refactor(payhere): switch to redirect flow, remove SDK dependency"
```

---

## Task 4: Update Success Page — Handle URL Params

**Files:**
- Modify: `app/checkout/success/page.tsx`

- [ ] **Step 1: Update to read orderId and status from URL**

```typescript
// app/checkout/success/page.tsx
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShoppingBag, Truck, CheckCircle } from "lucide-react";
import { prisma } from "@/app/_lib/prisma";
import { orderReference } from "@/app/_lib/order-reference";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { formatPrice } from "@/app/_lib/format";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ProfileMenu } from "@/app/_components/header/profile-menu";

async function OrderDetails({ orderId, paymentStatus }: { orderId: string; paymentStatus?: string }) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) return notFound();

  const ref = orderReference(order);
  // Use URL param status if provided, otherwise check DB
  const isPaid = paymentStatus === "COMPLETED" || order.paymentStatus === "PAID";
  const isCod = order.paymentMethod === "COD";

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        {/* Icon */}
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
          isPaid || isCod ? "bg-green-100" : "bg-yellow-100"
        }`}>
          {isPaid || isCod ? (
            <CheckCircle className="h-10 w-10 text-green-600" />
          ) : (
            <ShoppingBag className="h-10 w-10 text-yellow-600" />
          )}
        </div>

        {/* Heading */}
        {isPaid ? (
          <>
            <h1 className="text-3xl font-bold mb-3">Payment Confirmed!</h1>
            <p className="text-muted-foreground text-lg mb-2">
              Thank you for your order. Your payment has been received.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-3">Order Placed!</h1>
            <p className="text-muted-foreground text-lg mb-2">
              Your order is confirmed and awaiting payment.
            </p>
          </>
        )}

        {/* Order reference */}
        <div className="bg-muted rounded-lg p-4 mb-8 inline-block">
          <p className="text-sm text-muted-foreground mb-1">Order Reference</p>
          <p className="text-2xl font-bold font-mono">{ref}</p>
        </div>

        {/* Items summary */}
        <div className="bg-card border rounded-xl p-6 mb-8 text-left">
          <h2 className="font-semibold mb-4">Items Ordered</h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-sm">
                <span>
                  {item.name}
                  {item.size ? ` (${item.size})` : ""} × {item.quantity}
                </span>
                <span className="font-medium">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-4 pt-4 flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 py-2"
        >
          Continue Shopping
        </Link>
      </div>
    </main>
  );
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string; status?: string }>;
}) {
  const params = await searchParams;
  const orderId = params.order_id;

  if (!orderId) {
    return (
      <main className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Order</h1>
          <p className="text-muted-foreground mb-6">No order ID provided.</p>
          <Link href="/" className="text-primary hover:underline">Return to Home</Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Dressing Bear
          </Link>
          <div className="ml-auto">
            <ProfileMenu />
          </div>
        </div>
      </header>
      <Suspense fallback={
        <main className="flex-1 flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading order details...</p>
        </main>
      }>
        <OrderDetails orderId={orderId} paymentStatus={params.status} />
      </Suspense>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/checkout/success/page.tsx
git commit -m "feat(checkout): handle PayHere redirect params on success page"
```

---

## Task 5: Build Verification

- [ ] **Step 1: Run the full build**

Run: `npm run build`
Expected: SUCCESS — no TypeScript errors, no build failures

- [ ] **Step 2: Commit build-clean state**

```bash
git add -A && git commit -m "chore: verify build passes after PayHere redirect integration"
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| Payment via redirect (no SDK) | Task 1, 2, 3 |
| Payment ticket API route | Task 2 |
| Webhook handler (unchanged) | Already exists |
| Success page with payment status | Task 4 |
| Build verification | Task 5 |
| Sandbox vs Live mode | Task 1 (payhere-config.ts) |
| Merchant ID config | Task 2 (added to .env.local) |

---

## PayHere Payment Link URL Format Reference

Based on PayHere Payment Links (redirect-based), the URL format is typically:

```
https://www.payhere.lk/pay/{merchant_id}?
  _fp_id={merchant_id}&
  _amount={amount}&
  _currency={currency}&
  _order_id={order_id}&
  _items_description={description}&
  _payer_name={name}&
  _payer_email={email}&
  _payer_phone={phone}&
  _return_url={return_url}&
  _cancel_url={cancel_url}&
  _notify_url={notify_url}&
  _signature={md5_hash}
```

**Verify exact parameter names** with PayHere documentation or support, as they may differ from the proposed names above.