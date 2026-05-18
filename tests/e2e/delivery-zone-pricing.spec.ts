import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../app/_lib/prisma";

const EMAIL = "deliverytest@example.com";
const PASSWORD = "TestPass123!";
const NAME = "Delivery Test";

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, name: NAME },
    create: { name: NAME, email: EMAIL, passwordHash },
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test("checkout delivery cost flips between Colombo (Rs.350) and Other (Rs.450)", async ({ page }) => {
  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL("**/", { timeout: 10_000 });

  // Navigate to the categories page and use the quick "Add to cart" dialog
  // on the first product card — no navigation to product page needed.
  await page.goto("/categories");

  // The AddToCartDialog trigger has aria-label="Add to cart" on each card.
  // Click the first one to open the size-picker / add-to-cart dialog.
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();

  // If the dialog shows size buttons (aria-pressed attribute), pick the first.
  const dialogSizeButtons = page.locator('[role="dialog"] button[aria-pressed]');
  const dialogSizeCount = await dialogSizeButtons.count();
  if (dialogSizeCount > 0) {
    await dialogSizeButtons.first().click();
  }

  // Click the "Add to cart" button inside the dialog to confirm.
  await page.locator('[role="dialog"]').getByRole("button", { name: /^Add to cart$/i }).click();

  // Wait for the dialog to close (the dialog auto-closes after 900ms on success).
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });

  await page.goto("/checkout");

  // Fill phone number (label: "Phone Number *").
  await page.getByLabel(/Phone Number/i).fill("0771234567");
  // Fill address line 1 (label: "Address Line 1 *").
  await page.getByLabel(/Address Line 1/i).fill("123 Test St");

  // Scope assertions to the Delivery row of the order summary so subtotal /
  // total values containing 350 or 450 elsewhere on the page don't cause flakes.
  const deliveryRow = page
    .locator("div.flex.justify-between", { hasText: /^Delivery/ })
    .first();

  // Select Colombo → delivery should be LKR 350 inside the Delivery row.
  await page.locator("#city").selectOption("Colombo");
  await expect(deliveryRow).toContainText("LKR 350", { timeout: 5_000 });

  // Select Kandy (OTHER zone) → row flips to LKR 450.
  await page.locator("#city").selectOption("Kandy");
  await expect(deliveryRow).toContainText("LKR 450", { timeout: 5_000 });
  await expect(deliveryRow).not.toContainText("LKR 350");
});
