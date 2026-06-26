import { existsSync } from "node:fs";
for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../../app/_lib/prisma";

// A unique guest email so the one order this suite places can be cleaned up.
const COD_GUEST_EMAIL = "e2e-meta-purchase@example.com";

// Resolve a real in-stock, non-archived product id from the seeded catalog
// (the demo "p1" id does not exist in every environment).
let productId: string;
let originalStock: number;

test.beforeAll(async () => {
  const product = await prisma.product.findFirst({
    where: { archived: false, stock: { gt: 0 } },
    orderBy: { id: "asc" },
    select: { id: true, stock: true },
  });
  if (!product) throw new Error("No in-stock product found to drive e2e");
  productId = product.id;
  originalStock = product.stock;
});

test.afterAll(async () => {
  // Leave the DB exactly as we found it: remove the guest COD order(s) this
  // suite created (items cascade on delete) and restore the product stock that
  // order placement decremented.
  await prisma.order.deleteMany({ where: { guestEmail: COD_GUEST_EMAIL } });
  await prisma.product.update({ where: { id: productId }, data: { stock: originalStock } });
  await prisma.$disconnect();
});

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

async function selectSizeIfPresent(page: Page) {
  const sizeButtons = page.locator("#size-picker button[aria-pressed]");
  if ((await sizeButtons.count()) > 0) {
    await sizeButtons.first().click();
  }
}

test("does not load the Pixel base script when NEXT_PUBLIC_META_PIXEL_ID is unset", async ({ page }) => {
  // No stub here — assert the REAL no-op behavior. With the env var unset (as in
  // this test environment) MetaPixelScript renders null: no base script tag and
  // no fbevents.js request, so the site behaves exactly as before.
  await page.goto(`/products/${productId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#meta-pixel-base")).toHaveCount(0);
  const loadedFbevents = await page.evaluate(() =>
    performance.getEntriesByType("resource").some((e) => (e as PerformanceResourceTiming).name.includes("fbevents.js")),
  );
  expect(loadedFbevents).toBe(false);
});

test("fires ViewContent on a product page", async ({ page }) => {
  await stubPixel(page);
  await page.goto(`/products/${productId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("ViewContent");
});

test("fires AddToCart when adding from the product page", async ({ page }) => {
  await stubPixel(page);
  await page.goto(`/products/${productId}`);
  await selectSizeIfPresent(page);
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("AddToCart");
});

test("fires InitiateCheckout on the checkout page with items in the cart", async ({ page }) => {
  await stubPixel(page);
  await page.goto(`/products/${productId}`);
  await selectSizeIfPresent(page);
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();
  await page.goto("/checkout");
  await expect.poll(async () => eventNames(await pixelCalls(page))).toContain("InitiateCheckout");
});

test("fires Purchase exactly once on COD order placement", async ({ page }) => {
  await stubPixel(page);
  await page.goto(`/products/${productId}`);
  await selectSizeIfPresent(page);
  await page.getByRole("button", { name: /^Add to cart$/i }).first().click();

  await page.goto("/checkout");
  // Guest checkout requires name + email.
  await page.getByLabel(/Full Name/i).fill("E2E Meta Tester");
  await page.getByLabel(/Email/i).fill(COD_GUEST_EMAIL);
  await page.getByLabel(/Phone Number/i).fill("0771234567");
  await page.getByLabel(/Address Line 1/i).fill("123 Test St");
  // City is a combobox (not a <select>): focus, type to filter, pick the option.
  const cityInput = page.locator("#city");
  await cityInput.click();
  await cityInput.fill("Colombo");
  await page.getByRole("option", { name: /Colombo/i }).first().click();
  await page.getByRole("button", { name: /Place Order/i }).click();

  await expect(page.getByRole("heading", { name: "Order Confirmed!" })).toBeVisible({ timeout: 30_000 });

  const purchases = eventNames(await pixelCalls(page)).filter((n) => n === "Purchase");
  expect(purchases).toHaveLength(1);
});
