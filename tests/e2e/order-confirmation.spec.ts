import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../app/_lib/prisma";

const EMAIL = "ordertest@example.com";
const PASSWORD = "TestPass123!";
const NAME = "Order Test";

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, name: NAME },
    create: { name: NAME, email: EMAIL, passwordHash },
  });
  // Ensure all products have enough stock so the test is idempotent across runs.
  await prisma.product.updateMany({
    where: { stock: { lt: 10 } },
    data: { stock: 20 },
  });
});

test.afterAll(async () => {
  // Delete this user's orders first to satisfy FK constraint, then the user.
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (user) {
    await prisma.order.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  // Restore stock that may have been decremented during the test.
  await prisma.product.updateMany({
    where: { stock: { lt: 10 } },
    data: { stock: 20 },
  });
  await prisma.$disconnect();
});

test("COD order shows RB number and payment-status badge on /account/orders", async ({ page }) => {
  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL("**/", { timeout: 10_000 });

  // Add an item to the cart via the categories page quick-add dialog.
  await page.goto("/categories");

  // Wait for at least one product card trigger to be visible before clicking.
  const firstTrigger = page.getByRole("button", { name: /^Add to cart$/i }).first();
  await expect(firstTrigger).toBeVisible({ timeout: 10_000 });
  await firstTrigger.click();

  // Wait for the dialog to be fully visible before interacting.
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // If the dialog shows size buttons (aria-pressed attribute), pick the first.
  // Must click a size before "Add to cart" is enabled when sizes are required.
  const dialogSizeButtons = dialog.locator('button[aria-pressed]');
  if ((await dialogSizeButtons.count()) > 0) {
    await dialogSizeButtons.first().click();
    // Wait for the button to register as selected (aria-pressed="true").
    await expect(dialogSizeButtons.first()).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
  }

  // Click the "Add to cart" button inside the dialog to confirm.
  // This button is enabled once a size is selected (or if no sizes are required).
  const dialogAddBtn = dialog.getByRole("button", { name: /^Add to cart$/i });
  await expect(dialogAddBtn).toBeEnabled({ timeout: 3_000 });
  await dialogAddBtn.click();

  // Wait for the dialog to close (auto-closes after 900ms on success).
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });

  // Go to checkout and fill the form.
  await page.goto("/checkout");
  await page.getByLabel(/Phone Number/i).fill("0771234567");
  await page.getByLabel(/Address Line 1/i).fill("123 Test St");
  await page.locator("#city").selectOption("Colombo");

  // COD is the default payment method; no need to change it.
  // The submit button text for COD is "Place Order (Cash on Delivery)".
  await page.getByRole("button", { name: /Place Order/i }).click();

  // The checkout client renders an inline success view (no redirect).
  // Wait for the "Order Confirmed!" heading — allow up to 30s for the server
  // action (DB + optional courier booking + email) to complete.
  await expect(page.getByRole("heading", { name: "Order Confirmed!" })).toBeVisible({
    timeout: 30_000,
  });

  // Navigate to the orders page to verify the RB number and payment-status badge.
  await page.goto("/account/orders");

  // RB number appears as the card title headline (e.g. "RB1001").
  await expect(page.getByText(/RB\d+/)).toBeVisible({ timeout: 5_000 });

  // Payment-status badge for COD shows "Cash on delivery" (from paymentStatusLabel).
  await expect(page.getByText(/Cash on delivery/i).first()).toBeVisible({ timeout: 5_000 });
});
