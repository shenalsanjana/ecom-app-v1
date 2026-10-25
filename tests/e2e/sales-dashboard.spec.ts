import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
const isolatedUrl = process.env.POS_TEST_DATABASE_URL;
if (!isolatedUrl || new URL(isolatedUrl).hostname !== "127.0.0.1" || new URL(isolatedUrl).port !== "55432" || new URL(isolatedUrl).pathname !== "/pos_test") throw new Error("Sales browser tests require isolated pos_test on localhost:55432.");
const db = new PrismaClient({ datasourceUrl: isolatedUrl });
const prefix = `sales-browser-${randomUUID()}`, email = `${prefix}@example.test`, password = "LocalSalesTest123!";
const date = "2026-01-15", at = new Date(`${date}T02:00:00Z`), path = `/admin/sales?period=custom&start=${date}&end=${date}&channel=ALL`;
let onlineId: string, itemId: string, stockId: string;
async function login(page: Page) {
  await page.goto("/login?callbackUrl=/about"); await page.locator("#identifier").fill(email); await page.locator("#password").fill(password);
  await Promise.all([page.waitForURL(url => url.pathname === "/about"), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
  await expect.poll(async () => (await (await page.request.get("/api/auth/session")).json()).user?.role).toBe("ADMIN");
}
async function report(page: Page) { const response = await page.request.get(`/api/admin/sales?period=custom&start=${date}&end=${date}`); expect(response.ok()).toBe(true); return response.json(); }
function tile(page: Page, label: string) { return page.locator('[data-slot="card"]').filter({ has: page.getByText(label, { exact: true }) }); }
test.beforeAll(async () => {
  await db.user.create({ data: { name: "Sales browser admin", email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } });
  await db.department.create({ data: { slug: prefix, name: "Sales accessories", navLabel: "Sales", tileName: "Sales", hex: "#fff" } });
  await db.design.create({ data: { slug: prefix, name: "Canvas bags", departmentSlug: prefix, hex: "#fff" } });
  const root = await db.inventoryCategory.findUniqueOrThrow({ where: { systemKey: "accessories" } });
  const category = await db.inventoryCategory.create({ data: { name: prefix, parentId: root.id } }); const family = await db.inventoryProduct.create({ data: { name: prefix, categoryId: category.id } });
  stockId = (await db.plainTshirtStock.create({ data: { inventoryProductId: family.id, color: "Natural", colorSlug: "natural", size: "One size", stockGroup: "ACCESSORY", quantity: 3 } })).id;
  await db.product.create({ data: { id: prefix, name: "Sales browser tote", price: 1000, costPriceCents: 40000, description: "Report browser fixture", departmentSlug: prefix, designSlug: prefix, status: "PUBLISHED", stockMode: "PLAIN", inventoryProductId: family.id, variants: { create: { color: "Natural", colorSlug: "natural", images: { create: [{ url: "/logo.png", role: "CARD", sortOrder: 0 }, { url: "/logo.png", role: "DETAIL", sortOrder: 1 }] }, sizeStocks: { create: { size: "One size", plainTshirtStockId: stockId } } } } } });
  const base = { customerPhone: "0771234567", guestName: "Report Customer", shippingLine1: "12 Test Road", shippingCity: "Colombo", shippingCountry: "Sri Lanka", paymentMethod: "PAYHERE", paymentMethodDisplay: "PayHere", paymentStatus: "PAID", status: "DELIVERED", total: 2250, subtotal: 2000, shippingCost: 350, salesPaidAt: at, createdAt: new Date("2026-01-14T02:00:00Z") };
  const online = await db.order.create({ data: { ...base, id: `${prefix}-online`, webNumber: `${prefix}-WEB`, items: { create: { productId: prefix, name: "Sales browser tote", sku: `${prefix}-SKU`, size: "M", price: 1000, quantity: 2, unitCostCents: null, salesListPriceCents: 120000, salesProductKey: prefix, salesCategoryKey: prefix, salesCategoryName: "Canvas bags" } }, adjustments: { create: { label: "Coupon", amount: -100 } } }, include: { items: true } }); onlineId = online.id; itemId = online.items[0].id;
  await db.order.create({ data: { ...base, id: `${prefix}-pos`, posNumber: `${prefix}-POS`, salesChannel: "POS", paymentMethod: "CASH", total: 500, subtotal: 500, shippingCost: 0, createdAt: at, items: { create: { name: "Sales browser tote", size: "L", price: 500, quantity: 1, unitCostCents: 20000, salesListPriceCents: 50000, salesProductKey: prefix, salesCategoryKey: prefix, salesCategoryName: "Canvas bags" } } } });
  await db.order.create({ data: { ...base, id: `${prefix}-pending`, paymentMethod: "COD", paymentStatus: "COD_PENDING", status: "CONFIRMED", total: 1000, subtotal: 1000, shippingCost: 0, createdAt: at, salesPaidAt: null } });
  await db.order.create({ data: { ...base, id: `${prefix}-cancelled`, status: "CANCELLED", total: 1000, subtotal: 1000, shippingCost: 0, createdAt: at } });
});
test.afterAll(async () => {
  await db.salesRefund.deleteMany({ where: { orderId: { startsWith: prefix } } });
  await db.paymentEvent.deleteMany({ where: { orderId: { startsWith: prefix } } });
  await db.order.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.$disconnect();
});
test.beforeEach(async ({ context }) => { await context.route(/^https?:\/\//, route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort()); });

test("protects dashboard and every report format from anonymous access", async ({ page }) => {
  await page.goto(path); await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  for (const format of ["json", "csv", "xlsx"]) expect((await page.request.get(`/api/admin/sales?format=${format}`)).status()).toBe(401);
});

test("filters both channels, downloads reports and refreshes without losing the last good report", async ({ page }) => {
  test.setTimeout(90_000); await login(page); await page.goto(path);
  await expect(page.getByRole("heading", { name: "Sales dashboard", exact: true })).toBeVisible();
  await expect(tile(page, "Total revenue")).toContainText("2,750"); await expect(tile(page, "Paid order count")).toContainText("2");
  await expect(tile(page, "Gross profit")).toContainText("Costs missing"); await expect(page.getByText("Product costs needed for gross profit", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending:", { exact: false }).first()).toContainText("1");
  await page.getByRole("combobox", { name: /Channel/ }).selectOption("POS"); await expect(tile(page, "Total revenue")).toContainText("500"); await expect(tile(page, "Gross profit")).toContainText("300");
  await page.getByRole("combobox", { name: /Channel/ }).selectOption("ALL"); await expect(tile(page, "Total revenue")).toContainText("2,750");
  for (const label of ["Product", "Category", "Size", "Payment method"]) { await page.getByRole("group", { name: "Sales breakdown" }).getByRole("button", { name: label, exact: true }).click(); await expect(page.getByRole("table").first()).toBeVisible(); }
  for (const [label, extension] of [["Download CSV", "csv"], ["Download Excel", "xlsx"]]) {
    const saved = page.waitForEvent("download"); await page.getByRole("button", { name: label }).click(); const download = await saved;
    expect(download.suggestedFilename()).toContain(`sales-${date}-${date}`); await download.saveAs(test.info().outputPath(`sales-report.${extension}`));
  }
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("sales-mobile.png"), fullPage: true });
  // A newly settled order appears on the next foreground poll, with no full reload.
  await db.order.create({ data: { id: `${prefix}-poll`, customerPhone: "0771234567", shippingLine1: "Test", shippingCity: "Colombo", shippingCountry: "Sri Lanka", paymentMethod: "CASH", paymentMethodDisplay: "Cash", paymentStatus: "PAID", status: "CONFIRMED", salesChannel: "POS", total: 100, subtotal: 100, shippingCost: 0, salesPaidAt: at, createdAt: at, items: { create: { name: "Polling sale", price: 100, quantity: 1, size: "S", unitCostCents: 4000, salesListPriceCents: 10000 } } } });
  await expect(tile(page, "Total revenue")).toContainText("2,850", { timeout: 25_000 });
  await page.route("**/api/admin/sales?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary report outage" }) }));
  await page.getByRole("button", { name: "Refresh sales", exact: true }).click(); await expect(page.getByRole("main").getByRole("alert")).toContainText("Showing the last successful update"); await expect(tile(page, "Total revenue")).toContainText("2,850");
  await page.unroute("**/api/admin/sales?**"); await page.getByRole("button", { name: "Refresh sales", exact: true }).click(); await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await db.order.delete({ where: { id: `${prefix}-poll` } });
});

test("edits private product costs and records, reports and voids a verified refund without changing stock", async ({ page }) => {
  test.setTimeout(90_000); await login(page);
  await page.goto(`/admin/products/${prefix}/edit`); await page.getByLabel("Cost price per unit (LKR, optional)").fill("600"); await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(async () => (await db.product.findUniqueOrThrow({ where: { id: prefix } })).costPriceCents).toBe(60000);
  expect((await db.orderItem.findUniqueOrThrow({ where: { id: itemId } })).unitCostCents).toBeNull();
  const publicProduct = await page.request.get(`/products/${prefix}`); expect(publicProduct.ok()).toBe(true); expect(await publicProduct.text()).not.toContain("costPriceCents");
  await page.goto(`/admin/orders/${onlineId}`); const accounting = page.getByRole("region", { name: "Sales accounting" });
  await accounting.getByText("Product cost history", { exact: true }).click(); await accounting.getByLabel(`Historical unit cost for ${itemId}`).fill("400"); await accounting.getByRole("button", { name: "Save historical costs" }).click(); await expect(accounting.getByRole("status")).toContainText("Historical costs saved");
  await expect.poll(async () => (await report(page)).totals.profitCents, { timeout: 10000 }).toBe(140000);
  const confirmation = await page.request.get(`/checkout/success?order_id=${onlineId}`); expect(confirmation.ok()).toBe(true); expect(await confirmation.text()).not.toContain("unitCostCents");
  await accounting.getByText("Record a completed refund", { exact: true }).click(); await accounting.getByLabel("Refund reference", { exact: true }).fill("BROWSER-REFUND-1"); await accounting.getByLabel("Refund date and time (Sri Lanka)").fill(`${date}T09:00`);
  await accounting.getByLabel(`Refund amount for ${itemId}`).fill("500"); await accounting.getByLabel(`Returned quantity for ${itemId}`).fill("1"); await accounting.getByLabel("Delivery refund (LKR)").fill("100"); await accounting.getByLabel("Refund reason", { exact: true }).fill("Verified customer return");
  await accounting.getByLabel("I verified that this refund has already been completed.").check(); await accounting.getByRole("button", { name: "Record verified refund", exact: true }).click(); await expect(accounting.getByRole("status")).toContainText("Verified refund recorded");
  await expect.poll(async () => (await report(page)).totals, { timeout: 10000 }).toMatchObject({ revenueCents: 215000, netSalesCents: 190000, refundCents: 60000, profitCents: 130000 });
  expect((await db.plainTshirtStock.findUniqueOrThrow({ where: { id: stockId } })).quantity).toBe(3); expect((await db.order.findUniqueOrThrow({ where: { id: onlineId } })).total).toBe(2250);
  page.once("dialog", dialog => dialog.accept("Correcting reporting record")); await accounting.getByRole("button", { name: "Void record", exact: true }).click(); await expect(accounting.getByRole("status")).toContainText("Refund reporting record voided");
  await expect.poll(async () => (await report(page)).totals, { timeout: 10000 }).toMatchObject({ revenueCents: 275000, refundCents: 0, profitCents: 140000 });
  await page.goto(path); await expect(tile(page, "Gross profit")).toContainText("1,400"); await page.screenshot({ path: test.info().outputPath("sales-desktop.png"), fullPage: true });
});
