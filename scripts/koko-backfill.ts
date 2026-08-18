// Repairs Koko orders that were paid at the gateway but left at
// paymentStatus=PENDING by the `content.status` parsing bug (fixed 2026-08-18 in
// app/_lib/payments/koko.ts). For each unpaid KOKO order it re-asks Koko's
// orderView and flips ONLY those Koko itself reports as SUCCESS.
//
// Safety rules, deliberate:
//   - Dry-run by default. Nothing is written without --apply.
//   - Only ever promotes PENDING -> PAID. It never cancels or fails an order:
//     these orders are already CONFIRMED/DISPATCHED/DELIVERED, so an automated
//     cancellation would be far more damaging than a stale status. Non-SUCCESS
//     orders are listed for a human to judge.
//   - Notifications are OFF by default. A bare status flip is the right repair
//     for orders that already shipped — sending "your order is confirmed" for an
//     order delivered weeks ago would confuse the customer. Pass --notify to run
//     the full finalization path (email/SMS) for genuinely fresh orders.
//
// Usage:
//   npx tsx scripts/koko-backfill.ts                # dry run, shows what it would do
//   npx tsx scripts/koko-backfill.ts --apply        # flip verified-paid orders to PAID
//   npx tsx scripts/koko-backfill.ts --apply --notify   # ...and send confirmations
import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

// On the VPS host shell DATABASE_URL names the docker-network host `postgres`,
// which does not resolve outside the compose network; postgres is published on
// 127.0.0.1:5432.
function rewriteDatabaseUrlForHostShell() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (url.hostname === "postgres") {
      url.hostname = "127.0.0.1";
      process.env.DATABASE_URL = url.toString();
      console.log("(rewrote DATABASE_URL host postgres -> 127.0.0.1 for host-shell access)\n");
    }
  } catch {
    /* leave as-is; prisma will report the real problem */
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const notify = args.includes("--notify");

  rewriteDatabaseUrlForHostShell();

  const { prisma } = await import("../app/_lib/prisma");
  const { fetchKokoOrderStatus } = await import("../app/_lib/payments/koko");

  const candidates = await prisma.order.findMany({
    where: {
      paymentMethod: "KOKO",
      paymentStatus: { notIn: ["PAID", "PAYMENT_FAILED"] },
    },
    select: {
      id: true,
      webNumber: true,
      paymentStatus: true,
      status: true,
      total: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Mode      : ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`Notifies  : ${notify ? "YES — full finalization" : "no — bare status flip"}`);
  console.log(`Candidates: ${candidates.length} KOKO order(s) not yet PAID\n`);

  if (candidates.length === 0) {
    console.log("Nothing to repair.");
    return;
  }

  const promote: typeof candidates = [];
  const review: { order: (typeof candidates)[number]; kokoStatus: string }[] = [];

  for (const order of candidates) {
    const kokoStatus = await fetchKokoOrderStatus(order.id);
    const label = `${order.webNumber ?? order.id}  ${order.id}  status=${order.status}  LKR ${order.total.toFixed(2)}`;
    if (kokoStatus === "SUCCESS") {
      console.log(`  PAID at Koko    ${label}`);
      promote.push(order);
    } else {
      console.log(`  ${kokoStatus.padEnd(15)} ${label}  -> left alone, needs human review`);
      review.push({ order, kokoStatus });
    }
  }

  console.log();
  console.log(`Verified paid at Koko : ${promote.length}`);
  console.log(`Needs review          : ${review.length}`);

  if (!apply) {
    console.log("\nDry run — nothing was written. Re-run with --apply to repair.");
    return;
  }

  if (promote.length === 0) {
    console.log("\nNo orders to promote.");
    return;
  }

  console.log(`\nApplying to ${promote.length} order(s)...`);
  for (const order of promote) {
    const ref = order.webNumber ?? order.id;
    try {
      if (notify) {
        const { finalizePaidPayment } = await import("../app/_lib/payments/order-finalization");
        const result = await finalizePaidPayment(order.id, "KOKO");
        console.log(`  ${ref}: finalized -> ${result.status}`);
      } else {
        // Conditional update mirrors finalizePaidPayment's atomic claim so a
        // concurrent live callback can never double-apply.
        const claim = await prisma.order.updateMany({
          where: { id: order.id, paymentStatus: { not: "PAID" } },
          data: { paymentStatus: "PAID" },
        });
        console.log(`  ${ref}: ${claim.count === 1 ? "marked PAID" : "already PAID (skipped)"}`);
      }
    } catch (err) {
      console.error(`  ${ref}: FAILED —`, err instanceof Error ? err.message : err);
    }
  }
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
