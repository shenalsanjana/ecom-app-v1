# Design

Use a product boolean and immutable per-order-line snapshot with a nullable received timestamp. Shared notice/link rendering supplies product links and order references. Admin-only receipt confirmation controls reminders; WhatsApp clicks never count as submission. Checkout continues through every existing payment path. Additive schema and private Prisma generation allow isolated validation and app-only deployment.

Custom designs remain alongside the other product designs in their existing physical families and storefront subcategories. Do not create a separate custom-design collection. The two existing products already had the correct primary collections; remove only their redundant `custom-design-orders` additional placements and the now-empty collection through the existing admin deletion action, which invalidates catalog caches. Preserve product IDs, names, prices, images, stock bindings and primary collection membership.

On the low-memory build path only (`OVH_LOW_MEMORY_BUILD=1`), limit webpack parallelism to two module transforms. The isolated build retains a fixed container limit and a host memory reserve; unsuccessful attempts cannot replace the live app. Runtime purchase behavior is unchanged by this build setting.

Align the two existing custom-product descriptions with purchase-now/submit-PNG-after-checkout instructions, including the order number. Preserve material/size details and quote any additional design or printing charges for customer approval before printing. Use a backed-up, compare-and-update operation on only those two description fields before fresh production generation.
