// scripts/diagnose-checkout.ts
// Run with: npx tsx scripts/diagnose-checkout.ts
//
// Probes each component of the checkout side-effects (Order persistence,
// SMTP transport, RoyalExpress endpoint) to localize where things fail.
// Side-effects are deliberately minimal — no test email is sent, and the
// RoyalExpress probe uses an obviously-fake payload so it should be rejected
// by validation rather than create a real shipment.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local since `tsx` (unlike Next.js) does not auto-load it.
function loadEnv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, rawV] = m;
    const v = rawV.replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function maskMiddle(s: string, keep = 3): string {
  if (s.length <= keep * 2) return "*".repeat(s.length);
  return s.slice(0, keep) + "*".repeat(s.length - keep * 2) + s.slice(-keep);
}

async function reportEnv() {
  console.log("\n=== Env presence ===");
  const keys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "BRAND_EMAIL",
    "BRAND_NAME",
    "ROYAL_EXPRESS_API",
    "ROYAL_EXPRESS_USER",
    "ROYAL_EXPRESS_PASS",
  ];
  for (const k of keys) {
    const v = process.env[k];
    if (!v) {
      console.log(`  ${k}: MISSING`);
    } else if (k.endsWith("_PASS") || k === "SMTP_PASS") {
      console.log(`  ${k}: SET (${v.length} chars, ${maskMiddle(v)})`);
    } else {
      console.log(`  ${k}: ${v}`);
    }
  }
}

async function reportRecentOrders() {
  console.log("\n=== Recent orders ===");
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { items: true },
  });
  if (orders.length === 0) {
    console.log("  No orders in DB.");
    return;
  }
  for (const o of orders) {
    console.log(`\n  Order ${o.id}`);
    console.log(`    placed:                ${o.createdAt.toISOString()}`);
    console.log(`    user:                  ${o.userId ?? "(guest)"}`);
    console.log(`    guestEmail:            ${o.guestEmail ?? "—"}`);
    console.log(`    customerPhone:         ${o.customerPhone}`);
    console.log(`    total:                 ${o.total}`);
    console.log(`    payment:               ${o.paymentMethod} (${o.status})`);
    console.log(`    royalExpressSubmitted: ${o.royalExpressSubmitted}`);
    console.log(`    trackingCode:          ${o.trackingCode ?? "—"}`);
    console.log(`    emailSent:             ${o.emailSent}`);
    console.log(`    items:                 ${o.items.length}`);
  }
}

async function probeSmtp() {
  console.log("\n=== SMTP probe ===");
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, BRAND_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log("  SMTP env vars missing — would fail at runtime.");
    return;
  }
  const nodemailer = await import("nodemailer");
  const t = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  try {
    const ok = await t.verify();
    console.log(`  verify(): ${ok ? "OK (transport accepts auth)" : "returned falsy"}`);
  } catch (e) {
    console.error("  verify() failed:", e instanceof Error ? e.message : e);
    return;
  }

  if (process.argv.includes("--send")) {
    const to = BRAND_EMAIL ?? "dressingbear@gmail.com";
    const from = SMTP_FROM ?? "Dressing Bear <no-reply@example.com>";
    const stamp = new Date().toISOString();
    console.log(`  Sending DIAGNOSTIC email: from=${from}  to=${to}`);
    try {
      const info = await t.sendMail({
        from,
        to,
        subject: `DIAGNOSTIC ${stamp}`,
        text: `If you see this in your inbox, SMTP delivery is working end-to-end.\nIf you only see it in Spam/Junk, sender authentication (SPF/DKIM) is the problem.\nIf you don't see it at all, the relay accepted but the recipient dropped silently.\n\nFrom: ${from}\nTime: ${stamp}`,
      });
      console.log(`  sendMail() OK`);
      console.log(`  messageId: ${info.messageId}`);
      console.log(`  accepted:  ${JSON.stringify(info.accepted)}`);
      console.log(`  rejected:  ${JSON.stringify(info.rejected)}`);
      console.log(`  response:  ${info.response}`);
    } catch (e) {
      console.error("  sendMail() failed:", e instanceof Error ? e.message : e);
    }
  } else {
    console.log("  (Run with --send to actually send a diagnostic email.)");
  }
}

async function probeRoyalExpress() {
  console.log("\n=== RoyalExpress probe (intentionally bad payload — no real order created) ===");
  const url =
    process.env.ROYAL_EXPRESS_API ?? "https://royalexpress.merchant.curfox.com/add-new-order";
  const user = process.env.ROYAL_EXPRESS_USER;
  const pass = process.env.ROYAL_EXPRESS_PASS;
  console.log(`  URL: ${url}`);
  if (!user || !pass) {
    console.log("  Credentials missing — would skip submission at runtime.");
    return;
  }
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ probe: true }),
    });
    console.log(`  HTTP status: ${r.status} ${r.statusText}`);
    console.log(`  Content-Type: ${r.headers.get("content-type") ?? "—"}`);
    const body = await r.text();
    const head = body.slice(0, 600).replace(/\s+/g, " ").trim();
    console.log(`  Body (first 600 chars): ${head}`);
    if (r.status === 401 || r.status === 403) {
      console.log("  → Auth failed: credentials not accepted.");
    } else if (r.status === 404 || (r.headers.get("content-type") ?? "").includes("text/html")) {
      console.log("  → URL likely wrong: server is returning HTML, not a JSON API.");
    } else if (r.status >= 200 && r.status < 300) {
      console.log("  → Auth accepted; endpoint accepted (or quietly accepted) the probe.");
    } else if (r.status === 400 || r.status === 422) {
      console.log("  → Auth accepted; endpoint rejected the probe payload (expected).");
    } else {
      console.log("  → Unexpected status; manual investigation needed.");
    }
  } catch (e) {
    console.error("  fetch() failed:", e instanceof Error ? e.message : e);
  }
}

async function probeFromAddresses() {
  console.log("\n=== From-address comparison (--compare-from) ===");
  if (!process.argv.includes("--compare-from")) {
    console.log("  (Run with --compare-from to send two test emails using different From addresses.)");
    return;
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, BRAND_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log("  SMTP env vars missing.");
    return;
  }
  const to = BRAND_EMAIL ?? "dressingbear@gmail.com";
  const nodemailer = await import("nodemailer");
  const t = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const stamp = new Date().toISOString();

  const fromAddrs = [
    { label: "A: from gmail.com (likely fails DMARC)", from: process.env.SMTP_FROM ?? "Dressing Bear <dressingbear@gmail.com>" },
    { label: "B: from SMTP_USER (Brevo-aligned, should pass)", from: `Dressing Bear <${SMTP_USER}>` },
  ];

  for (const f of fromAddrs) {
    console.log(`\n  ${f.label}`);
    console.log(`    from: ${f.from}`);
    try {
      const info = await t.sendMail({
        from: f.from,
        to,
        subject: `FROM-TEST ${f.label.charAt(0)} ${stamp}`,
        text: `If only one of these (FROM-TEST A or FROM-TEST B) arrives, sender authentication is the problem.\n\nTime: ${stamp}\nLabel: ${f.label}\nFrom: ${f.from}`,
      });
      console.log(`    accepted: ${JSON.stringify(info.accepted)}  rejected: ${JSON.stringify(info.rejected)}`);
      console.log(`    response: ${info.response}`);
    } catch (e) {
      console.error("    FAILED:", e instanceof Error ? e.message : e);
    }
  }
}

async function probeOrderEmail() {
  console.log("\n=== Order email probe (real sendOrderConfirmationEmail) ===");
  if (!process.argv.includes("--send-order")) {
    console.log("  (Run with --send-order to send a test order email through the real code path.)");
    return;
  }
  const testEmail = process.env.DIAGNOSTIC_TO ?? process.env.BRAND_EMAIL ?? "dressingbear@gmail.com";
  const { sendOrderConfirmationEmail } = await import("../app/_lib/mailer");
  const stamp = new Date().toISOString();
  console.log(`  to (customer): ${testEmail}`);
  console.log(`  bcc (brand):   ${process.env.BRAND_EMAIL ?? "dressingbear@gmail.com"}`);
  try {
    await sendOrderConfirmationEmail({
      orderId: `DIAG-${Date.now()}`,
      customerName: "Diagnostic Test",
      customerEmail: testEmail,
      customerPhone: "+94 700000000",
      items: [{ name: "Diagnostic Item", price: 1850, quantity: 1 }],
      subtotal: 1850,
      shipping: 350,
      total: 2200,
      shippingAddress: {
        line1: "Diagnostic Address",
        city: "Colombo",
        region: "Western",
        postalCode: "00100",
        country: "Sri Lanka",
      },
      paymentMethod: "COD",
      paymentMethodDisplay: "Cash on Delivery",
    });
    console.log(`  sendOrderConfirmationEmail() resolved at ${stamp}`);
    console.log("  Check inbox AND spam at the address above.");
  } catch (e) {
    console.error("  sendOrderConfirmationEmail() threw:", e instanceof Error ? e.message : e);
  }
}

async function main() {
  await reportEnv();
  await reportRecentOrders();
  await probeSmtp();
  await probeFromAddresses();
  await probeOrderEmail();
  await probeRoyalExpress();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
