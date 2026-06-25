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

test("share buttons target the absolute canonical product URL", async ({ page }) => {
  // Capture window.open args so we can assert the share targets, since the
  // buttons open popups rather than rendering anchors.
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url ?? ""));
      return null;
    }) as typeof window.open;
  });

  await page.goto("/products/p1");

  await expect(page.getByRole("button", { name: /Share on Facebook/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share on WhatsApp/i })).toBeVisible();

  await page.getByRole("button", { name: /Share on Facebook/i }).click();
  await page.getByRole("button", { name: /Share on WhatsApp/i }).click();

  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  const fb = opened.find((u) => u.includes("facebook.com/sharer"));
  const wa = opened.find((u) => u.includes("wa.me"));
  // Each share must carry the absolute canonical product URL (encoded), not a
  // relative/localhost-undefined path. The product id must be present.
  expect(fb).toMatch(/https?%3A%2F%2F.+%2Fproducts%2Fp1/);
  expect(wa).toMatch(/https?(%3A%2F%2F|:\/\/).+(%2F|\/)products(%2F|\/)p1/);

  // Copy link writes the same canonical URL; verify via the clipboard.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("copy-link").click();
  await expect(page.getByRole("button", { name: /Copied/i })).toBeVisible({ timeout: 3_000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/^https?:\/\/.+\/products\/p1$/);
});
