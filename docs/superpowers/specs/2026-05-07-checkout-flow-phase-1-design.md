# Checkout flow — Phase 1 design

Date: 2026-05-07
Status: approved (pending user review of this written spec)

## Context

This is the first of three phases redesigning the purchase funnel toward a noirellepremium-style flow. Phase 1 is "quick wins + bug fix" — non-structural changes that make the existing flow more correct and informative without restructuring the cart or checkout.

Subsequent phases (out of scope for this spec):
- **Phase 2** — cart drawer, header cart icon with live count, "you may also like" cross-sell
- **Phase 3** — guest-default checkout (account creation offered after order), multi-step checkout (Address → Payment → Review)

## Goal

Four scoped changes:

1. **E** — Signup respects `callbackUrl` so guests signing up mid-checkout return to checkout, not home.
2. **B** — "Buy now" from a product card with `?action=buy-now` scrolls to and highlights the size picker on the PDP.
3. **I** — Free-shipping progress bar on the cart page.
4. **G** — Optional order-notes field on checkout, persisted on `Order` and included in the confirmation email.

## Non-goals

- Cart drawer (Phase 2)
- Multi-step checkout (Phase 3)
- Guest-default UX (Phase 3)
- Removing the `/login` and `/signup` redirect interruption during checkout (Phase 3 — for now `callbackUrl` is the bridge)
- Per-product or per-region notes templates (just a freeform textarea)
- Showing notes back to the customer after order (only used internally and on courier submission)

## Decisions

### Phasing

Phase 1 ships as a single PR/branch flow (the standard `develop` → preview → merge to `main` pattern). Phase 2 and 3 will each get their own spec → plan → implementation cycle after Phase 1 is live and verified.

### Free-shipping bar location: cart page only

A sticky banner at the top of every page would be more visible but is also intrusive. The cart page is where the purchase intent crystallizes; that's where the message lands. Checkout already shows "You qualify for free shipping!" once the threshold is hit; we leave that and add the *progress* state only on cart.

### Buy Now post-size-pick: explicit click

After scrolling to and highlighting the size picker, we wait for the user to click "Buy now" again. Auto-purchasing after a size click feels coercive and risks accidental orders. The scroll + highlight is enough of a nudge.

### Order notes character limit: 500

Loose enough for real instructions ("leave at security gate; call 30 min before; phone Sayuri 077..."), tight enough that it can't be abused as a spam vector. Validated server-side via Zod; trimmed before persist.

## File map

| Path | Status | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | modify | Add `Order.notes String?` |
| `prisma/migrations/<timestamp>_add_order_notes/migration.sql` | create | Auto-gen `ALTER TABLE "Order" ADD COLUMN "notes" TEXT` |
| `app/(auth)/signup/page.tsx` | modify (1 hunk) | Read `callbackUrl` from `searchParams`, render hidden `<input>` so `signupAction` receives it |
| `app/(auth)/actions.ts` | modify (1 hunk in `signupAction`) | Read `callbackUrl` from `formData`, validate same-origin, redirect there instead of `/` |
| `app/_components/product/buy-box-client.tsx` | modify (2 hunks) | Read `?action=buy-now` once on mount; if no size selected, scroll to + highlight size picker (don't auto-trigger). Already buys after explicit click. |
| `app/_components/cart/free-shipping-progress.tsx` | create | New presentational client component: takes `subtotal: number`, renders progress text + bar |
| `app/cart/page.tsx` (or the cart's client view) | modify (1 hunk) | Render `<FreeShippingProgress subtotal={subtotal} />` above the order summary |
| `app/checkout/checkout-client.tsx` | modify (2 hunks) | Add `notes` state + textarea between Shipping and Payment sections. Include in `processOrder` payload. |
| `app/checkout/actions.ts` | modify (3 hunks) | Add `notes: z.string().trim().max(500).optional()` to `ProcessOrderSchema`; persist on `Order.create.data`; pass into mailer payload |
| `app/_lib/mailer.ts` | modify (small hunks) | Add optional `notes` to `OrderConfirmationParams`; include "Delivery notes" line in the email body when present |

## Component contracts

### `<FreeShippingProgress>`

```tsx
type Props = { subtotal: number };

// Reads FREE_SHIPPING_THRESHOLD from app/_lib/checkout-config
// Below threshold:
//   "Add LKR <X> more for free shipping" + horizontal bar at (subtotal/threshold)*100%
// At or above:
//   "🎉 You qualify for free shipping!" (no bar)
// At subtotal === 0: hide entirely (cart is empty; the strip would be a misleading "0% progress")
```

Pure presentational, no state, no fetches. Imported by the cart page's existing client component.

### `signupAction` callbackUrl handling

```ts
// Mirrors loginAction's existing pattern at line ~67 of app/(auth)/actions.ts
const callbackUrl = (formData.get("callbackUrl") as string) || "/";
const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
  ? callbackUrl
  : "/";
// ... existing user creation + signIn ...
redirect(safeCallback);
```

The `startsWith("/")` + `!startsWith("//")` check rejects open-redirects (`//evil.com/...`). Matches the convention used elsewhere in the codebase.

### Buy Now `?action=buy-now`

`buy-box-client.tsx` already handles the in-buy-box click. Add (in a `useEffect`):

```tsx
const searchParams = useSearchParams();
const action = searchParams.get("action");

useEffect(() => {
  if (action !== "buy-now") return;
  if (!sizeList.length) return;          // no sizes — buy box still requires explicit click
  if (selectedSize) return;              // size already picked — don't override
  const el = document.getElementById("size-picker");
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  // Apply a brief visual highlight by toggling a data-attribute the size picker watches.
  el?.setAttribute("data-attention", "true");
  const t = setTimeout(() => el?.removeAttribute("data-attention"), 2000);
  return () => clearTimeout(t);
}, [action, sizeList.length, selectedSize]);
```

The size picker block (currently lines 121–144) gains `id="size-picker"` and a `data-[attention=true]:ring-2 data-[attention=true]:ring-primary data-[attention=true]:ring-offset-2` Tailwind selector to flash the ring for 2 seconds. After the user picks a size and clicks "Buy now", the existing `handleBuyNow()` flow takes over (`addItem` + `router.push("/checkout")`).

### Order notes — schema

```prisma
model Order {
  // ... existing fields ...
  notes  String?  // delivery instructions from customer; nullable
}
```

A single nullable column. Migration is generated by `prisma migrate dev --name add_order_notes` and applied via the existing `vercel.json` build pipeline (`prisma migrate deploy`).

### Order notes — submit shape

```ts
// app/checkout/actions.ts
const ProcessOrderSchema = z.object({
  // ... existing fields ...
  notes: z.string().trim().max(500).optional(),
});

// inside processOrder():
await tx.order.create({
  data: {
    // ... existing fields ...
    notes: parsed.data.notes && parsed.data.notes.length > 0
      ? parsed.data.notes
      : null,
  },
});
```

Empty strings are normalized to `null` (so `WHERE notes IS NOT NULL` queries work as expected).

### Order notes — UI placement

In `checkout-client.tsx`, between the existing Shipping Address `<div>` (closes around line 345) and the Payment Method `<div>` (opens around line 347):

```tsx
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
```

Uses the shadcn `Textarea` from `@/components/ui/textarea` — already wired into the project (used by `app/contact/contact-form.tsx`). Imported in `checkout-client.tsx` alongside the other shadcn components already imported there.

### Order notes — email

`sendOrderConfirmationEmail` currently builds plain-text + HTML bodies. Add (right after the shipping address block in both bodies):

```
Delivery notes:
<notes>
```

…rendered only when `notes && notes.trim()`. Plain-text gets a leading blank line; HTML gets a `<p>` with the brand styles already in use.

## Migration sequence

1. Schema change + migration generation locally (`npx prisma migrate dev --name add_order_notes`)
2. The new migration ships with the rest of the code
3. On deploy, `prisma migrate deploy` (already in `vercel.json` build) applies `ALTER TABLE "Order" ADD COLUMN "notes" TEXT` against Prisma Postgres
4. Existing rows get `NULL`, which is fine (column is nullable)

No data backfill needed. Zero downtime.

## Risks & guardrails

- **Backward-compat on `processOrder`:** `notes` is optional in the Zod schema, so existing callers that don't send it (none today, but defensive) keep working.
- **Open redirect via `callbackUrl`:** mitigated by the `startsWith("/") && !startsWith("//")` validator — same pattern login already uses.
- **Buy Now scroll behavior with React Strict Mode:** `useEffect` may run twice in dev; the cleanup function handles the duplicate timeout.
- **Email rendering with notes containing newlines / HTML chars:** plain-text body passes through directly. `mailer.ts` doesn't currently have an HTML-escape helper (verified — no matches for `escapeHtml`/`escape(`). Add a tiny inline `escapeHtml(s: string)` covering `& < > " '` at the top of `mailer.ts` and use it on `notes` (and any other future user-supplied string we render into the HTML body).

## Out of scope

- Showing previous-order notes on the user's account orders page
- Per-region or per-payment-method note templates
- Notes on the courier submission payload (already supported in `actions.ts`'s RoyalExpress block — we'll include `notes` there as a one-line addition in the implementation, not the spec)

## Approval signal

Once this spec is committed, the user reviews and either approves or requests changes. On approval the next step is invoking the writing-plans skill to lay out the step-by-step implementation plan.
