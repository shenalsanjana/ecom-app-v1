# Implementation plan

1. Add Product.isCustomizedDesign, OrderItem.isCustomizedDesign and OrderItem.designReceivedAt; enable only the two known custom products and corresponding existing order lines.
2. Add admin flag persistence and UI. Build shared WhatsApp message/link and notice components; reuse the business number.
3. Show product and checkout notices; snapshot requirements in online/POS/admin order creation/replacement; show confirmation/history reminders.
4. Add authenticated, audited per-item admin receipt controls. A click on WhatsApp never marks the design as received.
5. Validate meaningful unit and isolated database/browser flows, scoped types/lint and bounded build using a private generated Prisma client.
6. Archive/integrate, apply the additive migration safely, regenerate production data, canary and activate app only with rollback; verify live pages without submitting orders or messaging WhatsApp.

Catalog correction completed before the feature deployment: removed exactly two redundant additional memberships and the empty Custom Design Orders collection; live browser verified the separate tile is absent and both custom products remain within the tote and cotton canvas pouch subcategories. No container restart was needed. Evidence: ignored `tmp/custom-design-taxonomy/{before,result}.json` and `accessories-after.png`.
