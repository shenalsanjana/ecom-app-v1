import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../app/_lib/prisma";

const EMAIL = "payherepurchase@example.com";
const PASSWORD = "TestPass123!";
const NAME = "PayHere Purchase Test";

async function createPayhereOrder(orderId: string, overrides: { paymentStatus?: string; userId?: string | null; guestEmail?: string } = {}) {
  const product = await prisma.product.findFirst({ select: { id: true } });
  const total = 3450;
  return prisma.order.create({
    data: {
      id: orderId,
      userId: overrides.userId ?? null,
      guestName: NAME,
      guestEmail: overrides.guestEmail ?? EMAIL,
      customerPhone: "0771234567",
      shippingLine1: "456 Purchase Ave",
      shippingLine2: null,
      shippingCity: "Colombo",
      shippingCountry: "Sri Lanka",
      subtotal: 3100,
      shippingCost: 350,
      total,
      paymentMethod: "PAYHERE",
      paymentMethodDisplay: "PayHere",
      paymentStatus: overrides.paymentStatus ?? "PENDING",
      status: "PENDING",
      webNumber: `WEB${Date.now()}`,
      items: {
        create: [
          {
            productId: product?.id ?? "fallback-product",
            name: "Purchase Test Dress",
            size: "M",
            price: 3100,
            quantity: 1,
          },
        ],
      },
    },
    include: { items: true },
  });
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

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
});

test.afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (user) {
    await prisma.order.deleteMany({ where: { userId: user.id } });
  }
  await prisma.order.deleteMany({ where: { guestEmail: EMAIL } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.product.updateMany({
    where: { stock: { lt: 10 } },
    data: { stock: 20 },
  });
  await prisma.$disconnect();
});

// ── Test 1: Success page shows "Payment Confirmed!" for a PAID order ─────────

test("success page shows Payment Confirmed for a PAID PayHere order", async ({ page }) => {
  // Create an order already marked PAID, matching the post-webhook state.
  const orderId = `ORD-E2E-PURCHASE-${Date.now()}`;
  await createPayhereOrder(orderId, { paymentStatus: "PAID" });

  // Navigate to the return URL just like PayHere would redirect.
  await page.goto(`/checkout/success?order_id=${orderId}`);

  // Verify "Payment Confirmed!" heading.
  await expect(page.getByRole("heading", { name: /Payment Confirmed!/i })).toBeVisible({ timeout: 10_000 });

  // Order reference (webNumber) displayed.
  await expect(page.getByText(/WEB\d+/)).toBeVisible();

  // Order total shown.
  await expect(page.getByText("Order Total")).toBeVisible();
  await expect(page.getByText(/Rs\.?/) ).toBeVisible();

  // Items listed.
  await expect(page.getByText("Purchase Test Dress")).toBeVisible();

  // Continue Shopping CTA.
  await expect(page.getByRole("link", { name: /Continue Shopping/i })).toBeVisible();
});

// ── Test 2: Cancel page shows "Payment Cancelled" with retry option ──────────

test("cancel page shows Payment Cancelled with retry option", async ({ page }) => {
  const orderId = `ORD-E2E-CANCEL-${Date.now()}`;
  await createPayhereOrder(orderId);

  // Navigate with status=cancelled — simulating PayHere's cancel redirect.
  await page.goto(`/checkout/success?status=cancelled&order_id=${orderId}`);

  // "Payment Cancelled" heading.
  await expect(page.getByRole("heading", { name: /Payment Cancelled/i })).toBeVisible({ timeout: 10_000 });

  // Explanatory text.
  await expect(page.getByText(/Your payment was cancelled/i)).toBeVisible();

  // "Try Again" link back to checkout.
  const tryAgain = page.getByRole("link", { name: /Try Again/i });
  await expect(tryAgain).toBeVisible();
  await expect(tryAgain).toHaveAttribute("href", "/checkout");

  // Also has "Continue Shopping".
  await expect(page.getByRole("link", { name: /Continue Shopping/i })).toBeVisible();
});

// ── Test 3: Invalid / missing order ID on success page ───────────────────────

test("success page shows not-found for non-existent order", async ({ page }) => {
  const res = await page.goto("/checkout/success?order_id=NONEXISTENT-99999");

  // Should return a 404 status.
  expect(res?.status()).toBe(404);
});

// ── Test 4: Guest checkout with PayHere ──────────────────────────────────────

test("guest checkout with PayHere creates PENDING order", async ({ page }) => {
  // Add item to cart without logging in.
  await page.goto("/categories");
  const addBtn = page.getByRole("button", { name: /^Add to cart$/i }).first();
  await expect(addBtn).toBeVisible({ timeout: 10_000 });
  await addBtn.click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const sizeButtons = dialog.locator('button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
    await expect(sizeButtons.first()).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
  }

  const dialogAdd = dialog.getByRole("button", { name: /^Add to cart$/i });
  await expect(dialogAdd).toBeEnabled({ timeout: 3_000 });
  await dialogAdd.click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });

  // Go to checkout — should show guest fields.
  await page.goto("/checkout");

  // Verify guest form is visible.
  await expect(page.getByLabel(/Full Name/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel(/Email/i)).toBeVisible();

  // Fill guest details.
  await page.getByLabel(/Full Name/i).fill("Guest Buyer");
  await page.getByLabel(/Email/i).fill("guest-buyer@example.com");
  await page.getByLabel(/Phone Number/i).fill("0779876543");
  await page.getByLabel(/Address Line 1/i).fill("789 Guest Road");
  await page.locator("#city").selectOption("Colombo");

  // Select PayHere.
  await page.getByRole("radio", { name: /PayHere/i }).check();

  // Submit.
  await page.getByRole("button", { name: /Pay with PayHere/i }).click();

  // Wait for redirect to PayHere domain (or error page if gateway unreachable).
  await page.waitForURL(/^https?:\/\/(?!localhost)/, { timeout: 30_000 }).catch(() => {
    // Gateway may be unreachable in test env — order should still be created.
  });

  // Verify order in DB: guest order with no userId.
  const guestOrder = await prisma.order.findFirst({
    where: { guestEmail: "guest-buyer@example.com" },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });

  expect(guestOrder).not.toBeNull();
  expect(guestOrder!.userId).toBeNull();
  expect(guestOrder!.paymentMethod).toBe("PAYHERE");
  expect(guestOrder!.paymentStatus).toBe("PENDING");
  expect(guestOrder!.webNumber).toMatch(/^WEB\d{4,}$/);
  expect(guestOrder!.items.length).toBeGreaterThan(0);
});

// ── Test 5: Full loop — checkout → webhook → success page ────────────────────

test("full PayHere checkout creates PENDING order, then verified state confirms", async ({ page }) => {
  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL("**/", { timeout: 10_000 });

  // Add item to cart.
  await page.goto("/categories");
  const addBtn = page.getByRole("button", { name: /^Add to cart$/i }).first();
  await expect(addBtn).toBeVisible({ timeout: 10_000 });
  await addBtn.click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  const sizeButtons = dialog.locator('button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
    await expect(sizeButtons.first()).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
  }

  const dialogAdd = dialog.getByRole("button", { name: /^Add to cart$/i });
  await expect(dialogAdd).toBeEnabled({ timeout: 3_000 });
  await dialogAdd.click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });

  // Checkout with PayHere.
  await page.goto("/checkout");
  await page.getByLabel(/Phone Number/i).fill("0771234567");
  await page.getByLabel(/Address Line 1/i).fill("123 Loop St");
  await page.locator("#city").selectOption("Colombo");
  await page.getByRole("radio", { name: /PayHere/i }).check();
  await page.getByRole("button", { name: /Pay with PayHere/i }).click();

  // Wait for PayHere redirect.
  await page.waitForURL(/^https?:\/\/(?!localhost)/, { timeout: 30_000 }).catch(() => {});

  // Grab the order from DB.
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  expect(user).not.toBeNull();

  const order = await prisma.order.findFirst({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  expect(order).not.toBeNull();
  expect(order!.paymentStatus).toBe("PENDING");
  const orderId = order!.id;

  // Simulate the state after a verified PayHere webhook. The webhook itself
  // cross-checks with PayHere's Merchant API and is covered by route tests.
  await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID" } });

  // Verify order is PAID in DB.
  const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
  expect(updatedOrder!.paymentStatus).toBe("PAID");

  // Navigate to the return URL (as PayHere would redirect after payment).
  await page.goto(`/checkout/success?order_id=${orderId}`);

  // Verify success page shows "Payment Confirmed!".
  await expect(page.getByRole("heading", { name: /Payment Confirmed!/i })).toBeVisible({ timeout: 10_000 });

  // Order reference visible.
  await expect(page.getByText(order!.webNumber!)).toBeVisible();

  // Items from the real checkout flow are listed.
  await expect(page.getByText("Items Ordered")).toBeVisible();
  expect(order!.items.length).toBeGreaterThan(0);
  await expect(page.getByText(order!.items[0].name)).toBeVisible();

  // Total matches.
  await expect(page.getByText("Order Total")).toBeVisible();

  // Continue Shopping link.
  await expect(page.getByRole("link", { name: /Continue Shopping/i })).toBeVisible();
});
