// Reads the lifecycle fields on the most-recent orders to figure out where
// the dispatch flow stopped for each. No external calls, no side effects.
//
// Lifecycle fields on Order:
//   - paymentMethod / paymentStatus: did the order even need a Curfox booking?
//   - courierBookedAt:   set when Curfox returned a waybill
//   - courierWaybillNumber:   the actual waybill (also stored as trackingCode)
//   - courierLastError / courierLastErrorAt: most recent Curfox-side failure
//   - dispatchPdfFetchedAt: set when the waybill PDF was downloaded
//   - dispatchEmailSentAt: set when the dispatch email was actually sent
//   - adminAlertSentAt:   set when a failure alert was emailed
//   - royalExpressSubmitted: set true after first successful booking
//
// The pattern of NULL vs non-NULL across these fields pinpoints the bottleneck.
import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import { prisma } from "../app/_lib/prisma";

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      webNumber: true,
      rbNumber: true,
      createdAt: true,
      paymentMethod: true,
      paymentStatus: true,
      shippingCity: true,
      total: true,
      status: true,
      // Lifecycle
      royalExpressSubmitted: true,
      courierWaybillNumber: true,
      courierBookedAt: true,
      courierLastError: true,
      courierLastErrorAt: true,
      dispatchPdfFetchedAt: true,
      dispatchEmailSentAt: true,
      adminAlertSentAt: true,
      emailSent: true, // customer confirmation email
    },
  });

  if (orders.length === 0) {
    console.log("No orders in the DB.");
    return;
  }

  for (const o of orders) {
    console.log("─".repeat(70));
    console.log(
      `${o.webNumber ?? o.rbNumber ?? o.id}  •  ${o.createdAt.toISOString()}  •  ${o.paymentMethod}  •  ${o.shippingCity}  •  LKR ${o.total}`,
    );
    console.log("  status:                  ", o.status);
    console.log("  paymentStatus:           ", o.paymentStatus ?? "(null)");
    console.log("  emailSent (customer):    ", o.emailSent);
    console.log("  royalExpressSubmitted:   ", o.royalExpressSubmitted);
    console.log("  courierWaybillNumber:    ", o.courierWaybillNumber ?? "(null)");
    console.log("  courierBookedAt:         ", o.courierBookedAt?.toISOString() ?? "(null)");
    console.log("  dispatchPdfFetchedAt:    ", o.dispatchPdfFetchedAt?.toISOString() ?? "(null)");
    console.log("  dispatchEmailSentAt:     ", o.dispatchEmailSentAt?.toISOString() ?? "(null)");
    console.log("  adminAlertSentAt:        ", o.adminAlertSentAt?.toISOString() ?? "(null)");
    if (o.courierLastError) {
      console.log("  courierLastErrorAt:      ", o.courierLastErrorAt?.toISOString() ?? "(null)");
      console.log("  courierLastError:");
      console.log("    ", o.courierLastError);
    }

    // Diagnostic verdict
    const verdict =
      o.paymentMethod !== "COD"
        ? "Prepaid order → dispatch booking deferred until payment confirmed (expected, no email yet)."
        : !o.courierBookedAt
        ? `COD order, but Curfox booking NEVER COMPLETED. ${o.courierLastError ? "See courierLastError above." : "And no recorded error — booking step didn't reach the catch block."}`
        : !o.dispatchEmailSentAt
        ? "Curfox booking SUCCEEDED but dispatch EMAIL never sent. PDF status: " +
          (o.dispatchPdfFetchedAt ? "fetched" : "missing")
        : "All steps completed: dispatched + emailed. Email arrived?";
    console.log("  → verdict:", verdict);
  }
}

main().finally(() => prisma.$disconnect());
