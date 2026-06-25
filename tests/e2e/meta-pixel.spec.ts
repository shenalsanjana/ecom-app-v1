import { existsSync } from "node:fs";
for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}
import { test, expect, type Page } from "@playwright/test";

// Install a window.fbq stub that records calls, before any page script runs.
async function stubPixel(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __fbq: unknown[][] }).__fbq = [];
    (window as unknown as { fbq: (...a: unknown[]) => void }).fbq = (...args: unknown[]) => {
      (window as unknown as { __fbq: unknown[][] }).__fbq.push(args);
    };
  });
}

async function pixelCalls(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => (window as unknown as { __fbq: unknown[][] }).__fbq ?? []);
}

function eventNames(calls: unknown[][]): string[] {
  return calls.filter((c) => c[0] === "track").map((c) => String(c[1]));
}

test("fires ViewContent on a product page", async ({ page }) => {
  await stubPixel(page);
  await page.goto("/products/p1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("ViewContent");
});

test("fires AddToCart when adding from the product page", async ({ page }) => {
  await stubPixel(page);
  await page.goto("/products/p1");
  // Select a size if the product requires one.
  const sizeButtons = page.locator('#size-picker button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
  }
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("AddToCart");
});

test("fires InitiateCheckout on the checkout page with items in the cart", async ({ page }) => {
  await stubPixel(page);
  await page.goto("/products/p1");
  const sizeButtons = page.locator('#size-picker button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
  }
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();
  await page.goto("/checkout");
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("InitiateCheckout");
});

test("fires Purchase exactly once on COD order placement", async ({ page }) => {
  await stubPixel(page);
  await page.goto("/products/p1");
  const sizeButtons = page.locator('#size-picker button[aria-pressed]');
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
  }
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();

  await page.goto("/checkout");
  await page.getByLabel(/Phone Number/i).fill("0771234567");
  await page.getByLabel(/Address Line 1/i).fill("123 Test St");
  await page.locator("#city").selectOption("Colombo");
  await page.getByRole("button", { name: /Place Order/i }).click();

  await expect(page.getByRole("heading", { name: "Order Confirmed!" })).toBeVisible({ timeout: 30_000 });

  const purchases = eventNames(await pixelCalls(page)).filter((n) => n === "Purchase");
  expect(purchases).toHaveLength(1);
});
