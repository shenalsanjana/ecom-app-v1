import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import { test, expect, type Page } from "@playwright/test";

// Drives the searchable city combobox (replaces the old <select>) and asserts
// the delivery cost flips between the Colombo zone and the Other zone. Guest
// checkout — no login, no DB writes; products are read from the catalogue DB.

async function addFirstProductToCart(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();
  const sizeButtons = page.locator('[role="dialog"] button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) await sizeButtons.first().click();
  await page
    .locator('[role="dialog"]')
    .getByRole("button", { name: /^Add to cart$/i })
    .click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });
}

async function pickCity(page: Page, name: string) {
  const input = page.locator("#city");
  await input.click();
  await input.fill(name);
  await page.getByRole("option", { name, exact: true }).first().click();
  await expect(input).toHaveValue(name);
}

test("city combobox: delivery flips Colombo (Rs.350) vs Other (Rs.450)", async ({ page }) => {
  await addFirstProductToCart(page);
  await page.goto("/checkout");

  const deliveryRow = page
    .locator("div.flex.justify-between", { hasText: /^Delivery/ })
    .first();

  // Catalogue spelling "Mount Lavinia" must price as COLOMBO (regression guard
  // for dropdown<->pricing drift).
  await pickCity(page, "Mount Lavinia");
  await expect(deliveryRow).toContainText("LKR 350", { timeout: 5_000 });

  // A far Colombo-district city → OTHER tier.
  await pickCity(page, "Avissawella");
  await expect(deliveryRow).toContainText("LKR 450", { timeout: 5_000 });
  await expect(deliveryRow).not.toContainText("LKR 350");
});

test("city combobox: search filters and selects on mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addFirstProductToCart(page);
  await page.goto("/checkout");

  const input = page.locator("#city");
  await input.click();
  await input.fill("Negombo");
  // Listbox is open and filtered.
  await expect(page.getByRole("option", { name: "Negombo", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Negombo", exact: true }).click();
  await expect(input).toHaveValue("Negombo");
});
