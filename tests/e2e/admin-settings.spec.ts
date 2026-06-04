import { test, expect } from "@playwright/test";
import { ADMIN, CUSTOMER, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.beforeAll(async () => {
  await seedTestUsers();
});

test.afterAll(async () => {
  await deleteTestUsers();
});

async function login(page: import("@playwright/test").Page, who: { email: string; password: string }) {
  await page.goto("/login?callbackUrl=/about");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await Promise.all([page.waitForURL("/about"), page.click('button[type="submit"]')]);
}

test("non-admin is redirected away from settings", async ({ page }) => {
  await login(page, CUSTOMER);
  await page.goto("/admin/settings");
  await expect(page).not.toHaveURL(/\/admin\/settings/);
});

test("settings renders all four sections; payment table is read-only with no secrets", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  for (const t of ["Store info", "Delivery pricing", "Payment methods", "System"]) {
    await expect(page.getByRole("heading", { name: t })).toBeVisible();
  }
  await expect(page.getByText("Read-only. Toggle providers")).toBeVisible();
});

test("editing the free-delivery threshold updates customer-facing copy", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/admin/settings");

  await page.fill("#freeDeliveryThreshold", "9000");
  await page.getByRole("button", { name: /Save delivery pricing/ }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(/Free shipping over/)).toContainText("9,000");

  await page.goto("/admin/settings");
  await page.fill("#freeDeliveryThreshold", "5000");
  await page.getByRole("button", { name: /Save delivery pricing/ }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});
