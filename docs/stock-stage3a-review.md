# Dressing Bear — Stage 3A stock-flow review

Originally reviewed 19 October 2026. **Stage 3A.1 is deployed as of 21 October 2026**; see [the release notes](stock-stage3a1.md). Production, ready-made stock, mixed fulfilment and subsequent slices remain proposals requiring review before implementation. The findings and counts below describe the pre-3A.1 baseline; the local simulator uses illustrative quantities.

Open [the interactive visual proposal](stock-stage3a-review.html) for stock examples and a proposed inventory screen.

## Recommendation

Extend the existing shared-stock model. Keep physical categories, product families, storefront collections, product pages and size SKUs. Introduce three clear fulfilment rules: **plain item**, **printed to order**, and **ready-made**. Add attributed stock movements and track when reserved materials become physically consumed. Add finished balances only for physically separate finished goods.

Both channels use one stock location and one transactional allocation service. POS checkout remains a later release. No category or department should determine a product's stock rule implicitly.

## Baseline reviewed before Stage 3A.1

A short production query ran inside a read-only transaction with a three-second statement timeout. These figures are a snapshot, not a physical stocktake:

| Item | Verified value |
| --- | ---: |
| Published, non-archived products | 42 |
| Physical families | 6 |
| Blank stock rows | 25 |
| Recorded available blank units, excluding order allocations | 175 |
| DTF print records | 40 |
| Active offered size records | 357 |
| Active size records missing blank links | 0 |
| Unassigned blank rows | 0 |
| Blank rows referenced by multiple active colour variants | 22 |

The families are Regular, Oversized, Oversized Raglan, Premium Canvas Cotton Tote Bag with Zipper, Cotton Canvas Zipper Pouch, and Pouch. Regular and Raglan currently have no blank rows or design products. Storefront `Design` records are merchandising collections; `DtfDesign` records are physical print components. These concepts must remain separate.

### Findings and evidence

| Finding | Practical implication | Current source |
| --- | --- | --- |
| Every new sale requires a blank and a print; per-size availability is their minimum. | Plain items and ready-made items cannot use their own appropriate rules. A missing print is currently unavailable, not optional. | `app/_lib/variants.ts:47`, `app/checkout/actions.ts:279`, `app/admin/orders/actions.ts:501` |
| Publication also requires a print and matching blank for every size. | Changing a dropdown alone would not enable the new modes. Publication and all readers must change together. | `app/_lib/product-publication.ts:7` |
| Product colour/size choices come from blank rows. | Ready-made variants will need colour/size setup without fake blank stock. | `app/_components/admin/products/product-form.tsx:45`, `variant-editor.tsx:39` |
| Sales use guarded decrements, and historical lines store their original pool IDs. | Keep this concurrency protection and frozen references. Do not resolve refunds/cancellations from a product's current settings. | `app/_lib/inventory-pools.ts:46`, `prisma/schema.prisma` (`OrderItem`) |
| Cancellation restores the original blank and print for an eligible undispatched order. No production state exists. | If printing already happened, cancellation could recreate unused materials in the records. The system cannot detect that physical event today. | `app/admin/orders/actions.ts:112`, `app/_lib/payments/order-finalization.ts:65` |
| Editing an order restores/reacquires materials using those frozen references. | New consumed or finished allocations need different edit rules; produced items cannot silently become blanks. | `app/admin/orders/actions.ts:246` |
| Receipts/count edits change balances and versions without an inventory movement ledger. | Staff cannot trace a quantity change to its actor, reason and source transaction. Order notes and payment events are not a stock ledger. | `app/admin/inventory/actions.ts:23`, `structure-actions.ts:164`, `prisma/schema.prisma` |
| Count editing explicitly replaces available quantity, excluding allocated units. | Entering the full shelf count can overstate available stock. Keep clear labels until full physical-count support exists. | `app/_components/admin/inventory/available-count-editor.tsx:42` |
| There are no finished-stock, production, allocation-state or returns records. | Existing quantities cannot reveal how many finished goods are physically present. Their opening balances require a reviewed count. | `prisma/schema.prisma` |
| Order deletion is soft deletion and changes no stock. Dispatched/delivered orders cannot use ordinary cancellation. | Preserve those safeguards; add inspected returns separately. No independent POS checkout exists in the reviewed routes. | `app/admin/orders/actions.ts:137`, `:856`; `app/` routes |

## Options

| Option | Advantages | Disadvantages |
| --- | --- | --- |
| A. Make the print optional and keep current balances | Smallest change; enables plain sales. | Does not solve finished goods, consumed-material cancellation, stocktakes or traceability. Useful only as a first slice. |
| **B. Extend existing pools with explicit rules, movement history and finished allocations** | Preserves URLs/SKUs and shared stock; supports the actual business without a catalogue rewrite; incremental rollout. | All sale, availability, edit, payment-release and restoration paths must understand the new rules. Production state is necessary. |
| C. Replace everything with a generic warehouse/manufacturing model | Flexible recipes, locations and valuation. | Large migration and training burden; unnecessary for one shared location and the present catalogue. |

**Choose B**, delivered in small reviewed slices. Do not add duplicate store products to distinguish stock that represents the same saleable item.

## Three stock flows

| Rule in product editor | Availability | On accepting an order | Preparation / fulfilment |
| --- | --- | --- | --- |
| Plain item | Shared blank's available balance | Reserve that blank only. No print required or deducted. | Dispatch consumes that reservation; cancellation before dispatch releases the same blank. |
| Printed to order | Minimum of the linked blank and applicable print balances | Reserve both existing components. | Explicit **Start printing** consumes the reserved components once; **Mark ready** records the finished unit held for that order. Neither action deducts available materials again. |
| Ready-made | The exact finished design/colour/size pool | Reserve finished units only. | Materials were consumed during production, or the finished item was received from a supplier. Selling it never deducts them again. |

The first recipe remains one blank plus one print for printed items. Multiple prints, embroidery, arbitrary recipes and unit conversions require a later reviewed extension. A missing print is a configuration error for printed-to-order products. It is valid for plain items and ready-made sales.

For batch preparation, **Make stock** consumes free blanks/prints and adds completed, checked finished units in one transaction. It must not use materials already reserved for customer orders. Start with a completed-batch record; longer-running batches and partial waste need explicit handling before staff can record them. For order-linked production, consume the existing reservation instead of taking a second set of free materials.

Plain stock that is also sold directly remains one existing blank pool. Do not copy those same physical units into a ready-made balance. Finished pools represent distinct physical goods, such as an already printed Keep Smiling tote.

### If the same SKU is both stocked and made to order

Recorded preference: **allow for both in the proposal; current usage is uncertain**. Preserve one sale SKU and one store page. Include an optional **ready-made first, then print the remainder** policy in the ready-made design, with explicit saved allocations for both parts of the order line. Example: order five, allocate two ready-made units plus three blank/print sets. Never select the source again during cancellation.

The plain-sales slice remains unchanged. In the production/ready-made slice, include split allocation and its cancellation tests so both sources are supported from the outset. Enable fallback explicitly per product only when its component links and production promise are configured; allow ready-made-only selling as the simpler setting. Do not switch modes manually while orders are open or create duplicate product pages as a workaround. This preference does not approve implementation or activate fallback.

For an exact size/colour SKU with fallback enabled, sale capacity is free finished units plus the minimum of compatible free blanks and applicable prints. Reserve both portions atomically; if the whole order cannot be satisfied, roll back all allocations. This is fulfilment capacity, not a physical stock total. Tell the shopper when any units require printing and show the applicable lead time. A future POS must flag that remainder for production or collection rather than marking the whole line as immediately handed over.

## Reservations, production and cancellation

| Physical state when an order closes | Stock action |
| --- | --- |
| Plain item reserved, not dispatched | Release the original blank reservation once. |
| Printed-to-order materials reserved, printing not started | Release the unused original blank and print once. |
| Printing started, output not yet checked | Keep materials consumed. Place work in progress in a review state; record good output or waste after inspection. |
| Printed item completed and checked | Release a reusable finished unit, not its blank and print. Personalised/damaged goods stay unavailable pending a decision. |
| Ready-made unit reserved, not dispatched | Release that same finished pool once. |
| Dispatched/delivered item returned | Record receipt and inspection, then restock the actual reusable item or record damage. A refund alone does not restock anything. |

Online payment must be verified before printing; confirmed COD orders can be prepared under the shop's chosen policy. Payment failure, cancellation and production must claim the same order/allocation version. A failed callback must not release components already consumed in printing. Existing protection for uncertain/late payments remains.

After production starts, block ordinary size/design swaps and removals for the consumed portion. Use an explicit replacement/return workflow. Quantity increases create additional allocations; quantity decreases cannot silently reverse irreversible work. Partial production is tracked by quantity, not one order-wide checkbox.

## Minimal data additions and invariants

These are design boundaries, not an approved migration specification:

- Add an explicit stock rule to `Product`, initially preserving all existing products as printed-to-order. Store the effective rule on each new order allocation. Rule or component changes never rewrite existing allocations.
- Keep `PlainTshirtStock` and `DtfDesign` IDs and balances. Add a finished pool with a stable ID, colour/size/design identity and version; link offered size SKUs explicitly. A pool can be shared only when the finished physical item is genuinely identical. Do not match by product name.
- Add allocation records for reserved, consumed and released quantities, retaining source pool IDs and component units. Preserve evidence when order lines are removed; historical records must not cascade away.
- Add immutable stock movements with actor, timestamp, signed state changes, reason, source/order/production reference and a unique operation key. Use typed pool references with database checks, not unchecked polymorphic IDs. Balance updates and movements commit together.
- Use guarded decrements and deterministic pool locking/order for both web and future POS. Retry/replayed operations are idempotent. Positive integer units, valid references and nonnegative available balances are enforced in the database and application.
- Keep physical quantities and sale capacity separate. Category totals count each physical pool once. Design capacities sharing blanks are never summed as extra inventory. Keep blank, print and finished totals separate.
- `On hand = available + reserved unconsumed + held` applies only to a physical item with all these states tracked. Consumed blanks are no longer on-hand blanks; finished output is another item. Do not derive historical on-hand figures by summing all unfulfilled orders.
- For stocktakes, compare the counted physical units with that item's tracked physical states, then apply the difference with a reason and version check. Allocated materials already used in production must not be counted as unused blanks. Until states are reconciled, keep the current field labelled **Available count**.

One shared location is sufficient. Keep a clear seam for future location IDs without adding multi-location screens now. A generic inventory-table rewrite, costing/valuation, barcode hardware, automatic purchasing, offline POS and a full work-centre system are outside this proposal.

## Proposed UI

Keep the current category tree and three shirt styles. Add stock views **Blanks & materials**, **Ready-made**, **Movements**, and **Needs review**. DTF prints remain a distinct material group. Keep categories expandable and searchable by name, colour, size or sale SKU.

In the product editor, add one **How is this item fulfilled?** selector. Show shared blank links for plain/printed items, print selection only for printed items, and finished-source links for ready-made items. Offer colour/size creation for ready-made stock without requiring a fake blank. Display a plain-language allocation preview before saving. Publishing checks the chosen rule's actual requirements.

Use explicit inventory actions: **Receive stock**, **Make stock**, **Adjust / count**, and **View history**. Receipts add units; adjustments show old → new, difference and required reason. Do not change quantity on blur. The simplest production action lives beside the selected product/size, with a preview of consumed inputs and output before confirmation.

Orders display **Materials reserved → Printing → Ready → Dispatched** for the relevant quantities. These are physical preparation states alongside the existing payment/delivery lifecycle. Staff should not have to understand database pool names. Movement rows show what happened, who did it, why, and the linked order or batch.

## Safe rollout and acceptance

1. **3A.1 — plain sales and movement foundation:** add explicit plain/printed rules and movement records for every production stock-writing path, including checkout, edits, cancellation and payment reconciliation. Keep existing products printed-to-order, draft rules intact, and on-hand claims deferred.
2. **3A.2 — production and ready-made stock:** add tracked allocations, consumed-material protection, order production actions, finished pools, completed batch preparation, supplier receipts and optional same-SKU ready-first/print-remainder allocation. Ready-made items go live only after a reviewed physical count and reconciliation. This slice must ship consumption-aware restoration together with production.
3. **3A.3 — stocktakes and inspected returns:** add physical-state counts, discrepancy history and explicit reusable/damaged dispositions. Then review POS checkout using the same allocation service.

Before enabling finished stock, staff must distinguish unused blanks, unused prints, ready-made goods, work in progress and materials held for open orders. Do not copy today's 175 available blank units into an on-hand or finished opening balance, infer quantities from photos, or deduct old production materials a second time. Legacy orders keep their frozen stock references and are marked as legacy allocations; ambiguous preparation state needs staff review rather than invented production history.

Verification must cover: plain sales with no print; shared plain/printed last-unit races; ready sales with zero raw components; batch inputs/output; consume-once order production; partial/mixed allocations if enabled; concurrent cancel/printing/payment failure; cancellation after printing; returned damaged items; count-versus-sale conflicts; retries without duplicate movements; product mode/mapping changes; archived/draft visibility; unchanged size IDs/SKUs, storefront URLs and existing order history. All availability surfaces—including feed, structured data, cards, low-stock filters and future POS—must agree.

Use a restored database for mutation tests, backups and data comparisons before additive migrations, and sequential capped checks after CPU/RAM/Docker inspection. Once new allocation types exist, the current two-pool-only application is not a safe rollback; retain a compatible release and prefer a verified fix forward.

**Approval boundary:** Stage 3A.1 was approved and deployed. Approve the next particular slice and its UI before implementation. The simulator remains a disconnected illustration; it does not change live stock.

## Reference patterns checked

These sources inform the proposal; Dressing Bear's model remains a small extension of its current system.

- Separating available, committed and physical on-hand quantities follows [Shopify's inventory states](https://help.shopify.com/en/manual/inventory-and-locations/fundamentals/inventory-states). The current application tracks available pools, so historical on-hand figures cannot be claimed from that guidance alone.
- Attributed quantity changes follow the adjustment-history pattern in [Shopify's inventory quantity guidance](https://help.shopify.com/en/manual/inventory-and-locations/adjusting-inventory). Physical counts are compared against recorded on-hand units and differences are recorded in [Shopify's stock-count workflow](https://help.shopify.com/en/manual/inventory-and-locations/inventory-counts).
- Simple component-to-finished conversion follows the pattern of [Odoo's one-step manufacturing](https://www.odoo.com/documentation/saas-19.3/applications/inventory_and_mrp/manufacturing/management/one_step_manufacturing.html). Variant-specific component assignments are described in [Odoo's variant BoM documentation](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/advanced_configuration/product_variants.html). No ERP adoption or multi-stage factory workflow is proposed.
