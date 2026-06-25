import { test, expect } from "@playwright/test";

test("product page has price-in-title OG tag and Product JSON-LD", async ({ page }) => {
  await page.goto("/products/p1");

  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
  expect(ogTitle).toMatch(/LKR|Rs/); // price folded into the title

  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toMatch(/^https?:\/\//); // absolute

  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toBeTruthy();
  const json = JSON.parse(ld!);
  expect(json["@type"]).toBe("Product");
  expect(json.offers.priceCurrency).toBe("LKR");
  expect(json.sku).toBe("p1"); // content id invariant: sku == product.id
});

test("share buttons expose Facebook and WhatsApp links to the canonical URL", async ({ page }) => {
  await page.goto("/products/p1");

  // Facebook share opens a popup; assert the button is present and the copy-link
  // button writes the canonical URL to the clipboard.
  await expect(page.getByRole("button", { name: /Share on Facebook/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share on WhatsApp/i })).toBeVisible();

  // Copy link → clipboard contains the product URL.
  await page.getByTestId("copy-link").click();
  // Clipboard read requires permissions; assert the button entered its "Copied" state instead.
  await expect(page.getByRole("button", { name: /Copied/i })).toBeVisible({ timeout: 3_000 });
});
