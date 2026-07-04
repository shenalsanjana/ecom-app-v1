import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import { test, expect } from "@playwright/test";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../app/_lib/prisma";

const EMAIL = "payheretest@example.com";
const PASSWORD = "TestPass123!";
const NAME = "PayHere Test";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Compute the MD5 signature PayHere expects for webhook callbacks. */
function signPayHereWebhook(params: {
  merchantId: string;
  orderId: string;
  amount: string;
  currency: string;
  statusCode: string;
}): string {
  const secret = process.env.PAYHERE_MERCHANT_SECRET ?? "";
  const hashedSecret = crypto.createHash("md5").update(secret).digest("hex").toUpperCase();
  const str = `${params.merchantId}${params.orderId}${params.amount}${params.currency}${params.statusCode}${hashedSecret}`;
  return crypto.createHash("md5").update(str).digest("hex").toUpperCase();
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Cached product ID from seed data — used for DB order creation in webhook tests. */
let seedProductId: string | null = null;

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, name: NAME },
    create: { name: NAME, email: EMAIL, passwordHash },
  });
  await prisma.product.updateMany({
    where: { stock: { lt: 10 } },
    data: { stock: 20 },
  });
  // Fetch an existing product to satisfy FK constraint on orderItems.
  const firstProduct = await prisma.product.findFirst({ select: { id: true } });
  seedProductId = firstProduct?.id ?? null;
});

test.afterAll(async () => {
  // Delete orders created by the E2E user (via checkout flow).
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (user) {
    await prisma.order.deleteMany({ where: { userId: user.id } });
  }
  // Delete webhook test orders created with guestEmail (no userId).
  await prisma.order.deleteMany({ where: { guestEmail: EMAIL } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.product.updateMany({
    where: { stock: { lt: 10 } },
    data: { stock: 20 },
  });
  await prisma.$disconnect();
});

// ── Test: PayHere checkout creates order in PENDING state ───────────────────

test("PayHere checkout creates order with PENDING payment status", async ({ page }) => {
  // Navigate to the app first so requests go through the local server.
  await page.goto("/");
  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email or Mobile Number").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL("**/", { timeout: 10_000 });

  // Add an item to the cart via the categories page quick-add dialog.
  await page.goto("/categories");
  const firstTrigger = page.getByRole("button", { name: /^Add to cart$/i }).first();
  await expect(firstTrigger).toBeVisible({ timeout: 10_000 });
  await firstTrigger.click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const dialogSizeButtons = dialog.locator('button[aria-pressed]');
  if ((await dialogSizeButtons.count()) > 0) {
    await dialogSizeButtons.first().click();
    await expect(dialogSizeButtons.first()).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
  }

  const dialogAddBtn = dialog.getByRole("button", { name: /^Add to cart$/i });
  await expect(dialogAddBtn).toBeEnabled({ timeout: 3_000 });
  await dialogAddBtn.click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });

  // Go to checkout and fill the form.
  await page.goto("/checkout");
  await page.locator('[data-testid="contact-phone"]').fill("0771234567");
  await page.getByLabel(/Address Line 1/i).fill("123 Test St");
  await page.locator("#city").selectOption("Colombo");

  // Select PayHere payment method (default is COD).
  await page.getByRole("radio", { name: /PayHere/i }).check();

  // The PayHere submit button text is "Pay with PayHere".
  await page.getByRole("button", { name: /Pay with PayHere/i }).click();

  // The client redirects to PayHere's domain via window.location.href.
  // Wait until the URL is no longer on our domain (redirect happened).
  await page.waitForURL(/^https?:\/\/(?!localhost)/, { timeout: 30_000 }).catch(() => {
    // If redirect didn't happen (e.g., network issue), the order may still
    // have an error shown on page. Let the DB check below handle it.
  });

  // Verify the order was created in PENDING state via Prisma.
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  expect(user).not.toBeNull();

  const order = await prisma.order.findFirst({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });

  expect(order).not.toBeNull();
  expect(order!.paymentMethod).toBe("PAYHERE");
  expect(order!.paymentStatus).toBe("PENDING");
  expect(order!.webNumber).toMatch(/^WEB\d{4,}$/);
  expect(order!.items.length).toBeGreaterThan(0);
});

// ── Test: Signed webhook without Merchant API confirmation stays pending ─────

test("PayHere webhook with valid signature but no PayHere API match stays PENDING", async ({ request }) => {
  // Create a test order directly in the database to simulate what checkout created.
  const orderId = `ORD-E2E-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });

  const total = 2440;
  await prisma.order.create({
    data: {
      id: orderId,
      userId: user?.id ?? null,
      guestName: NAME,
      guestEmail: EMAIL,
      customerPhone: "0771234567",
      shippingLine1: "123 Test St",
      shippingLine2: null,
      shippingCity: "Colombo",
      shippingCountry: "Sri Lanka",
      subtotal: 2090,
      shippingCost: 350,
      total,
      paymentMethod: "PAYHERE",
      paymentMethodDisplay: "PayHere",
      paymentStatus: "PENDING",
      status: "PENDING",
      webNumber: `WEB${Date.now()}`,
      items: {
        create: [
          {
            productId: seedProductId ?? "fallback-product",
            name: "PayHere Test Shirt",
            size: "M",
            price: 2090,
            quantity: 1,
          },
        ],
      },
    },
  });

  // Confirm it starts as PENDING.
  const before = await prisma.order.findUnique({ where: { id: orderId } });
  expect(before!.paymentStatus).toBe("PENDING");

  // Build the webhook payload with a valid signature.
  const merchantId = process.env.PAYHERE_MERCHANT_ID ?? "256312";
  const currency = "LKR";
  const statusCode = "2";
  const amount = total.toFixed(2);

  const md5sig = signPayHereWebhook({
    merchantId,
    orderId,
    amount,
    currency,
    statusCode,
  });

  const body = new URLSearchParams({
    payment_id: `pmt-e2e-${Date.now()}`,
    merchant_id: merchantId,
    order_id: orderId,
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: statusCode,
    md5sig,
  });

  // POST directly to the webhook endpoint (simulating PayHere's callback).
  const response = await request.post("/api/payhere/webhook", {
    data: body.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json.status).toBe("verification_failed");

  // Verify the order remains pending until PayHere's Merchant API confirms it.
  const after = await prisma.order.findUnique({ where: { id: orderId } });
  expect(after!.paymentStatus).toBe("PENDING");
});

// ── Test: Webhook with invalid signature is rejected ────────────────────────

test("PayHere webhook with invalid signature returns 403", async ({ request }) => {
  const orderId = `ORD-E2E-INVALID-${Date.now()}`;

  await prisma.order.create({
    data: {
      id: orderId,
      guestName: NAME,
      guestEmail: EMAIL,
      customerPhone: "0771234567",
      shippingLine1: "123 Test St",
      shippingCity: "Colombo",
      shippingCountry: "Sri Lanka",
      subtotal: 2090,
      shippingCost: 350,
      total: 2440,
      paymentMethod: "PAYHERE",
      paymentMethodDisplay: "PayHere",
      paymentStatus: "PENDING",
      status: "PENDING",
      webNumber: `WEB${Date.now()}`,
      items: {
        create: [
          {
            productId: seedProductId ?? "fallback-product",
            name: "Invalid Sig Shirt",
            size: "M",
            price: 2090,
            quantity: 1,
          },
        ],
      },
    },
  });

  const body = new URLSearchParams({
    payment_id: `pmt-e2e-invalid-${Date.now()}`,
    merchant_id: process.env.PAYHERE_MERCHANT_ID ?? "256312",
    order_id: orderId,
    payhere_amount: "2440.00",
    payhere_currency: "LKR",
    status_code: "2",
    md5sig: "INVALIDSIGNATURE000000000000000000",
  });

  const response = await request.post("/api/payhere/webhook", {
    data: body.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  expect(response.status()).toBe(403);

  // Order should remain PENDING after rejected webhook.
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  expect(order!.paymentStatus).toBe("PENDING");
});

// ── Test: Webhook without a secret configured is handled gracefully ─────────
// (We cannot unset env vars mid-test, so we skip this in normal runs.
//  Instead, test webhook idempotency: duplicate webhooks are ignored.)

test("duplicate PayHere webhook is idempotent (already_processed)", async ({ request }) => {
  const orderId = `ORD-E2E-DUP-${Date.now()}`;

  await prisma.order.create({
    data: {
      id: orderId,
      guestName: NAME,
      guestEmail: EMAIL,
      customerPhone: "0771234567",
      shippingLine1: "123 Test St",
      shippingCity: "Colombo",
      shippingCountry: "Sri Lanka",
      subtotal: 2090,
      shippingCost: 350,
      total: 2440,
      paymentMethod: "PAYHERE",
      paymentMethodDisplay: "PayHere",
      paymentStatus: "PAID", // already paid
      status: "PENDING",
      webNumber: `WEB${Date.now()}`,
      items: {
        create: [
          {
            productId: seedProductId ?? "fallback-product",
            name: "Duplicate Webhook Shirt",
            size: "L",
            price: 2090,
            quantity: 1,
          },
        ],
      },
    },
  });

  const merchantId = process.env.PAYHERE_MERCHANT_ID ?? "256312";
  const md5sig = signPayHereWebhook({
    merchantId,
    orderId,
    amount: "2440.00",
    currency: "LKR",
    statusCode: "2",
  });

  const body = new URLSearchParams({
    payment_id: `pmt-e2e-dup-${Date.now()}`,
    merchant_id: merchantId,
    order_id: orderId,
    payhere_amount: "2440.00",
    payhere_currency: "LKR",
    status_code: "2",
    md5sig,
  });

  const response = await request.post("/api/payhere/webhook", {
    data: body.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json.status).toBe("already_processed");
});

// ── Test: PayHere order shows "Paid" badge on /account/orders ───────────────

test("PayHere order shows Paid badge on /account/orders after webhook", async ({ page }) => {
  await page.goto("/");

  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email or Mobile Number").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL("**/", { timeout: 10_000 });

  // Create a PAYHERE order directly in DB and mark it PAID (simulating webhook already processed).
  const orderId = `ORD-E2E-BADGE-${Date.now()}`;
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });

  await prisma.order.create({
    data: {
      id: orderId,
      userId: user?.id ?? null,
      guestName: NAME,
      guestEmail: EMAIL,
      customerPhone: "0771234567",
      shippingLine1: "123 Test St",
      shippingCity: "Colombo",
      shippingCountry: "Sri Lanka",
      subtotal: 2090,
      shippingCost: 350,
      total: 2440,
      paymentMethod: "PAYHERE",
      paymentMethodDisplay: "PayHere",
      paymentStatus: "PAID",
      status: "PENDING",
      webNumber: `WEB${Date.now()}`,
      items: {
        create: [
          {
            productId: seedProductId ?? "fallback-product",
            name: "Badge Test Shirt",
            size: "M",
            price: 2090,
            quantity: 1,
          },
        ],
      },
    },
  });

  // Navigate to /account/orders and verify the "Paid" status badge.
  await page.goto("/account/orders");

  // The webNumber should be visible as the card title.
  await expect(page.getByText(/WEB\d+/)).toBeVisible({ timeout: 5_000 });

  // Paid status badge (paymentStatusLabel("PAID") returns "Paid").
  // Use a case-anchored match to target the badge specifically.
  await expect(page.getByText(/^Paid$/)).toBeVisible({ timeout: 5_000 });
});
