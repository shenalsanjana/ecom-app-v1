import { existsSync } from "node:fs";
for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}
import { test, expect } from "@playwright/test";
import { prisma } from "../../app/_lib/prisma";

let productId: string;

test.beforeAll(async () => {
  const product = await prisma.product.findFirst({
    where: { archived: false },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!product) throw new Error("No product found to drive e2e");
  productId = product.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("product page has price-in-title OG tag and Product JSON-LD", async ({ page }) => {
  await page.goto(`/products/${productId}`);

  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
  expect(ogTitle).toMatch(/LKR|Rs/); // price folded into the title

  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toMatch(/^https?:\/\//); // absolute

  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toBeTruthy();
  const json = JSON.parse(ld!);
  expect(json["@type"]).toBe("Product");
  expect(json.offers.priceCurrency).toBe("LKR");
  expect(json.sku).toBe(productId); // content id invariant: sku == product.id
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

  await page.goto(`/products/${productId}`);

  await expect(page.getByRole("button", { name: /Share on Facebook/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Share on WhatsApp/i })).toBeVisible();

  await page.getByRole("button", { name: /Share on Facebook/i }).click();
  await page.getByRole("button", { name: /Share on WhatsApp/i }).click();

  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  const fb = opened.find((u) => u.includes("facebook.com/sharer")) ?? "";
  const wa = opened.find((u) => u.includes("wa.me")) ?? "";
  // Each share must carry the ABSOLUTE canonical product URL (both params are
  // URL-encoded, so decode before asserting). An absolute origin + the product
  // path proves the server-computed URL flowed through (not a localhost-undefined
  // client build).
  // Both Facebook and WhatsApp carry the ABSOLUTE canonical product URL (params
  // are URL-encoded, so decode before asserting). An absolute origin + the
  // product path proves the server-computed URL flowed through — not a
  // localhost-undefined client build. Copy-link derives the same `url`.
  expect(decodeURIComponent(fb)).toContain(`://`);
  expect(decodeURIComponent(fb)).toContain(`/products/${productId}`);
  expect(decodeURIComponent(wa)).toContain(`://`);
  expect(decodeURIComponent(wa)).toContain(`/products/${productId}`);

  // Copy-link is present and clickable. (Its clipboard write is intentionally
  // not asserted here — headless Chromium silently blocks clipboard writes; the
  // canonical-URL guarantee is already locked by the FB/WhatsApp targets above.)
  await expect(page.getByTestId("copy-link")).toBeEnabled();
  await page.getByTestId("copy-link").click();
});
