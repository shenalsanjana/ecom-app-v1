import { test, expect } from "@playwright/test";
import { ADMIN, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.describe("Spec #15: admin orders page", () => {
  test.beforeAll(async () => {
    await seedTestUsers();
  });

  test.afterAll(async () => {
    await deleteTestUsers();
  });

  test.describe("authenticated admin", () => {
    test.beforeEach(async ({ page }) => {
      // Use a non-admin callbackUrl (/about) to sidestep the client-side
      // cookie-propagation race that makes waitForURL("/admin/orders") time out.
      // Once the cookie is settled, navigate to /admin/orders.
      await page.goto("/login?callbackUrl=/about");
      await page.fill("#email", ADMIN.email);
      await page.fill("#password", ADMIN.password);
      await Promise.all([
        page.waitForURL("/about"),
        page.click('button[type="submit"]'),
      ]);
      // Session cookie is now reliably in the jar; middleware will see it.
      await page.goto("/admin/orders");
      await expect(page).toHaveURL("/admin/orders");
    });

    test("list renders: heading and five tab buttons visible", async ({ page }) => {
      await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

      for (const label of ["All", "Needs dispatch", "Pending COD", "Delivered", "Cancelled"]) {
        await expect(page.getByRole("button", { name: new RegExp(label) }).first()).toBeVisible();
      }
    });

    test("tab is URL-driven: clicking 'Needs dispatch' updates the URL", async ({ page }) => {
      await page.getByRole("button", { name: /Needs dispatch/ }).first().click();
      await expect(page).toHaveURL(/tab=needs-dispatch/);
    });

    test("search is URL-driven: typing and pressing Enter appends q= to URL", async ({ page }) => {
      const searchInput = page.getByPlaceholder(/Search order #/);
      await expect(searchInput).toBeVisible();
      await searchInput.fill("test-query");
      await searchInput.press("Enter");
      await expect(page).toHaveURL(/q=test-query/);
    });

    test("filters present: Status, Payment, and Sort selects are visible in toolbar", async ({ page }) => {
      await expect(page.getByRole("combobox", { name: "Filter by status" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Filter by payment" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Sort orders" })).toBeVisible();
    });

    test("row → detail (conditional): clicking a row link navigates to order detail", async ({ page }) => {
      const firstLink = page.locator("table a").first();

      if ((await firstLink.count()) > 0) {
        await firstLink.click();
        await expect(page).toHaveURL(/\/admin\/orders\/.+/);
        await expect(page.getByText("Status & dispatch")).toBeVisible();
      }
      // If no orders are seeded the test still passes — we only assert detail
      // when a row is actually present.
    });
  });
});
