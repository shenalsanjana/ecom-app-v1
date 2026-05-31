# UI/UX Refresh — Plan 05: Checkout + Alternate-Mobile Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the funnel: add an optional alternate mobile number (Prisma migration + action + form), give the payment methods premium tiles with the real Koko/Mintpay logos and "Pay in 3" tags, restyle the order-confirmed screen onto the boutique palette, and make the stored PayHere display name consistent with the new "Credit / Debit Card" label.

**Architecture:** One additive, nullable Prisma migration (`Order.customerPhoneAlt`), small edits to the server action (`actions.ts`), and presentational edits to the checkout client. Payment-initiation/finalization logic is untouched. Verified with `npm run build` + visual check (no RTL).

**Tech Stack:** Next.js 16, Prisma + PostgreSQL, Tailwind v4, shadcn, lucide-react, zod, vitest (node env).

**Spec:** `docs/superpowers/specs/2026-05-30-ui-ux-boutique-refresh-design.md`
**Builds on:** Plans 01–04 (this branch). Uses `PaymentMethodIcon` from Plan 01.

**DEFERRED on execution (2026-05-31): the alternate-mobile column + wiring (Tasks 1, 2, 4).**
The hosted dev DB (`db.prisma.io`) has migration-history drift (`20260527000000_add_user_role`
was modified after being applied), so `prisma migrate dev` would only proceed by `migrate
reset` — i.e. wiping all data. The additive nullable column is safe in principle, but per the
user's decision the alt-mobile feature is deferred until the migration drift is reconciled
properly. **Only Tasks 3, 5, 6 (no-DB checkout polish) were executed.** The underlying drift
should be fixed regardless — it will block every future migration.

**DEFERRED (not in this plan): "email optional".** Making guest email optional ripples into
`GuestInfoSchema` validation AND disables order-confirmation/receipt emails (and may affect the
courier/admin email path). Recommendation: keep email **required-but-clearly-worded** rather
than silently dropping receipts. If you still want it optional, it should be its own deliberate
change that also handles the no-email order path. Logged here so it isn't lost.

---

### Task 1: Migration — add nullable `Order.customerPhoneAlt`

**Files:**
- Modify: `prisma/schema.prisma` (Order model)
- Create: `prisma/migrations/<timestamp>_add_order_customer_phone_alt/migration.sql` (generated)

- [ ] **Step 1: Add the column to the `Order` model**

In `prisma/schema.prisma`, in `model Order`, add a line immediately after `customerPhone String`:
```prisma
  customerPhoneAlt      String?
```
(Nullable — existing rows and orders without a second number stay valid.)

- [ ] **Step 2: Create + apply the migration**

Run:
```bash
npx prisma migrate dev --name add_order_customer_phone_alt
```
Expected: Prisma creates `prisma/migrations/<timestamp>_add_order_customer_phone_alt/migration.sql` containing roughly `ALTER TABLE "Order" ADD COLUMN "customerPhoneAlt" TEXT;`, applies it to the dev database, and regenerates the client. Output ends with something like "Your database is now in sync with your schema" / "Generated Prisma Client".

**Fallback (only if `migrate dev` fails on shadow-DB/connectivity):** Do NOT force it. Instead run `npx prisma migrate dev --name add_order_customer_phone_alt --create-only` to generate the migration SQL WITHOUT applying, then report **DONE_WITH_CONCERNS** describing the error and that the migration is created-but-unapplied (so the controller can decide how to apply it). Do not run `db push` or edit the database by hand.

- [ ] **Step 3: Verify the client picks up the field**

Run: `npm run build`
Expected: `✓ Compiled successfully` (the generated client now knows `customerPhoneAlt`; nothing references it yet, so no type errors).

- [ ] **Step 4: Commit (schema + migration)**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add nullable Order.customerPhoneAlt column"
```

---

### Task 2: Action — accept + persist the alternate mobile

**Files:**
- Modify: `app/checkout/actions.ts`

- [ ] **Step 1: Add `altContactPhone` to the input schema**

In `app/checkout/actions.ts`, in `ProcessOrderSchema`, add a field right after the `contactPhone: LkPhoneSchema,` line:
```ts
  altContactPhone: LkPhoneSchema.optional(),
```
(Optional — validated as a Sri Lankan phone only when present.)

- [ ] **Step 2: Destructure it in `processOrder`**

Find the destructuring line:
```ts
  const { items, shippingAddress, paymentMethod, contactPhone, guestInfo, idempotencyKey, notes } =
```
Add `altContactPhone` to it:
```ts
  const { items, shippingAddress, paymentMethod, contactPhone, altContactPhone, guestInfo, idempotencyKey, notes } =
```

- [ ] **Step 3: Persist it on order create**

In the `tx.order.create({ data: { ... } })` block, add a line immediately after `customerPhone: contactPhone,`:
```ts
          customerPhoneAlt: altContactPhone ?? null,
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`. (The Prisma client from Task 1 now accepts `customerPhoneAlt`.)

- [ ] **Step 5: Commit**

```bash
git add app/checkout/actions.ts
git commit -m "feat(checkout): persist optional alternate mobile on the order"
```

---

### Task 3: Align `PAYMENT_METHOD_DISPLAY` with the new card label

**Files:**
- Modify: `app/checkout/actions.ts`

- [ ] **Step 1: Update the PayHere display string**

In `app/checkout/actions.ts`, in the `PAYMENT_METHOD_DISPLAY` map, change:
```ts
  PAYHERE: "PayHere",
```
to:
```ts
  PAYHERE: "Credit / Debit Card",
```
(Leave COD/KOKO/MINTPAY as-is. This makes the stored `paymentMethodDisplay` on new orders + emails match the checkout label from Plan 01.)

- [ ] **Step 2: Check for tests asserting the old string**

Search (Grep) for `paymentMethodDisplay: "PayHere"` and `"PayHere"` in test files (`**/*.test.ts`). If a test asserts the literal `"PayHere"` as the display value, update that expectation to `"Credit / Debit Card"`. If none, proceed.

- [ ] **Step 3: Run the checkout/order tests + build**

Run: `npx vitest run app/checkout app/_lib/__tests__` then `npm run build`
Expected: tests pass (update any that asserted the old display string in Step 2), build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/checkout/actions.ts
git commit -m "feat(checkout): display PayHere orders as Credit / Debit Card"
```

---

### Task 4: Checkout form — optional alternate mobile field

**Files:**
- Modify: `app/checkout/checkout-client.tsx`

- [ ] **Step 1: Add alternate-phone state**

Find the primary phone state:
```tsx
  const [phone, setPhone] = useState("");
```
Add right after it:
```tsx
  const [altPhone, setAltPhone] = useState("");
```

- [ ] **Step 2: Add the field after the primary Phone Number field**

Find the primary phone field block (the `<div>` containing `<label htmlFor="phone" ...>Phone Number *</label>` ... ending with the `<p className="mt-1 text-xs text-muted-foreground">For delivery contact.</p></div>`). Immediately AFTER that block's closing `</div>`, add:
```tsx
                    <div>
                      <label htmlFor="altPhone" className="block text-sm font-medium mb-1">
                        Alternate Mobile <span className="text-muted-foreground font-normal">(optional)</span>
                      </label>
                      <Input
                        id="altPhone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        pattern="^(?:\+?94|0)?[1-9]\d{8}$"
                        value={altPhone}
                        onChange={(e) => setAltPhone(e.target.value)}
                        placeholder="+94 7X XXX XXXX"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        A backup number the courier can reach.
                      </p>
                    </div>
```

- [ ] **Step 3: Send it in the `processOrder` call**

Find the `processOrder({ ... })` call in this file. It passes `contactPhone: phone` (or similar). Add, right after the `contactPhone` line in that object:
```tsx
        altContactPhone: altPhone.trim() ? altPhone.trim() : undefined,
```
(Send `undefined` when empty so the optional zod field passes. Match the existing object's indentation.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add app/checkout/checkout-client.tsx
git commit -m "feat(checkout): optional alternate mobile field"
```

---

### Task 5: Premium payment tiles (real logos + Pay-in-3 tags)

**Files:**
- Modify: `app/checkout/checkout-client.tsx`

- [ ] **Step 1: Import `PaymentMethodIcon`**

Add to the imports in `checkout-client.tsx`:
```tsx
import { PaymentMethodIcon } from "@/app/_components/shared/payment-method-icon";
```

- [ ] **Step 2: Replace the emoji with the icon + add a Pay-in-3 tag**

Find the payment option `<label>` body. Replace the emoji line:
```tsx
                        <span className="text-2xl">{option.icon}</span>
```
with a logo tile:
```tsx
                        <span className="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card">
                          <PaymentMethodIcon method={option.id} />
                        </span>
```
Then, inside the same label, find the `<div className="flex-1">...</div>` that holds the name + description. Immediately AFTER that `</div>` (still inside the `<label>`), add a Pay-in-3 tag for the BNPL methods:
```tsx
                        {(option.id === "KOKO" || option.id === "MINTPAY") && (
                          <span className="ml-auto shrink-0 rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-brand">
                            Pay in 3
                          </span>
                        )}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add app/checkout/checkout-client.tsx
git commit -m "feat(checkout): premium payment tiles with real logos + Pay-in-3 tags"
```

---

### Task 6: Order-confirmed screen on the boutique palette

**Files:**
- Modify: `app/checkout/checkout-client.tsx`

- [ ] **Step 1: Recolour the success badge**

Find the order-confirmed success circle:
```tsx
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="h-8 w-8 text-green-600" />
            </div>
```
Replace with:
```tsx
            <div className="mx-auto w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="h-8 w-8 text-brand" />
            </div>
```

- [ ] **Step 2: Grep for any other bright `green-`/`red-`/`amber-`/`emerald-` in this file**

Search `checkout-client.tsx` for `green-`, `emerald-`, `amber-`. If any other off-palette bright status colours remain in customer-facing UI, recolour them to the palette (`text-brand`/`bg-brand/10` for positive, `text-destructive`/`bg-destructive/10` for errors). If the only one was the success badge, proceed.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add app/checkout/checkout-client.tsx
git commit -m "feat(checkout): order-confirmed screen on boutique palette"
```

---

## Visual verification (controller, after all tasks)
Run the app, go through `/checkout` with a seeded cart. Confirm: the alternate-mobile field
(optional), payment tiles showing the real Koko/Mintpay logos + "Pay in 3" tags + "Credit /
Debit Card" label, and (after placing a COD order) the order-confirmed badge in olive, not
green.

## Self-Review

**Spec coverage (Checkout slice):**
- Alternate mobile (migration + action + form, optional) → Tasks 1, 2, 4 ✅
- Payment tiles with real logos + Pay-in-3 tags → Task 5 ✅
- "Credit / Debit Card" everywhere (display name) → Task 3 ✅
- Order-confirmed off green → Task 6 ✅
- Email optional → DEFERRED (logged, with recommendation) ✅
- Numbered step badges → not included (low value vs restructure risk); the existing section
  headers with icons remain. Noted as optional future polish.
- Payment initiation/finalization, Koko/Mintpay/PayHere logic → untouched ✅

**Placeholder scan:** none — exact files, full snippets, exact commands, expected output. The
migration timestamp folder name is generated by Prisma (correctly not hardcoded).

**Type consistency:** `customerPhoneAlt` (Prisma, Task 1) is written by the action (Task 2)
and matches the schema nullable `String?`. `altContactPhone` (zod optional, Task 2) is the key
the client sends (Task 4). `PaymentMethodIcon` takes `method: string` (Plan 01); `option.id`
is a `PaymentMethod`. `LkPhoneSchema` already exists in actions.ts (used by `contactPhone`).

**Risk note:** Task 1 is the only DB-touching step; it is an **additive nullable** column
(safe, no backfill). The fallback path avoids any forced/destructive DB action.
