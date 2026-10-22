import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const isolatedUrl = process.env.POS_TEST_DATABASE_URL;
if (!isolatedUrl || new URL(isolatedUrl).hostname !== "127.0.0.1" || new URL(isolatedUrl).port !== "55432" || new URL(isolatedUrl).pathname !== "/pos_test") {
  throw new Error("Run this suite with playwright.pos.config.ts and the isolated POS database.");
}
const db = new PrismaClient({ datasourceUrl: isolatedUrl });
const prefix = `pos-browser-${randomUUID()}`;
const email = `${prefix}@example.test`;
const password = "LocalPosTest123!";
let sku: string, stockId: string, adminId: string, largeSku: string;
const shirtCategoryName = `Shirts ${prefix}`;
const bagCategoryName = `Bags ${prefix}`;

async function login(page: Page) {
  await page.goto("/login?callbackUrl=/about");
  await page.locator("#identifier").fill(email);
  await page.locator("#password").fill(password);
  await Promise.all([page.waitForURL(url => url.pathname === "/about"), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
  await page.goto("/admin/pos");
  await expect(page.getByRole("heading", { name: "Shop POS", exact: true })).toBeVisible();
}

async function scan(page: Page) {
  await page.getByRole("textbox", { name: "Search products or scan SKU" }).fill(sku);
  await page.getByRole("textbox", { name: "Search products or scan SKU" }).press("Enter");
  await expect(page.getByRole("button", { name: `Remove ${sku}` })).toBeVisible();
}

test.beforeAll(async () => {
  adminId = (await db.user.create({ data: { name: "POS browser cashier", email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } })).id;
  await db.department.create({ data: { slug: prefix, name: prefix, navLabel: prefix, tileName: prefix, hex: "#fff" } });
  await db.design.create({ data: { slug: prefix, name: prefix, departmentSlug: prefix, hex: "#fff" } });
  const category = await db.inventoryCategory.create({ data: { name: shirtCategoryName } });
  const family = await db.inventoryProduct.create({ data: { name: prefix, categoryId: category.id } });
  stockId = (await db.plainTshirtStock.create({ data: { inventoryProductId: family.id, color: "Blue", colorSlug: "blue", size: "M", quantity: 20 } })).id;
  const large = await db.plainTshirtStock.create({ data: { inventoryProductId: family.id, color: "Blue", colorSlug: "blue", size: "L", quantity: 10 } });
  const soldOut = await db.plainTshirtStock.create({ data: { inventoryProductId: family.id, color: "Blue", colorSlug: "blue", size: "XL", quantity: 0 } });
  const pink = await db.plainTshirtStock.create({ data: { inventoryProductId: family.id, color: "Pink", colorSlug: "pink", size: "M", quantity: 5 } });
  const product = await db.product.create({ data: {
    id: prefix, name: "POS Browser Shirt", price: 1999.99, description: "Isolated POS browser test",
    departmentSlug: prefix, designSlug: prefix, inventoryProductId: family.id, status: "PUBLISHED", stockMode: "PLAIN",
    variants: { create: [
      { color: "Blue", colorSlug: "blue", sizeStocks: { create: [
        { size: "M", plainTshirtStockId: stockId }, { size: "L", plainTshirtStockId: large.id }, { size: "XL", plainTshirtStockId: soldOut.id },
      ] } },
      { color: "Pink", colorSlug: "pink", sizeStocks: { create: { size: "M", plainTshirtStockId: pink.id } } },
    ] },
  }, include: { variants: { include: { sizeStocks: true } } } });
  sku = product.variants.find(variant => variant.color === "Blue")!.sizeStocks.find(size => size.size === "M")!.sku;
  largeSku = product.variants.find(variant => variant.color === "Blue")!.sizeStocks.find(size => size.size === "L")!.sku;
  const bags = await db.inventoryCategory.create({ data: { name: bagCategoryName } });
  const bagFamily = await db.inventoryProduct.create({ data: { name: "Canvas Bag", categoryId: bags.id } });
  const bagStock = await db.plainTshirtStock.create({ data: { inventoryProductId: bagFamily.id,
    color: "Natural", colorSlug: "natural", size: "One size", stockGroup: "ACCESSORY", quantity: 10 } });
  await db.product.create({ data: { id: `${prefix}-bag`, name: "POS Browser Bag", description: "Isolated bag",
    price: 750, departmentSlug: prefix, designSlug: prefix, inventoryProductId: bagFamily.id,
    status: "PUBLISHED", stockMode: "PLAIN", variants: { create: { color: "Natural", colorSlug: "natural",
      sizeStocks: { create: { size: "One size", plainTshirtStockId: bagStock.id } } } } } });
});
test.afterAll(async () => { await db.$disconnect(); });
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\//, route => new URL(route.request().url()).hostname === "localhost"
    ? route.continue() : route.abort());
});

test("blocks anonymous access to the register and receipts", async ({ page }) => {
  await page.goto("/admin/pos");
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  await page.goto("/admin/pos/receipts/not-an-order");
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
});

test("groups products by category and chooses colour and size without duplicate cards", async ({ page }) => {
  await login(page);
  const categories = page.getByRole("navigation", { name: "Product categories" });
  await categories.getByRole("button", { name: `${shirtCategoryName} 1`, exact: true }).click();
  const shirt = page.getByRole("button", { name: "Choose POS Browser Shirt", exact: true });
  await expect(shirt).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add POS Browser Bag", exact: true })).toHaveCount(0);
  await shirt.click();
  const picker = page.getByRole("dialog");
  await picker.getByRole("combobox", { name: /Colour/ }).selectOption("Blue");
  await expect(picker.getByRole("button", { name: "Add to sale", exact: true })).toBeDisabled();
  await expect(picker.getByRole("button", { name: "XL", exact: true })).toBeDisabled();
  await picker.getByRole("combobox", { name: /Colour/ }).selectOption("Pink");
  await expect(picker.getByRole("button", { name: "M", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("combobox", { name: /Colour/ }).selectOption("Blue");
  await picker.getByRole("button", { name: "L", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("pos-colour-size.png") });
  await picker.getByRole("button", { name: "Add to sale", exact: true }).click();
  await expect(page.getByRole("button", { name: `Remove ${largeSku}` })).toBeVisible();
  await expect(picker).toHaveCount(0);
  await categories.getByRole("button", { name: `${bagCategoryName} 1`, exact: true }).click();
  await expect(shirt).toHaveCount(0);
  await page.getByRole("button", { name: "Add POS Browser Bag", exact: true }).click();
  await expect(page.getByText("POS Browser Bag", { exact: true })).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath("pos-categories-desktop.png"), fullPage: true });
  await page.getByRole("textbox", { name: "Search products or scan SKU" }).fill("does not exist");
  await expect(page.getByText("No products match. Try another name or SKU.")).toBeVisible();
});

test("scans a SKU, restores the cart, takes cash, and prints a persisted receipt", async ({ page, context }) => {
  await login(page);
  await scan(page);
  await page.getByRole("button", { name: `Increase ${sku}` }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: `Remove ${sku}` })).toBeVisible();
  await page.getByLabel("Cash received (LKR)").fill("4000");
  const before = (await db.plainTshirtStock.findUniqueOrThrow({ where: { id: stockId } })).quantity;
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("status")).toContainText(/Sale POS\d+ completed/);
  const order = await db.order.findFirstOrThrow({ where: { cashierId: adminId, paymentMethod: "CASH" }, orderBy: { createdAt: "desc" } });
  expect(order.total).toBe(3999.98);
  expect((await db.plainTshirtStock.findUniqueOrThrow({ where: { id: stockId } })).quantity).toBe(before - 2);
  const popup = context.waitForEvent("page");
  await page.getByRole("link", { name: "View / print receipt" }).click();
  const receipt = await popup;
  await expect(receipt.getByRole("heading", { name: "SALES RECEIPT" })).toBeVisible();
  await expect(receipt.locator(".pos-receipt")).toContainText(order.posNumber!);
  await expect(receipt.locator(".pos-receipt")).toContainText("0.02");
  await receipt.emulateMedia({ media: "print" });
  await expect(receipt.getByRole("button", { name: "Print receipt" })).toBeHidden();
  await expect(receipt.locator(".pos-receipt")).toBeVisible();
  await receipt.pdf({ path: "/tmp/pos-test-receipt.pdf", width: "80mm", printBackground: true });
  await page.goto("/admin/orders?channel=POS");
  await expect(page.getByRole("combobox", { name: "Filter by sales channel" })).toHaveValue("POS");
  await expect(page.getByRole("link", { name: order.posNumber!, exact: true })).toBeVisible();
  await page.getByRole("link", { name: order.posNumber!, exact: true }).click();
  await expect(page.getByText("Paid and collected in store.")).toBeVisible();
});

test("requires card approval and prevents cash underpayment", async ({ page }) => {
  await login(page);
  await scan(page);
  await page.getByLabel("Cash received (LKR)").fill("1");
  await expect(page.getByRole("button", { name: /Complete sale/ })).toBeDisabled();
  await page.getByRole("radio", { name: "Card terminal", exact: true }).check();
  await expect(page.getByRole("button", { name: /Complete sale/ })).toBeDisabled();
  await page.getByLabel("Approved terminal reference").fill("BROWSER-AUTH-123");
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("status")).toContainText(/Sale POS\d+ completed/);
  const order = await db.order.findFirstOrThrow({ where: { cashierId: adminId, posPaymentReference: "BROWSER-AUTH-123" } });
  expect(order).toMatchObject({ total: 1999.99, paymentMethod: "CARD", paymentStatus: "PAID", shippingCost: 0 });
});

test("recovers a committed sale after its response is lost without deducting stock twice", async ({ page }) => {
  await login(page);
  await scan(page);
  await page.getByRole("button", { name: "Exact cash", exact: true }).click();
  const before = await db.order.count({ where: { cashierId: adminId } });
  const stockBefore = (await db.plainTshirtStock.findUniqueOrThrow({ where: { id: stockId } })).quantity;
  let intercepted = false;
  await page.route("**/admin/pos", async route => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"] && !intercepted) {
      intercepted = true;
      await route.fetch(); // Let the transaction commit, then lose only its response.
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("button", { name: "Retry sale confirmation" })).toBeEnabled();
  await expect(page.getByLabel("Cash received (LKR)")).toBeDisabled();
  await page.unroute("**/admin/pos");
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry sale confirmation" })).toBeEnabled();
  await page.getByRole("button", { name: "Retry sale confirmation" }).click();
  await expect(page.getByRole("status")).toContainText(/Sale POS\d+ completed/);
  expect(await db.order.count({ where: { cashierId: adminId } })).toBe(before + 1);
  expect((await db.plainTshirtStock.findUniqueOrThrow({ where: { id: stockId } })).quantity).toBe(stockBefore - 1);
});

test("keeps the register usable on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await scan(page);
  await page.getByRole("button", { name: "Exact cash", exact: true }).click();
  await expect(page.getByRole("button", { name: /Complete sale/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/pos-mobile.png", fullPage: true });
});
