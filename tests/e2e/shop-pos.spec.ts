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
  await db.storeSettings.upsert({ where: { id: "singleton" },
    create: { id: "singleton", storeName: "POS Test", supportEmail: "pos@example.test", supportPhone: "0771234567", businessAddress: "Test", colomboDeliveryCost: 350, otherDeliveryCost: 450, freeDeliveryThreshold: 5000 },
    update: { colomboDeliveryCost: 350, otherDeliveryCost: 450, freeDeliveryThreshold: 5000 } });
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

test("loads a product photo uploaded after startup directly in POS", async ({ page, context }) => {
  const imagePath = `/uploads/${prefix}-runtime.png`;
  const variant = await db.productVariant.findFirstOrThrow({ where: { productId: `${prefix}-bag` } });
  const image = await db.variantImage.create({ data: { variantId: variant.id, role: "CARD", sortOrder: -1, url: imagePath } });
  try {
    // nginx serves runtime uploads directly; the standalone optimizer has no
    // startup entry for this newly added file. Intercept only the raw URL.
    await context.route(`**${imagePath}`, route => route.fulfill({ contentType: "image/png", body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGOYFmD0H4QZYAwASRQIXTw1Kr0AAAAASUVORK5CYII=", "base64") }));
    await login(page);
    const photo = page.getByRole("button", { name: "Add POS Browser Bag", exact: true }).locator("img");
    await expect(photo).toHaveAttribute("src", imagePath);
    await expect.poll(() => photo.evaluate(node => {
      const img = node as HTMLImageElement;
      return img.complete && img.naturalWidth > 0 && new URL(img.currentSrc).pathname.startsWith("/uploads/");
    })).toBe(true);
    await page.reload();
    await expect.poll(() => photo.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  } finally { await db.variantImage.delete({ where: { id: image.id } }); }
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

for (const [paymentMethod, label] of [["KOKO", "Koko"], ["MINTPAY", "Mintpay"], ["BANK_TRANSFER", "Bank Transfer"]] as const) {
  test(`records approved ${label} payments and prints the provider on receipts`, async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await scan(page);
    await page.getByRole("radio", { name: label, exact: true }).check();
    await expect(page.getByRole("button", { name: /Complete sale/ })).toBeDisabled();
    const reference = `BROWSER-${paymentMethod}-123`;
    await page.getByLabel(`Approved ${label} reference`).fill(reference);
    await page.reload();
    await expect(page.getByRole("radio", { name: label, exact: true })).toBeChecked();
    await expect(page.getByLabel(`Approved ${label} reference`)).toHaveValue(reference);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: /Complete sale/ }).click();
    await expect(page.getByRole("status")).toContainText(/Sale POS\d+ completed/);
    const order = await db.order.findFirstOrThrow({ where: { cashierId: adminId, posPaymentReference: reference } });
    expect(order).toMatchObject({ paymentMethod, total: 1999.99, paymentStatus: "PAID", paymentStartedAt: null });
    const popup = context.waitForEvent("page");
    await page.getByRole("link", { name: "View / print receipt" }).click();
    const receipt = await popup;
    await expect(receipt.locator(".pos-receipt")).toContainText(label);
    await expect(receipt.locator(".pos-receipt")).toContainText(`Payment reference: ${reference}`);
  });
}

test("offers the complete Royal Express catalogue without duplicates and searches cities or districts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("radio", { name: "Cash on Delivery (COD)", exact: true }).check();
  const city = page.getByRole("combobox", { name: "Delivery city", exact: true });
  await city.click();
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options).toHaveCount(2028);
  const names = await options.allTextContents();
  expect(new Set(names.map(name => name.trim().toLowerCase())).size).toBe(names.length);
  await city.fill("Soranathota");
  await expect(options).toHaveCount(1);
  await city.press("ArrowDown");
  await city.press("Enter");
  await expect(city).toHaveValue("Soranathota");
  await page.reload();
  await expect(city).toHaveValue("Soranathota");
  await city.fill("Badulla");
  await expect(page.getByRole("option", { name: "Soranathota", exact: true })).toHaveCount(1);
  await city.press("Escape");
  await expect(city).toHaveValue("Soranathota");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("creates COD delivery, edits contact/address, dispatches with Royal Express and records collection", async ({ page, context }) => {
  test.setTimeout(150000);
  page.on("dialog", dialog => dialog.accept());
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await scan(page);
  await page.getByRole("radio", { name: "Cash on Delivery (COD)", exact: true }).check();
  await expect(page.getByRole("combobox", { name: "Fulfilment", exact: true })).toHaveValue("ROYAL_EXPRESS");
  await expect(page.getByRole("button", { name: /Complete sale/ })).toBeDisabled();
  await page.getByLabel("Customer name (required)", { exact: true }).fill("COD Test Customer");
  await page.getByLabel("Contact number", { exact: true }).fill("0771234567");
  await page.getByLabel("Delivery address", { exact: true }).fill("12 Test Road");
  await page.getByRole("combobox", { name: "Delivery city", exact: true }).fill("Colombo 01");
  await page.getByRole("option", { name: "Colombo 01", exact: true }).click();
  await expect(page.getByRole("button", { name: /Complete sale/ })).toContainText("2,349.99");
  await page.getByRole("combobox", { name: "Delivery city", exact: true }).fill("Soranathota");
  await page.getByRole("option", { name: "Soranathota", exact: true }).click();
  await expect(page.getByRole("button", { name: /Complete sale/ })).toContainText("2,449.99");
  await page.reload();
  await expect(page.getByLabel("Contact number", { exact: true })).toHaveValue("0771234567");
  await expect(page.getByLabel("Delivery address", { exact: true })).toHaveValue("12 Test Road");
  await expect(page.getByRole("combobox", { name: /^Delivery city/ })).toHaveValue("Soranathota");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("status")).toContainText(/Sale POS\d+ completed/);
  const order = await db.order.findFirstOrThrow({ where: { cashierId: adminId, paymentMethod: "COD" }, orderBy: { createdAt: "desc" } });
  expect(order).toMatchObject({ paymentStatus: "COD_PENDING", status: "CONFIRMED", total: 2449.99, shippingCost: 450, shippingCity: "Soranathota", deliveryCompany: "Royal Express" });
  const popup = context.waitForEvent("page");
  await page.getByRole("link", { name: "View / print receipt" }).click();
  const receipt = await popup;
  await expect(receipt.getByRole("heading", { name: "ORDER RECEIPT" })).toBeVisible();
  await expect(receipt.locator(".pos-receipt")).toContainText("Amount due on delivery");
  await expect(receipt.locator(".pos-receipt")).not.toContainText("Paid · Collected in store");
  await receipt.close();
  await page.getByRole("link", { name: "Manage order & delivery" }).click();
  await expect(page.getByText("Delivery company: Royal Express", { exact: true })).toBeVisible();
  const shippingDetails = page.getByRole("heading", { name: "Shipping address", exact: true }).locator("..");
  await shippingDetails.getByRole("button", { name: "✎ Edit", exact: true }).click();
  await shippingDetails.getByPlaceholder("line1", { exact: true }).fill("34 Updated Street");
  await shippingDetails.getByLabel("Contact number", { exact: true }).fill("0777654321");
  await shippingDetails.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await db.order.findUniqueOrThrow({ where: { id: order.id } })).customerPhone).toBe("0777654321");
  await page.getByLabel("Royal Express tracking number").fill("ROYAL-POS-123");
  await page.getByRole("button", { name: /Mark dispatched \(Royal Express\)/ }).click();
  await expect(page.getByLabel("Update tracking number")).toBeVisible();
  await page.getByLabel("Update tracking number").fill("ROYAL-POS-456");
  await page.getByRole("button", { name: "Save tracking number", exact: true }).click();
  await expect.poll(async () => (await db.order.findUniqueOrThrow({ where: { id: order.id } })).trackingCode).toBe("ROYAL-POS-456");
  await page.getByRole("button", { name: "Mark delivered", exact: true }).click();
  await expect.poll(async () => (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("DELIVERED");
  await page.getByRole("button", { name: "Mark COD collected", exact: true }).click();
  await expect.poll(async () => (await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("COD_COLLECTED");
});

test("applies item and bill costs/discounts, restores drafts and prints the saved total", async ({ page, context }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await scan(page);
  await page.getByRole("button", { name: `Increase ${sku}` }).click();
  const itemLabel = `POS Browser Shirt (${sku})`;
  await page.getByText("Item additional cost & discount", { exact: true }).click();
  await page.getByLabel(`Additional cost for ${itemLabel}`, { exact: true }).fill("100");
  await page.getByLabel(`Discount type for ${itemLabel}`, { exact: true }).selectOption("PERCENT");
  await page.getByLabel(`Discount for ${itemLabel}`, { exact: true }).fill("10");
  await page.getByText("Bill additional costs & discounts", { exact: true }).click();
  await page.getByLabel("Additional cost type for Entire bill", { exact: true }).selectOption("PERCENT");
  await page.getByLabel("Additional cost for Entire bill", { exact: true }).fill("5");
  await page.getByLabel("Discount for Entire bill", { exact: true }).fill("100");
  await expect(page.getByRole("button", { name: /Complete sale/ })).toContainText("3,774.48");
  await page.getByRole("button", { name: `Increase ${sku}` }).click();
  await expect(page.getByRole("button", { name: /Complete sale/ })).toContainText("5,664.47");
  await page.getByRole("button", { name: `Decrease ${sku}` }).click();
  await expect(page.getByRole("button", { name: /Complete sale/ })).toContainText("3,774.48");
  await page.reload();
  await expect(page.getByRole("button", { name: /Complete sale/ })).toContainText("3,774.48");
  await page.getByText("Item additional cost & discount", { exact: true }).click();
  await expect(page.getByLabel(`Additional cost for ${itemLabel}`, { exact: true })).toHaveValue("100");
  await page.getByText("Bill additional costs & discounts", { exact: true }).click();
  await page.getByLabel("Discount for Entire bill", { exact: true }).fill("999999");
  await expect(page.getByRole("alert").filter({ hasText: "discount exceeds" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Complete sale/ })).toBeDisabled();
  await page.getByLabel("Discount for Entire bill", { exact: true }).fill("100");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("pos-adjustments-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Exact cash", exact: true }).click();
  await page.getByRole("button", { name: /Complete sale/ }).click();
  await expect(page.getByRole("status")).toContainText(/Sale POS\d+ completed/);
  const order = await db.order.findFirstOrThrow({ where: { cashierId: adminId, total: 3774.48 }, include: { adjustments: true } });
  expect(order.adjustments).toHaveLength(4);
  const popup = context.waitForEvent("page");
  await page.getByRole("link", { name: "View / print receipt" }).click();
  const receipt = await popup;
  await expect(receipt.locator(".pos-receipt")).toContainText("Entire bill");
  await expect(receipt.locator(".pos-receipt")).toContainText(sku);
  await expect(receipt.locator(".pos-receipt")).toContainText("3,774.48");
  await receipt.close();
  await page.getByRole("link", { name: "Manage order & delivery" }).click();
  await expect(page.getByText("POS costs and discounts are fixed to this sale. Items and pricing cannot be edited here.", { exact: true })).toBeVisible();
  await expect(page.getByText("3,774.48", { exact: false }).first()).toBeVisible();
});

test("recovers a committed sale after its response is lost without deducting stock twice", async ({ page }) => {
  await login(page);
  await scan(page);
  await page.getByText("Bill additional costs & discounts", { exact: true }).click();
  await page.getByLabel("Discount type for Entire bill", { exact: true }).selectOption("PERCENT");
  await page.getByLabel("Discount for Entire bill", { exact: true }).fill("10");
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
  await expect(page.getByLabel("Discount for Entire bill", { exact: true })).toBeDisabled();
  await page.unroute("**/admin/pos");
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry sale confirmation" })).toBeEnabled();
  await page.getByRole("button", { name: "Retry sale confirmation" }).click();
  await expect(page.getByRole("status")).toContainText(/Sale POS\d+ completed/);
  expect(await db.order.count({ where: { cashierId: adminId } })).toBe(before + 1);
  const recovered = await db.order.findFirstOrThrow({ where: { cashierId: adminId }, orderBy: { createdAt: "desc" }, include: { adjustments: true } });
  expect(recovered.total).toBe(1799.99);
  expect(recovered.adjustments).toHaveLength(1);
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
