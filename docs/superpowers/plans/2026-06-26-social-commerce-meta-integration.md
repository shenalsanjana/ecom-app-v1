# Social Commerce & Meta Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dressing Bear products promotable and sellable on Facebook/Instagram — share buttons, rich link previews, a browser Meta Pixel with funnel events, and a CSV catalog feed — without touching the existing checkout, payment, courier, or order logic.

**Architecture:** Everything is additive. A small env-gated `meta-pixel` client module wraps `window.fbq`; feature components call its typed helpers at user-initiated funnel points. Open Graph tags are enriched in the existing `generateMetadata`, a JSON-LD `<script>` is added to the product page, share buttons mount in the buy box, and a new Route Handler serves the catalog CSV. When `NEXT_PUBLIC_META_PIXEL_ID` is unset, `window.fbq` is never loaded, so every tracking call is a silent no-op and the site behaves exactly as today.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma/PostgreSQL, `next/script`, Vitest (node env, `globals: false`), Playwright.

**Reference spec:** `docs/superpowers/specs/2026-06-26-social-commerce-meta-integration-design.md`

## Global Constraints

- **No DB schema changes** (`prisma/schema.prisma` untouched).
- **No payment provider changes** (PayHere / Koko / MintPay / COD untouched).
- **No courier flow changes** (Royal Express / Curfox untouched).
- **No Server Action changes** unless strictly needed (`app/checkout/actions.ts` should not change).
- **`NEXT_PUBLIC_META_PIXEL_ID` is optional**; when unset/empty, all Pixel behaviour no-ops and the build never breaks.
- **Currency is `LKR`** for every Pixel `value` and every feed price.
- **Core invariant:** the same `product.id` is used as Pixel `content_ids`, JSON-LD `sku`, and feed `id` — everywhere.
- **Existing checkout/order e2e tests must stay green** (`tests/e2e/order-confirmation.spec.ts`, `tests/e2e/payhere-*.spec.ts`).
- Vitest unit tests are **`.ts` only** (node env), placed in `app/_lib/__tests__/`; import `{ describe, it, expect, vi }` explicitly (no globals). UI behaviour is covered by Playwright e2e, not Vitest.
- Absolute URLs everywhere come from the **shared `absoluteUrl()` helper** (Task 1) — never hand-built.
- Conventional Commits; commit at the end of each task.

> **Test placement note:** Pure-logic helpers (Tasks 1 and 8) are built test-first with co-located Vitest unit tests — that is their TDD cycle. UI wiring (Tasks 2–7) and the feed route (Task 8's handler) are verified by the Playwright e2e suite in **Task 10**, since `.tsx`/route behaviour is out of scope for the node-env Vitest setup. Task 11 runs the full existing suite to confirm no regressions.

---

### Task 1: Shared helpers — `absoluteUrl` + `meta-pixel` module

**Files:**
- Create: `app/_lib/absolute-url.ts`
- Create: `app/_lib/meta-pixel.ts`
- Test: `app/_lib/__tests__/absolute-url.test.ts`
- Test: `app/_lib/__tests__/meta-pixel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `absoluteUrl(path: string): string` — joins `APP_URL` (env, default `http://localhost:3000`) with `path`, exactly one slash between.
  - `pixelId(): string | undefined` — returns `process.env.NEXT_PUBLIC_META_PIXEL_ID` when non-empty, else `undefined`.
  - `isPixelConfigured(): boolean` — `!!pixelId()`; used only to decide whether the base script renders.
  - `track(event: MetaEvent, payload?: Record<string, unknown>, options?: { eventID?: string }): void` — calls `window.fbq('track', event, payload, options)` only when `window.fbq` is a function; wrapped in try/catch.
  - `trackViewContent(productId: string, value: number): void`
  - `trackAddToCart(productId: string, value: number, quantity: number): void`
  - `trackInitiateCheckout(contentIds: string[], value: number, numItems: number): void`
  - `trackPurchaseOnce(orderId: string, value: number, contentIds: string[]): void` — fires `Purchase` (with `eventID: orderId`) at most once per `orderId`, guarded by a `localStorage` set under `PURCHASE_DEDUPE_KEY`.
  - `type MetaEvent = 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'`
  - `const PURCHASE_DEDUPE_KEY = 'db-purchase-tracked'`

- [ ] **Step 1: Write the failing test for `absoluteUrl`**

Create `app/_lib/__tests__/absolute-url.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("absoluteUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("APP_URL", "https://dressingbear.example");
  });

  it("joins base and path with exactly one slash", async () => {
    const { absoluteUrl } = await import("@/app/_lib/absolute-url");
    expect(absoluteUrl("/products/p1")).toBe("https://dressingbear.example/products/p1");
  });

  it("handles a path without a leading slash", async () => {
    const { absoluteUrl } = await import("@/app/_lib/absolute-url");
    expect(absoluteUrl("feed/meta-catalog.csv")).toBe("https://dressingbear.example/feed/meta-catalog.csv");
  });

  it("does not double the slash when base has a trailing slash", async () => {
    vi.stubEnv("APP_URL", "https://dressingbear.example/");
    const { absoluteUrl } = await import("@/app/_lib/absolute-url");
    expect(absoluteUrl("/products/p1")).toBe("https://dressingbear.example/products/p1");
  });

  it("falls back to localhost when APP_URL is unset", async () => {
    vi.stubEnv("APP_URL", "");
    const { absoluteUrl } = await import("@/app/_lib/absolute-url");
    expect(absoluteUrl("/x")).toBe("http://localhost:3000/x");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- absolute-url`
Expected: FAIL — cannot resolve `@/app/_lib/absolute-url`.

- [ ] **Step 3: Implement `absoluteUrl`**

Create `app/_lib/absolute-url.ts`:

```ts
// app/_lib/absolute-url.ts
// Single source of truth for canonical absolute URLs (OG images, feed links,
// share URLs, JSON-LD). Mirrors the APP_URL default used in app/layout.tsx.
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export function absoluteUrl(path: string): string {
  const base = APP_URL.replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${base}${rel}`;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- absolute-url`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for `meta-pixel`**

Create `app/_lib/__tests__/meta-pixel.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type FbqCall = unknown[];

function installWindow(withFbq: boolean) {
  const calls: FbqCall[] = [];
  const store = new Map<string, string>();
  const fbq = withFbq ? vi.fn((...args: FbqCall) => calls.push(args)) : undefined;
  (globalThis as Record<string, unknown>).window = {
    fbq,
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
  return { calls };
}

describe("meta-pixel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it("pixelId returns undefined when env is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    const m = await import("@/app/_lib/meta-pixel");
    expect(m.pixelId()).toBeUndefined();
    expect(m.isPixelConfigured()).toBe(false);
  });

  it("pixelId returns the id and isPixelConfigured is true when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456");
    const m = await import("@/app/_lib/meta-pixel");
    expect(m.pixelId()).toBe("123456");
    expect(m.isPixelConfigured()).toBe(true);
  });

  it("track no-ops when window.fbq is absent", async () => {
    installWindow(false);
    const m = await import("@/app/_lib/meta-pixel");
    expect(() => m.track("ViewContent", { value: 1 })).not.toThrow();
  });

  it("track calls fbq with event and payload when fbq exists", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackViewContent("p1", 1990);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("track");
    expect(calls[0][1]).toBe("ViewContent");
    expect(calls[0][2]).toMatchObject({
      content_ids: ["p1"],
      content_type: "product",
      value: 1990,
      currency: "LKR",
    });
  });

  it("trackAddToCart sends value, num_items and content_ids", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackAddToCart("p2", 3980, 2);
    expect(calls[0][1]).toBe("AddToCart");
    expect(calls[0][2]).toMatchObject({ content_ids: ["p2"], value: 3980, num_items: 2 });
  });

  it("trackPurchaseOnce fires once per order id and passes eventID", async () => {
    const { calls } = installWindow(true);
    const m = await import("@/app/_lib/meta-pixel");
    m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]);
    m.trackPurchaseOnce("order-1", 5000, ["p1", "p2"]); // duplicate — must be skipped
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe("Purchase");
    expect(calls[0][2]).toMatchObject({ content_ids: ["p1", "p2"], value: 5000, currency: "LKR" });
    expect(calls[0][3]).toMatchObject({ eventID: "order-1" });
  });

  it("trackPurchaseOnce no-ops entirely when fbq is absent (no throw)", async () => {
    installWindow(false);
    const m = await import("@/app/_lib/meta-pixel");
    expect(() => m.trackPurchaseOnce("order-2", 1, ["p1"])).not.toThrow();
  });
});
```

- [ ] **Step 6: Run the test, verify it fails**

Run: `npm test -- meta-pixel`
Expected: FAIL — cannot resolve `@/app/_lib/meta-pixel`.

- [ ] **Step 7: Implement `meta-pixel`**

Create `app/_lib/meta-pixel.ts`:

```ts
// app/_lib/meta-pixel.ts
// Client-only wrapper around the Meta Pixel global (window.fbq). The single
// source of truth for whether tracking is active. Every call is a no-op unless
// the base script has loaded window.fbq — which only happens when
// NEXT_PUBLIC_META_PIXEL_ID is set (see MetaPixelScript). No component reads the
// env var or touches window.fbq directly.

export type MetaEvent =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

export const PURCHASE_DEDUPE_KEY = "db-purchase-tracked";
const CURRENCY = "LKR" as const;

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

export function pixelId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return id && id.length > 0 ? id : undefined;
}

export function isPixelConfigured(): boolean {
  return Boolean(pixelId());
}

function fbq(): Fbq | undefined {
  if (typeof window === "undefined") return undefined;
  return typeof window.fbq === "function" ? window.fbq : undefined;
}

export function track(
  event: MetaEvent,
  payload?: Record<string, unknown>,
  options?: { eventID?: string },
): void {
  const f = fbq();
  if (!f) return;
  try {
    if (options) f("track", event, payload ?? {}, options);
    else f("track", event, payload ?? {});
  } catch {
    // Pixel must never break the page.
  }
}

function content(productIds: string[], value: number, extra?: Record<string, unknown>) {
  return {
    content_ids: productIds,
    content_type: "product",
    value,
    currency: CURRENCY,
    ...extra,
  };
}

export function trackViewContent(productId: string, value: number): void {
  track("ViewContent", content([productId], value));
}

export function trackAddToCart(productId: string, value: number, quantity: number): void {
  track("AddToCart", content([productId], value, { num_items: quantity }));
}

export function trackInitiateCheckout(
  contentIds: string[],
  value: number,
  numItems: number,
): void {
  track("InitiateCheckout", content(contentIds, value, { num_items: numItems }));
}

export function trackPurchaseOnce(
  orderId: string,
  value: number,
  contentIds: string[],
): void {
  const f = fbq();
  if (!f || typeof window === "undefined") return;

  // Dedupe: browser Pixel does not auto-dedupe repeated browser fires, and the
  // success page is revisitable (refresh / back-nav). Record fired order ids.
  let fired: string[] = [];
  try {
    const raw = window.localStorage?.getItem(PURCHASE_DEDUPE_KEY);
    if (raw) fired = JSON.parse(raw) as string[];
  } catch {
    fired = [];
  }
  if (fired.includes(orderId)) return;

  track("Purchase", content(contentIds, value), { eventID: orderId });

  try {
    window.localStorage?.setItem(PURCHASE_DEDUPE_KEY, JSON.stringify([...fired, orderId]));
  } catch {
    // Storage unavailable — event already fired; acceptable.
  }
}
```

- [ ] **Step 8: Run both test files, verify they pass**

Run: `npm test -- absolute-url meta-pixel`
Expected: PASS (all tests in both files).

- [ ] **Step 9: Commit**

```bash
git add app/_lib/absolute-url.ts app/_lib/meta-pixel.ts app/_lib/__tests__/absolute-url.test.ts app/_lib/__tests__/meta-pixel.test.ts
git commit -m "feat(meta): add absoluteUrl helper and env-gated meta-pixel module"
```

---

### Task 2: Base Pixel script + PageView on navigation

**Files:**
- Create: `app/_components/analytics/meta-pixel-script.tsx`
- Modify: `app/layout.tsx` (add `<MetaPixelScript />` in `<body>`)

**Interfaces:**
- Consumes: `isPixelConfigured`, `pixelId`, `track` from `@/app/_lib/meta-pixel` (Task 1).
- Produces: `<MetaPixelScript />` — renders the Meta base code via `next/script` and fires `PageView` on App-Router path changes; renders `null` when the Pixel is not configured.

- [ ] **Step 1: Create the component**

Create `app/_components/analytics/meta-pixel-script.tsx`:

```tsx
"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isPixelConfigured, pixelId, track } from "@/app/_lib/meta-pixel";

// Loads the Meta Pixel base code once and fires PageView on client navigations.
// Renders nothing when NEXT_PUBLIC_META_PIXEL_ID is unset — the site then
// behaves exactly as before (no fbq global, every track() call no-ops).
export function MetaPixelScript() {
  const id = pixelId();
  const pathname = usePathname();
  const firstRun = useRef(true);

  // The Meta base snippet fires the initial PageView itself. App Router client
  // navigations don't reload the page, so fire PageView on subsequent path
  // changes only (skip the first effect run to avoid double-counting load).
  useEffect(() => {
    if (!isPixelConfigured()) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    track("PageView");
  }, [pathname]);

  if (!id) return null;

  return (
    <Script id="meta-pixel-base" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${id}');
        fbq('track', 'PageView');
      `}
    </Script>
  );
}
```

- [ ] **Step 2: Mount it in the root layout**

In `app/layout.tsx`, add the import near the other `_components` imports:

```tsx
import { MetaPixelScript } from "@/app/_components/analytics/meta-pixel-script";
```

Then render it inside `<body>`, immediately after the opening tag (before `<NavigationProgress />`'s `<Suspense>`):

```tsx
      <body className="min-h-full flex flex-col">
        <MetaPixelScript />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
```

- [ ] **Step 3: Verify the build compiles and the site is unchanged when unset**

Run: `npm run build`
Expected: build succeeds. (Without `NEXT_PUBLIC_META_PIXEL_ID`, `MetaPixelScript` renders `null`.)

> If `npm run build` is blocked locally by `DATABASE_URL` (known env constraint), run `npx tsc --noEmit` instead to typecheck, and note the build was env-blocked.

- [ ] **Step 4: Commit**

```bash
git add app/_components/analytics/meta-pixel-script.tsx app/layout.tsx
git commit -m "feat(meta): load Pixel base code and track PageView on navigation"
```

---

### Task 3: ViewContent + AddToCart tracking

**Files:**
- Modify: `app/_components/product/buy-box-client.tsx` (ViewContent on mount; AddToCart in `handleBuyNow`)
- Modify: `app/_components/cart/add-to-cart-button.tsx` (AddToCart in `handleAdd`)
- Modify: `app/_components/cart/add-to-cart-dialog.tsx` (AddToCart in `handleAdd` and `handleBuyNow`)

**Interfaces:**
- Consumes: `trackViewContent`, `trackAddToCart` from `@/app/_lib/meta-pixel` (Task 1).
- Produces: no new exports — fires `ViewContent` once per product page view and `AddToCart` at every explicit user add (value = `price * quantity`, `quantity` defaults to 1 in the dialog).

- [ ] **Step 1: ViewContent in `buy-box-client.tsx`**

Add the import:

```tsx
import { trackViewContent, trackAddToCart } from "@/app/_lib/meta-pixel";
```

Add an effect near the top of the component body (after the existing `useState`/`useMemo` hooks, before the existing `useEffect` for `buyNowIntent`):

```tsx
  // Fire ViewContent once per product when the buy box mounts.
  useEffect(() => {
    trackViewContent(productId, price);
  }, [productId, price]);
```

- [ ] **Step 2: AddToCart in `buy-box-client.tsx` `handleBuyNow`**

In `handleBuyNow`, after the existing `addItem(...)` call, add the tracking call:

```tsx
  function handleBuyNow() {
    if (sizeList.length > 0 && !selectedSize) {
      nudgeSizePicker();
      return;
    }
    setIsBuying(true);
    addItem({ productId, name, price, image, size: selectedSize || null }, quantity);
    trackAddToCart(productId, price * quantity, quantity);
    router.push("/checkout");
  }
```

- [ ] **Step 3: AddToCart in `add-to-cart-button.tsx`**

Add the import:

```tsx
import { trackAddToCart } from "@/app/_lib/meta-pixel";
```

In `handleAdd`, after `addItem(...)`:

```tsx
  function handleAdd() {
    if (sizeMissing) return;
    addItem({ productId, name, price, image, size }, quantity);
    trackAddToCart(productId, price * quantity, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }
```

- [ ] **Step 4: AddToCart in `add-to-cart-dialog.tsx`**

Add the import:

```tsx
import { trackAddToCart } from "@/app/_lib/meta-pixel";
```

In both `handleAdd` and `handleBuyNow`, after each `addItem(...)` call (quantity is 1 here):

```tsx
    addItem({ productId, name, price, image, size: selectedSize || null }, 1);
    trackAddToCart(productId, price, 1);
```

- [ ] **Step 5: Verify typecheck/build**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/_components/product/buy-box-client.tsx app/_components/cart/add-to-cart-button.tsx app/_components/cart/add-to-cart-dialog.tsx
git commit -m "feat(meta): track ViewContent and AddToCart at product/add points"
```

---

### Task 4: InitiateCheckout tracking

**Files:**
- Modify: `app/checkout/checkout-client.tsx` (fire `InitiateCheckout` once when the checkout form mounts with items)

**Interfaces:**
- Consumes: `trackInitiateCheckout` from `@/app/_lib/meta-pixel` (Task 1).
- Produces: fires `InitiateCheckout` once per checkout session with `content_ids` = cart product ids, `value` = subtotal, `num_items` = total quantity.

- [ ] **Step 1: Add the import and a fired-once ref + effect**

In `app/checkout/checkout-client.tsx`, add the import alongside the existing imports:

```tsx
import { trackInitiateCheckout } from "@/app/_lib/meta-pixel";
```

Add a ref with the other `useState`/`useMemo` hooks near the top of the component (hooks must run before the early returns at `if (orderId)` / `if (items.length === 0)`):

```tsx
  const initiateCheckoutFired = useRef(false);
```

(Ensure `useRef` is imported from `react` — extend the existing `import { useMemo, useState } from "react";` to `import { useMemo, useRef, useState, useEffect } from "react";`.)

Add the effect immediately after the `total` calculation (`const total = subtotal + shipping;`), still above the early returns:

```tsx
  // Fire InitiateCheckout once, when the checkout form first has items. Guarded
  // by a ref so cart hydration / re-renders don't refire it.
  useEffect(() => {
    if (initiateCheckoutFired.current) return;
    if (items.length === 0) return;
    initiateCheckoutFired.current = true;
    trackInitiateCheckout(items.map((i) => i.productId), subtotal, items.reduce((n, i) => n + i.quantity, 0));
  }, [items, subtotal]);
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/checkout/checkout-client.tsx
git commit -m "feat(meta): track InitiateCheckout on checkout form mount"
```

---

### Task 5: Purchase tracking (COD inline + online success), with dedupe

**Files:**
- Create: `app/checkout/success/track-purchase.tsx`
- Modify: `app/checkout/checkout-client.tsx` (fire `trackPurchaseOnce` on COD inline success)
- Modify: `app/checkout/success/page.tsx` (render `<TrackPurchase>` inside `OrderDetails`)

**Interfaces:**
- Consumes: `trackPurchaseOnce` from `@/app/_lib/meta-pixel` (Task 1); the existing `checkoutPaymentState` already used in `success/page.tsx`.
- Produces: `<TrackPurchase orderId={string} value={number} contentIds={string[]} confirmed={boolean} />` — a leaf client component that calls `trackPurchaseOnce` from an effect when `confirmed` is true.

**Background:** COD never navigates to `/checkout/success` — `CheckoutClient` shows an inline "Order Confirmed!" view (`if (orderId)` block) and clears the cart in `handleSubmit`. Online payments redirect through the gateway and return to `/checkout/success`. Both paths call the same `trackPurchaseOnce` (Task 1) which dedupes by order id, so a shared order can never double-count.

- [ ] **Step 1: Fire Purchase on COD inline success (`checkout-client.tsx`)**

In `handleSubmit`, the COD branch currently is:

```tsx
        // COD: clear cart and show success immediately
        clearCart();
        setOrderId(result.orderId);
        setOrderReference(result.webNumber ?? result.orderId);
```

Capture the cart contents and value **before** `clearCart()` empties them, then fire the event after state is set:

```tsx
        // COD: capture purchase data BEFORE clearing the cart, then track.
        const purchaseContentIds = items.map((i) => i.productId);
        const purchaseValue = total;
        clearCart();
        setOrderId(result.orderId);
        setOrderReference(result.webNumber ?? result.orderId);
        trackPurchaseOnce(result.orderId, purchaseValue, purchaseContentIds);
```

Add the import:

```tsx
import { trackInitiateCheckout, trackPurchaseOnce } from "@/app/_lib/meta-pixel";
```

(Merge with the Task 4 import line so there is a single `meta-pixel` import.)

- [ ] **Step 2: Create the `<TrackPurchase>` component**

Create `app/checkout/success/track-purchase.tsx`:

```tsx
"use client";

// Fires the Meta Pixel Purchase event from the online-payment success page.
// Mirrors ClearCartOnPaid: it is a leaf client component nested inside the
// server-rendered OrderDetails, so when PaymentStatusPoll calls router.refresh()
// and `confirmed` flips to true, this re-renders and fires. Dedupe (by order id)
// lives in trackPurchaseOnce, so refresh / back-nav never double-count.
import { useEffect } from "react";
import { trackPurchaseOnce } from "@/app/_lib/meta-pixel";

export function TrackPurchase({
  orderId,
  value,
  contentIds,
  confirmed,
}: {
  orderId: string;
  value: number;
  contentIds: string[];
  confirmed: boolean;
}) {
  useEffect(() => {
    if (!confirmed) return;
    trackPurchaseOnce(orderId, value, contentIds);
  }, [confirmed, orderId, value, contentIds]);

  return null;
}
```

- [ ] **Step 3: Render `<TrackPurchase>` in `success/page.tsx`**

In `app/checkout/success/page.tsx`, add the import beside the existing `ClearCartOnPaid` import:

```tsx
import { TrackPurchase } from "./track-purchase";
```

Inside `OrderDetails`, the `isPaid`/`isCod`/`isCancelled` values are already computed. Render `<TrackPurchase>` right next to the existing `<ClearCartOnPaid .../>`:

```tsx
      <ClearCartOnPaid shouldClear={!isCancelled} />
      <TrackPurchase
        orderId={order.id}
        value={order.total}
        contentIds={order.items.map((i) => i.productId)}
        confirmed={isPaid || isCod}
      />
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/success/track-purchase.tsx app/checkout/success/page.tsx app/checkout/checkout-client.tsx
git commit -m "feat(meta): track Purchase for COD inline and online success, deduped"
```

---

### Task 6: OG price-in-title + Product JSON-LD

**Files:**
- Create: `app/_components/product/product-jsonld.tsx`
- Modify: `app/products/[id]/page.tsx` (`generateMetadata` title/images; render `<ProductJsonLd>`)

**Interfaces:**
- Consumes: `absoluteUrl` (Task 1); existing `formatPrice`, `stripMarkdown`, `getProductDetail`.
- Produces: `<ProductJsonLd product={...} ratingAvg={number} ratingCount={number} />` — renders a `<script type="application/ld+json">` with a `Product` + `Offer` (+ `AggregateRating` when `ratingCount > 0`).

- [ ] **Step 1: Enrich `generateMetadata`**

In `app/products/[id]/page.tsx`, add the import:

```tsx
import { formatPrice } from "@/app/_lib/format";
import { absoluteUrl } from "@/app/_lib/absolute-url";
```

Replace the existing `generateMetadata` return with a price-in-title version and richer images:

```tsx
  const priceTitle = `${detail.product.name} — ${formatPrice(detail.product.price)}`;
  const description = stripMarkdown(detail.product.description);
  const imageUrl = absoluteUrl(detail.product.image);
  return {
    title: { absolute: `${priceTitle} | Dressing Bear` },
    description,
    openGraph: {
      title: priceTitle,
      description,
      images: [{ url: imageUrl, width: 1200, height: 1200, alt: detail.product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: priceTitle,
      description,
      images: [imageUrl],
    },
  };
```

(The `title.absolute` form is used so the price-bearing title is not also run through the layout's `"%s | Dressing Bear"` template, which would duplicate the brand.)

- [ ] **Step 2: Create `<ProductJsonLd>`**

Create `app/_components/product/product-jsonld.tsx`:

```tsx
import type { Product } from "@prisma/client";
import { absoluteUrl } from "@/app/_lib/absolute-url";
import { stripMarkdown } from "@/app/_lib/strip-markdown";

// Emits Product JSON-LD for the product detail page. Helps Meta catalog
// matching plus Google/Pinterest rich results. Uses the same absolute-URL
// helper as the feed and share buttons so canonical URLs agree everywhere.
export function ProductJsonLd({
  product,
  ratingAvg,
  ratingCount,
}: {
  product: Pick<Product, "id" | "name" | "description" | "price" | "image" | "stock">;
  ratingAvg: number;
  ratingCount: number;
}) {
  const json: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: absoluteUrl(product.image),
    description: stripMarkdown(product.description, 5000),
    sku: product.id,
    mpn: product.id,
    brand: { "@type": "Brand", name: "Dressing Bear" },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/products/${product.id}`),
      priceCurrency: "LKR",
      price: product.price.toFixed(2),
      availability: product.stock > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  if (ratingCount > 0) {
    json.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: ratingAvg.toFixed(1),
      reviewCount: ratingCount,
    };
  }

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inline; escape `<` defensively.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  );
}
```

- [ ] **Step 3: Render `<ProductJsonLd>` on the product page**

In `app/products/[id]/page.tsx`, add the import:

```tsx
import { ProductJsonLd } from "@/app/_components/product/product-jsonld";
```

Render it at the top of the returned JSX, just inside the fragment (before `<SiteHeader />`):

```tsx
    <>
      <ProductJsonLd
        product={detail.product}
        ratingAvg={detail.ratingAvg}
        ratingCount={detail.ratingCount}
      />
      <SiteHeader />
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/products/[id]/page.tsx app/_components/product/product-jsonld.tsx
git commit -m "feat(seo): price-in-title OG tags and Product JSON-LD on product page"
```

---

### Task 7: Share buttons

**Files:**
- Create: `app/_components/product/share-buttons.tsx`
- Modify: `app/_components/product/buy-box-client.tsx` (render `<ShareButtons>`)

**Interfaces:**
- Consumes: `absoluteUrl` (Task 1); existing `Button` from `@/components/ui/button`; `sonner` `toast` (already a dependency).
- Produces: `<ShareButtons productId={string} name={string} price={number} />` — Native share (when supported) + Facebook, WhatsApp, Copy-link.

- [ ] **Step 1: Create the component**

Create `app/_components/product/share-buttons.tsx`:

```tsx
"use client";

import { useState } from "react";
// NOTE: lucide-react v1 removed the `Facebook` brand glyph, so we inline a tiny
// Facebook SVG below. WhatsApp uses MessageCircle (lucide has no brand glyph).
// No sonner toast here: the storefront root layout has no <Toaster /> and adding
// one would double up with the admin layout's Toaster. The inline "Copied" button
// state is the feedback (and what the e2e asserts).
import { Share2, MessageCircle, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { absoluteUrl } from "@/app/_lib/absolute-url";
import { formatPrice } from "@/app/_lib/format";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z" />
    </svg>
  );
}

// Product share row: native Web Share sheet (mobile — exposes Instagram,
// Messenger, etc.) plus explicit Facebook / WhatsApp / Copy-link buttons that
// work on every device. Instagram has no web share-link URL, so it is reachable
// only through the native sheet — there is intentionally no IG button.
export function ShareButtons({
  productId,
  name,
  price,
}: {
  productId: string;
  name: string;
  price: number;
}) {
  const url = absoluteUrl(`/products/${productId}`);
  const shareTitle = `${name} — ${formatPrice(price)}`;
  const [copied, setCopied] = useState(false);

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function nativeShare() {
    try {
      await navigator.share({ title: shareTitle, text: shareTitle, url });
    } catch {
      // User dismissed the sheet — no-op.
    }
  }

  function openPopup(href: string) {
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=600");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied) — silently no-op.
    }
  }

  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${url}`)}`;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share this product">
      {canNativeShare && (
        <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={nativeShare}>
          <Share2 className="h-4 w-4" aria-hidden /> Share
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2"
        aria-label="Share on Facebook"
        onClick={() => openPopup(fbHref)}
      >
        <FacebookIcon className="h-4 w-4" /> Facebook
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2"
        aria-label="Share on WhatsApp"
        onClick={() => openPopup(waHref)}
      >
        <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2"
        aria-label="Copy product link"
        data-testid="copy-link"
        onClick={copyLink}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
```

> **No Toaster dependency:** copy feedback is the inline "Copied" button state only — no `sonner` toast — so this task touches no layout and can't double up with the admin Toaster.

- [ ] **Step 2: Render `<ShareButtons>` in the buy box**

In `app/_components/product/buy-box-client.tsx`, add the import:

```tsx
import { ShareButtons } from "@/app/_components/product/share-buttons";
```

Render it below the trust list (`<ul>...Secure checkout...</ul>`), still inside the main buy-box `<div className="space-y-5 ...">`:

```tsx
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Share</p>
        <ShareButtons productId={productId} name={name} price={price} />
      </div>
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/_components/product/share-buttons.tsx app/_components/product/buy-box-client.tsx
git commit -m "feat(social): add product share buttons (native + FB/WhatsApp/copy)"
```

---

### Task 8: CSV catalog feed

**Files:**
- Create: `app/_lib/meta-feed.ts` (pure mapping + CSV serialization)
- Create: `app/feed/meta-catalog.csv/route.ts` (Route Handler)
- Test: `app/_lib/__tests__/meta-feed.test.ts`

**Interfaces:**
- Consumes: `absoluteUrl` (Task 1); Prisma `prisma.product` (route only).
- Produces:
  - `type FeedProduct = { id: string; name: string; description: string; price: number; originalPrice: number | null; stock: number; image: string; archived: boolean }`
  - `productToFeedRow(p: FeedProduct): FeedRow`
  - `feedRowsToCsv(rows: FeedRow[]): string`
  - `FEED_COLUMNS: readonly string[]`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/meta-feed.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const base = "https://dressingbear.example";

function p(overrides: Partial<import("@/app/_lib/meta-feed").FeedProduct> = {}) {
  return {
    id: "p1",
    name: "Oversize Bear Tee",
    description: "Soft, heavy cotton.",
    price: 1990,
    originalPrice: null,
    stock: 5,
    image: "/products/p1/main.jpg",
    archived: false,
    ...overrides,
  };
}

describe("meta-feed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("APP_URL", base);
  });

  it("maps a regular (not-on-sale) product: price set, sale_price empty", async () => {
    const { productToFeedRow } = await import("@/app/_lib/meta-feed");
    const row = productToFeedRow(p());
    expect(row.id).toBe("p1");
    expect(row.price).toBe("1990.00 LKR");
    expect(row.sale_price).toBe("");
    expect(row.availability).toBe("in stock");
    expect(row.condition).toBe("new");
    expect(row.brand).toBe("Dressing Bear");
    expect(row.link).toBe(`${base}/products/p1`);
    expect(row.image_link).toBe(`${base}/products/p1/main.jpg`);
    expect(row.item_group_id).toBe("p1");
  });

  it("inverts price mapping on sale: price=originalPrice, sale_price=price", async () => {
    const { productToFeedRow } = await import("@/app/_lib/meta-feed");
    const row = productToFeedRow(p({ price: 1490, originalPrice: 1990 }));
    expect(row.price).toBe("1990.00 LKR");
    expect(row.sale_price).toBe("1490.00 LKR");
  });

  it("treats originalPrice <= price as not on sale", async () => {
    const { productToFeedRow } = await import("@/app/_lib/meta-feed");
    const row = productToFeedRow(p({ price: 1990, originalPrice: 1990 }));
    expect(row.price).toBe("1990.00 LKR");
    expect(row.sale_price).toBe("");
  });

  it("marks availability out of stock when stock is 0", async () => {
    const { productToFeedRow } = await import("@/app/_lib/meta-feed");
    expect(productToFeedRow(p({ stock: 0 })).availability).toBe("out of stock");
  });

  it("serializes rows to CSV with a header and quoted, escaped fields", async () => {
    const { productToFeedRow, feedRowsToCsv, FEED_COLUMNS } = await import("@/app/_lib/meta-feed");
    const csv = feedRowsToCsv([
      productToFeedRow(p({ description: 'He said "hi"\nthen left', name: "Tee, v2" })),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(FEED_COLUMNS.join(","));
    expect(lines[1]).toContain('"He said ""hi"" then left"'); // newline → space, quotes doubled
    expect(lines[1]).toContain('"Tee, v2"');                   // comma stays inside quotes
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- meta-feed`
Expected: FAIL — cannot resolve `@/app/_lib/meta-feed`.

- [ ] **Step 3: Implement the pure feed module**

Create `app/_lib/meta-feed.ts`:

```ts
// app/_lib/meta-feed.ts
// Pure mapping from our Product model to Meta's catalog CSV schema, plus CSV
// serialization. No DB access here — the Route Handler supplies rows. Kept pure
// so the price/sale/availability rules are unit-tested in isolation.
import { absoluteUrl } from "@/app/_lib/absolute-url";

export type FeedProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  stock: number;
  image: string;
  archived: boolean;
};

export type FeedRow = {
  id: string;
  title: string;
  description: string;
  availability: string;
  condition: string;
  price: string;
  sale_price: string;
  link: string;
  image_link: string;
  brand: string;
  google_product_category: string;
  item_group_id: string;
};

export const FEED_COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "sale_price",
  "link",
  "image_link",
  "brand",
  "google_product_category",
  "item_group_id",
] as const;

const BRAND = "Dressing Bear";
const GOOGLE_CATEGORY = "Apparel & Accessories > Clothing";

function money(value: number): string {
  return `${value.toFixed(2)} LKR`;
}

export function productToFeedRow(p: FeedProduct): FeedRow {
  const onSale = p.originalPrice != null && p.originalPrice > p.price;
  return {
    id: p.id,
    title: p.name,
    // Newlines break CSV rows; collapse to spaces.
    description: p.description.replace(/\s+/g, " ").trim(),
    availability: p.stock > 0 ? "in stock" : "out of stock",
    condition: "new",
    // Meta convention is inverted from our model: when on sale the "price" is
    // the original (was) price and "sale_price" is what the customer pays.
    price: onSale ? money(p.originalPrice as number) : money(p.price),
    sale_price: onSale ? money(p.price) : "",
    link: absoluteUrl(`/products/${p.id}`),
    image_link: absoluteUrl(p.image),
    brand: BRAND,
    google_product_category: GOOGLE_CATEGORY,
    item_group_id: p.id,
  };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function feedRowsToCsv(rows: FeedRow[]): string {
  const header = FEED_COLUMNS.join(",");
  const body = rows.map((row) =>
    FEED_COLUMNS.map((col) => csvCell(String(row[col as keyof FeedRow] ?? ""))).join(","),
  );
  return [header, ...body].join("\n") + "\n";
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- meta-feed`
Expected: PASS (5 tests).

- [ ] **Step 5: Create the Route Handler**

Create `app/feed/meta-catalog.csv/route.ts`:

```ts
// app/feed/meta-catalog.csv/route.ts
// Public CSV catalog feed for Meta Commerce Manager / Facebook Shop. Meta pulls
// it on a schedule; cached via `revalidate` so polls don't hit the DB every time.
// Excludes archived products; out-of-stock products are kept (marked out of stock)
// so ad history is retained.
import { prisma } from "@/app/_lib/prisma";
import { productToFeedRow, feedRowsToCsv, type FeedProduct } from "@/app/_lib/meta-feed";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const products = await prisma.product.findMany({
    where: { archived: false },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      originalPrice: true,
      stock: true,
      image: true,
      archived: true,
    },
  });

  const rows = products.map((p) => productToFeedRow(p as FeedProduct));
  const csv = feedRowsToCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
```

- [ ] **Step 6: Verify typecheck and unit tests**

Run: `npx tsc --noEmit && npm test -- meta-feed`
Expected: no type errors; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/meta-feed.ts app/_lib/__tests__/meta-feed.test.ts app/feed/meta-catalog.csv/route.ts
git commit -m "feat(meta): add CSV catalog feed route and pure mapping module"
```

---

### Task 9: README env documentation

**Files:**
- Modify: `README.md` (document `NEXT_PUBLIC_META_PIXEL_ID`, the feed URL, and the optional/no-op behaviour)

**Interfaces:**
- Consumes: nothing.
- Produces: documentation only.

- [ ] **Step 1: Add the env var to the `.env.local` example**

In `README.md`, under the `### 2. Configure Environment` code block, add after the `APP_URL` line:

```env
# Meta / Facebook (optional — when unset, Pixel + tracking are fully disabled)
NEXT_PUBLIC_META_PIXEL_ID=""
```

- [ ] **Step 2: Add a "Social Commerce / Meta" section**

Add a new section near the bottom of `README.md` (before "## Tech Stack"):

```markdown
## Social Commerce / Meta Integration

- **Meta Pixel** is optional. Set `NEXT_PUBLIC_META_PIXEL_ID` to your Pixel ID to
  enable browser tracking of `PageView`, `ViewContent`, `AddToCart`,
  `InitiateCheckout`, and `Purchase`. When the variable is unset or empty, no
  Pixel script loads and the site behaves exactly as before.
- **Catalog feed** for Meta Commerce Manager / Facebook Shop is served at
  `/feed/meta-catalog.csv`. Point a scheduled feed at
  `<APP_URL>/feed/meta-catalog.csv`. It excludes archived products and uses LKR
  prices; on-sale products map `price` → original and `sale_price` → current per
  Meta's convention.
- **Shared links** show the product image, title with price (`Name — LKR 1,990`),
  and description via Open Graph tags, plus `Product` JSON-LD for Google/Pinterest.
- `APP_URL` must be set to the public site origin in production so feed links,
  share URLs, and OG image URLs are absolute.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(meta): document Pixel env var and catalog feed URL"
```

---

### Task 10: Playwright e2e tests

**Files:**
- Create: `tests/e2e/meta-pixel.spec.ts` (funnel events via stubbed `window.fbq`)
- Create: `tests/e2e/meta-share-seo.spec.ts` (share button URLs, OG title, JSON-LD)
- Create: `tests/e2e/meta-feed.spec.ts` (feed route response)

**Interfaces:**
- Consumes: the running app (Playwright `webServer` runs `npm run dev`); existing seed data (products `p1`…, ≥1 category). Reuses the cart/checkout interaction idioms from `tests/e2e/order-confirmation.spec.ts`.
- Produces: e2e coverage. No app code changes.

**Key technique:** stub `window.fbq` via `page.addInitScript` **before navigation**. The Meta base snippet guards with `if(f.fbq)return`, so a pre-installed stub is preserved and captures every `track()` call. Because feature `track()` calls only require `window.fbq` to exist (not the env var), these tests work without `NEXT_PUBLIC_META_PIXEL_ID` being set in the dev server.

- [ ] **Step 1: Funnel-events spec**

Create `tests/e2e/meta-pixel.spec.ts`:

```ts
import { existsSync } from "node:fs";
for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}
import { test, expect, type Page } from "@playwright/test";

// Install a window.fbq stub that records calls, before any page script runs.
async function stubPixel(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __fbq: unknown[][] }).__fbq = [];
    (window as unknown as { fbq: (...a: unknown[]) => void }).fbq = (...args: unknown[]) => {
      (window as unknown as { __fbq: unknown[][] }).__fbq.push(args);
    };
  });
}

async function pixelCalls(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => (window as unknown as { __fbq: unknown[][] }).__fbq ?? []);
}

function eventNames(calls: unknown[][]): string[] {
  return calls.filter((c) => c[0] === "track").map((c) => String(c[1]));
}

test("fires ViewContent on a product page", async ({ page }) => {
  await stubPixel(page);
  await page.goto("/products/p1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("ViewContent");
});

test("fires AddToCart when adding from the product page", async ({ page }) => {
  await stubPixel(page);
  await page.goto("/products/p1");
  // Select a size if the product requires one.
  const sizeButtons = page.locator('#size-picker button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
  }
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("AddToCart");
});

test("fires InitiateCheckout on the checkout page with items in the cart", async ({ page }) => {
  await stubPixel(page);
  await page.goto("/products/p1");
  const sizeButtons = page.locator('#size-picker button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
  }
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();
  await page.goto("/checkout");
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("InitiateCheckout");
});
```

- [ ] **Step 2: Run the funnel spec**

Run: `npm run test:e2e -- meta-pixel`
Expected: PASS (3 tests). Requires a seeded DB (product `p1`).

- [ ] **Step 3: COD Purchase + dedupe spec**

Append a COD purchase test to `tests/e2e/meta-pixel.spec.ts` (reuses the COD checkout flow from `order-confirmation.spec.ts`; relies on the inline "Order Confirmed!" success view):

```ts
test("fires Purchase exactly once on COD order placement", async ({ page }) => {
  await stubPixel(page);
  await page.goto("/products/p1");
  const sizeButtons = page.locator('#size-picker button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
  }
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();

  await page.goto("/checkout");
  await page.getByLabel(/Phone Number/i).fill("0771234567");
  await page.getByLabel(/Address Line 1/i).fill("123 Test St");
  await page.locator("#city").selectOption("Colombo");
  await page.getByRole("button", { name: /Place Order/i }).click();

  await expect(page.getByRole("heading", { name: "Order Confirmed!" })).toBeVisible({ timeout: 30_000 });

  const purchases = eventNames(await pixelCalls(page)).filter((n) => n === "Purchase");
  expect(purchases).toHaveLength(1);
});
```

> **Stock/idempotency:** like `order-confirmation.spec.ts`, this test depends on seeded products having stock. If you add `beforeAll`/`afterAll` stock top-up, mirror that file's pattern. Keep guest checkout (no login) if the product/checkout flow allows it; otherwise reuse its login helper.

- [ ] **Step 4: Run the Purchase test**

Run: `npm run test:e2e -- meta-pixel`
Expected: PASS (4 tests).

- [ ] **Step 5: Share + SEO spec**

Create `tests/e2e/meta-share-seo.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("product page has price-in-title OG tag and Product JSON-LD", async ({ page }) => {
  await page.goto("/products/p1");

  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
  expect(ogTitle).toMatch(/LKR|Rs/); // price folded into the title

  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toMatch(/^https?:\/\//); // absolute

  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toBeTruthy();
  const json = JSON.parse(ld!);
  expect(json["@type"]).toBe("Product");
  expect(json.offers.priceCurrency).toBe("LKR");
  expect(json.sku).toBe("p1"); // content id invariant: sku == product.id
});

test("share buttons expose Facebook and WhatsApp links to the canonical URL", async ({ page }) => {
  await page.goto("/products/p1");

  // Facebook share opens a popup; assert the button is present and the copy-link
  // button writes the canonical URL to the clipboard.
  await expect(page.getByRole("button", { name: /Share on Facebook/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share on WhatsApp/i })).toBeVisible();

  // Copy link → clipboard contains the product URL.
  await page.getByTestId("copy-link").click();
  // Clipboard read requires permissions; assert the button entered its "Copied" state instead.
  await expect(page.getByRole("button", { name: /Copied/i })).toBeVisible({ timeout: 3_000 });
});
```

- [ ] **Step 6: Feed spec**

Create `tests/e2e/meta-feed.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("catalog feed returns CSV with header and product rows", async ({ request }) => {
  const res = await request.get("/feed/meta-catalog.csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");

  const body = await res.text();
  const lines = body.trim().split("\n");
  expect(lines[0]).toBe(
    "id,title,description,availability,condition,price,sale_price,link,image_link,brand,google_product_category,item_group_id",
  );
  expect(lines.length).toBeGreaterThan(1);
  expect(body).toContain("LKR");
  expect(body).toContain("Dressing Bear");
});
```

- [ ] **Step 7: Run the new e2e specs**

Run: `npm run test:e2e -- meta-pixel meta-share-seo meta-feed`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/meta-pixel.spec.ts tests/e2e/meta-share-seo.spec.ts tests/e2e/meta-feed.spec.ts
git commit -m "test(e2e): cover Pixel funnel events, share/SEO tags, and catalog feed"
```

---

### Task 11: Full regression — confirm nothing is broken

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: all tests pass, including the existing 418 and the new `absolute-url`, `meta-pixel`, `meta-feed` tests.

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: all specs pass — in particular the pre-existing `order-confirmation.spec.ts` and `payhere-*.spec.ts` (checkout/order flow unchanged).

> Requires a seeded, reachable database. If the environment can't run e2e (no `DATABASE_URL`), record that e2e was env-blocked and must be run in CI / a DB-connected environment before merge — do not claim green without evidence.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors, no new lint errors.

- [ ] **Step 4: Verify no-op-when-unset behaviour**

With `NEXT_PUBLIC_META_PIXEL_ID` unset, confirm in a browser (or by inspecting the rendered HTML) that no `fbevents.js` request is made and no `<script id="meta-pixel-base">` is present — i.e. the site is byte-for-byte equivalent to pre-change behaviour for analytics.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore(meta): final verification pass for social commerce integration"
```

---

## Self-Review

**Spec coverage** — every spec section maps to a task:

| Spec section | Task(s) |
|---|---|
| §1 Meta Pixel module | 1 |
| §2 Base Pixel script + PageView-on-nav | 2 |
| §3 Event firing points (ViewContent/AddToCart/InitiateCheckout) | 3, 4 |
| §4 Purchase correctness (COD inline + online success + dedupe) | 5 |
| §5 OG price-in-title + JSON-LD | 6 |
| §6 Share buttons | 7 |
| §7 CSV catalog feed | 8 |
| §8 `absoluteUrl` helper | 1 |
| §9 Mobile polish (≥44px targets, share row) | 7 (buttons sized `h-10`, wrap) |
| Configuration / README | 9 |
| Testing (unit + e2e) | 1, 8 (unit), 10 (e2e), 11 (regression) |
| Core invariant `content_ids == feed id == product.id` | asserted in Task 8 unit test + Task 10 JSON-LD `sku` assertion |

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every command shows expected output.

**Type consistency:** helper names match across tasks — `absoluteUrl`, `pixelId`, `isPixelConfigured`, `track`, `trackViewContent`, `trackAddToCart`, `trackInitiateCheckout`, `trackPurchaseOnce`, `PURCHASE_DEDUPE_KEY` (Task 1) are consumed with identical signatures in Tasks 2–8; `productToFeedRow`/`feedRowsToCsv`/`FEED_COLUMNS`/`FeedProduct`/`FeedRow` (Task 8) are used consistently in its test and route; `<TrackPurchase>` props (Task 5) match between component and call site.

**Guardrails honored:** no schema/payment/courier changes; `app/checkout/actions.ts` (Server Action) is untouched — Purchase is fired client-side from existing render paths. `NEXT_PUBLIC_META_PIXEL_ID` optional and no-op when unset (verified in Task 11 Step 4).
