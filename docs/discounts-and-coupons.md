# Admin discounts and coupons

Implementation entry point: `/admin/discounts`. The shared admin navigation exposes it on desktop and mobile. Every admin read/action uses the existing database-verified admin guard.

Admins can search by offer name or coupon code, filter by availability status and automatic/coupon type, and create, edit, activate, deactivate, or delete offers. Each offer shows its usage, savings, paid orders, and start/expiry schedule. Filtered empty results can be reset without creating another offer.

Selected products and collections remain removable while searching. If a selected product has been archived and is no longer available, the editor flags its retained selection and requires its removal before saving. Date fields keep incomplete edits local until submission, validate the final schedule, and preserve the exact saved timestamp when the displayed date is unchanged. Failed actions retain the draft and show an actionable error.

## Pricing policy

- Leave the code blank for an automatic discount. Enter a code for a customer coupon. Codes are trimmed, case-insensitive, and stored uppercase.
- Percentage and fixed LKR offers support the whole store, selected products, or store collections (`Design`, including additional product placements). Inventory categories are independent and are not promotion targets.
- Exactly one promotion applies per order. Without a code, the largest eligible automatic saving wins; ties use the offer ID. A valid coupon replaces the automatic offer even when its saving is smaller. Invalid coupons must be corrected or removed before checkout.
- Each offer supports All payment methods, or one or more of Cash on Delivery (COD), PayHere, Koko and Mintpay. Existing offers default to all methods. An empty selection is invalid; selecting all four is saved as unrestricted. Editing through an older payload that omits this setting preserves the existing restriction.
- Payment restrictions are evaluated with every quote and again inside the order transaction. A valid coupon that does not match the selected method remains entered, contributes no saving, and explains which methods qualify. Selecting an eligible method restores its saving; removing the code restores the best eligible automatic offer. A cart without a selected method excludes payment-restricted savings and explains the condition.
- Existing sale items (`originalPrice > price`) are excluded from further promotions. Original prices and existing sale savings are displayed separately from promotion savings in cart/checkout.
- Minimum order value uses the current merchandise subtotal, before the promotion and excluding delivery. Percentage and fixed amounts apply only to eligible merchandise. Maximum discount caps the entire promotion per order, not each unit.
- All new promotion calculations use integer LKR cents. Percentage values are stored as basis points (12.5% = 1250). Savings cannot exceed eligible merchandise. Existing order/item Float fields and existing delivery/free-delivery rules are retained. Delivery eligibility uses the merchandise subtotal before the promotion.
- Start dates are inclusive and expiry dates exclusive. The admin date controls display Sri Lanka time (UTC+05:30); storage and validation use UTC.
- Usage limits count successful order placements, including unpaid and subsequently cancelled orders. Failed transactions do not consume a use. Payment retries and callbacks do not claim a second use. Uses are intentionally not restored on cancellation/payment failure, preventing repeated abandoned checkout attempts from reusing a limited coupon. The admin explains this policy and can edit the limit.

## Checkout and order history

Cart/checkout request a debounced server quote from current product/variant prices. Old local carts remain compatible. The client refreshes changed prices, hides stale quotes, and disables new order submission until validation succeeds. Returning to the tab rechecks the quote. Coupon choice is shared across cart/checkout within the browser session.

At order placement the server re-evaluates the offer inside the existing stock/order transaction, compares the confirmed saving, then claims the discount with an atomic guarded update. The guard checks version, activity, schedule and `usedCount < usageLimit`. Admin edits and concurrent claims invalidate a stale claim; the shopper reviews the refreshed total. A later stock/order failure rolls back the usage claim with the rest of the transaction.

Changing the selected payment method immediately hides the previous quote and disables order submission until the replacement quote succeeds. Accepted online orders retain their original payment method and saved total during retries. Retrying an existing order with a different method is rejected before any new stock or discount use is claimed.

Savings are persisted as a protected negative `OrderAdjustment` plus an immutable `DiscountRedemption` snapshot (name, code, amount). One redemption per order is enforced by a unique index. Editing or deleting an offer leaves existing order totals and historical redemptions intact. Deleting a promotion detaches its history with `ON DELETE SET NULL`.

Gateway amounts continue to use the persisted `Order.total`. A fully discounted zero-total order uses COD without an online payment; the server rejects a zero-value online submission before claiming usage or stock and prompts the shopper to select COD. COD and prepaid confirmation emails, order summaries, and existing admin documents use the saved adjustment. Item changes on orders with promotion savings are locked to preserve original eligibility; cancel/reorder to change items. Address edits preserve savings and use existing delivery recalculation. Saved promotion adjustments cannot be removed or combined with a second manual discount. Existing orders without promotions keep their existing editing behavior.

The admin dashboard shows currently available offers, placed orders using offers, recorded savings, and paid orders. Overall historical totals include deleted offers. Savings include all placed orders; the paid-order metric separately counts `PAID`/`COD_COLLECTED` orders.

## Migration and operational notes

The additive migration is `prisma/migrations/20261021090000_discounts/migration.sql`. It creates four promotion tables, adds one boolean column to `OrderAdjustment`, and adds constraints/indexes. It uses a transaction with a 5-second lock timeout and 30-second statement timeout. It does not change existing prices or order totals. No discount is seeded or enabled by default.

The additive payment migration is `prisma/migrations/20261021170000_discount_payment_methods/migration.sql`. It adds `Discount.paymentMethods`, defaulting to an empty array (all methods), with a database constraint accepting only the four supported method names. No offer is created, activated or broadened. After any restricted offer is saved, rollback must retain payment-aware pricing; an earlier application image would not enforce the restriction.

Deployed on 21 October 2026; the production app became healthy at 20:45 Asia/Colombo. Release image: `dressingbear-app:discounts-20261021`. The release overlays 31 discount-related files on the exact previous release source. The migration audit confirmed this was the only pending migration and every previously applied migration checksum matched.

Fresh private backups were taken before and after migration. All existing rows across 29 application tables matched the pre-migration snapshot, after accounting for the new `promotion = false` field. All 42 products and 357 size IDs/SKUs were preserved. No offer was seeded or enabled.

Backups, source hashes, the exact source archive, deployment records, test logs and browser screenshots are retained in the private ignored directory `tmp/operations/discounts-20261021/`. The isolated test database, candidate container, temporary credential files, browser files and build directories were removed after verification.

Once offers or redemptions exist, retain the promotion-aware release and prefer a verified fix forward. Older application versions do not enforce promotion eligibility or usage claims. Do not remove saved promotion adjustments or history to make an older version compatible.

## Verification record (21 October 2026)

- The full release regression passed: 1,283 tests across 142 files. Six existing legacy cases requiring a separate opt-in schema stayed skipped. The initial run's test-environment configuration error was corrected and the complete suite rerun successfully; both logs are retained.
- Fourteen new real PostgreSQL cases passed, covering coupon normalization, duplicate codes, product/additional-collection targets, sale exclusions, version guards, concurrent final-use claims, transaction rollback, admin deactivation during a claim, COD totals, immutable redemption history, order retries, stale totals, database constraints and admin access. `DISCOUNT_TEST_DATABASE_URL` explicitly opts into the guarded isolated database; integration tests never use the default production connection.
- Prisma client generation, migration on an isolated restored database, changed-file ESLint and whitespace checks passed. All 28 changed TypeScript production/test files and their dependencies passed in four sequential batches.
- The production build passed with one worker, a 0.5 CPU limit, a 640 MiB container limit and a 384 MiB Node heap. Type checks used 704 MiB containers and 512 MiB heaps. The build's minimum available host memory was 642 MiB; no resource guard stopped a validation task.
- Authenticated HTTP checks on the packaged candidate passed offer creation, editing, deactivation, deletion, unauthorized mutation rejection, stale versions, dashboard refresh and public coupon pricing.
- Desktop and 390px mobile Chromium checks passed creation, target selection/removal, schedule editing, search/type/status filters, activation/deactivation, mobile navigation, and delete confirmation/cancellation. There were no browser runtime errors or horizontal overflow. Desktop/mobile screenshots were inspected. Temporary browser binaries and libraries stayed in the release workspace and were removed afterward.
- Read-only live checks passed the protected admin page, authenticated dashboard, cart and new admin JavaScript asset. Public HTTPS health, home, product, catalogue feed and JavaScript returned HTTP 200. Home and catalogue caches were refreshed against production.
