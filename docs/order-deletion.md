# Retained order deletion

Status: deployed as `dressingbear-app:order-delete-20261017`. WEB0069, WEB0070
and WEB0071 have been moved to Deleted through the authenticated server action.

Cancelled and delivered orders can be moved to Deleted from the orders list,
individually or in bulk. Restore returns an order to its normal list without
changing its status, payment outcome, payment review, items or stock balances.

The former hard-delete action failed for WEB0069, WEB0070 and WEB0071 because
each cancelled order had a payment-review event. `PaymentEvent.orderId` has a
restricting foreign key, so deleting the order would destroy the event's parent.
The action returned a generic error instead of explaining that conflict.

The replacement sets `Order.deletedAt` in a transaction after claiming the
order's current version, status and payment status. Single and bulk deletion
share that path. Active orders remain ineligible. Repeated deletion does not
restore stock or repeat a mutation. Neither deletion nor restoration sends
customer notifications or changes raw-material or print quantities.

Normal admin order lists and their counts exclude deleted orders. The Deleted
tab retains searchable access and a Restore action. Payment review deliberately
includes deleted orders with unresolved reviews, so removing a cancelled order
does not hide an outstanding payment concern. Detail pages identify retained
deleted orders. Customer history and historical reporting remain available.

Payment events, order items, notes, adjustments and gateway references remain
intact. Late callbacks continue to find the original order and follow existing
payment review rules. No foreign-key protection is weakened.

Migration `20261017090000_retained_order_deletion` adds only the nullable deletion
timestamp and its list index; existing orders initially remain visible. Deploy
the migration and regenerated Prisma client before the new app. An old app can
run against the added column, but would display retained deleted orders again.

Validation includes focused action/query/payment regressions, full TypeScript,
targeted lint, the production build, and HTTP action checks against an isolated
restored database for the three affected orders. Rollout evidence is retained
privately under `tmp/operations/order-delete-20261017/`.

All 139 focused tests, TypeScript, lint and the build passed. Candidate HTTP
checks passed for single deletion, bulk deletion, restoration and anonymous
deletion rejection. They verified unchanged payment events and blank/print
quantities and versions. The live migration preserved original records, and
live HTTPS and authenticated list checks passed. After moving the requested
orders, verification confirmed that they appear in Deleted and Payment review,
remain absent from normal lists, and retain their items and payment events.
All blank/print quantities and versions were unchanged by those actions.

Protected pre-release and cutover backups and the previous image
`dressingbear-app:before-order-delete-20261017` are retained. Tests and builds
ran sequentially in capped containers after CPU, RAM and Docker resource checks.
