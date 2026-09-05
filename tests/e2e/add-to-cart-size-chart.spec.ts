import { test, expect } from "@playwright/test";

test("add-to-cart popup reveals and hides the size chart", async ({ page }) => {
  await page.goto("/categories");

  // Open the quick Add-to-cart dialog on the first product card.
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  // The Size Chart toggle is present only when the product has sizes.
  const toggle = dialog.getByRole("button", { name: /^Size Chart$/i });
  await expect(toggle).toBeVisible();

  // Chart image is hidden until toggled.
  const chart = dialog.getByRole("img", { name: /size chart/i });
  await expect(chart).toHaveCount(0);

  // Reveal it.
  await toggle.click();
  await expect(chart).toBeVisible();
  const hide = dialog.getByRole("button", { name: /^Hide chart$/i });
  await expect(hide).toBeVisible();

  // Hide it again.
  await hide.click();
  await expect(chart).toHaveCount(0);
});
