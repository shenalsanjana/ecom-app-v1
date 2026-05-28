import { test, expect } from "@playwright/test";
import { ADMIN, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.describe("Spec #2: admin UI shell", () => {
  test.beforeAll(async () => {
    await seedTestUsers();
  });

  test.afterAll(async () => {
    await deleteTestUsers();
  });

  test.describe("authenticated admin", () => {
    test.beforeEach(async ({ page }) => {
      // Use a non-admin callbackUrl (/about) to sidestep the client-side
      // cookie-propagation race that makes waitForURL("/admin") time out.
      // This follows the same path as admin-auth.spec.ts test #7 which is
      // known to pass. Once the cookie is settled, navigate to /admin.
      await page.goto("/login?callbackUrl=/about");
      await page.fill("#email", ADMIN.email);
      await page.fill("#password", ADMIN.password);
      await Promise.all([
        page.waitForURL("/about"),
        page.click('button[type="submit"]'),
      ]);
      // Session cookie is now reliably in the jar; middleware will see it.
      await page.goto("/admin");
      await expect(page).toHaveURL("/admin");
    });

    test("chrome renders with brand and 5 sidebar items", async ({ page }) => {
      await expect(page.getByText("Dressing Bear · Admin")).toBeVisible();
      for (const label of ["Dashboard", "Orders", "Products", "Customers", "Settings"]) {
        await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
      }
    });

    test("each of the 4 KPI tiles shows a numeric value", async ({ page }) => {
      const labels = [
        "Pending dispatch",
        "Today's orders",
        "Pending COD",
        "Low-stock products",
      ];
      for (const label of labels) {
        const labelEl = page.getByText(label, { exact: true });
        await expect(labelEl).toBeVisible();
        // The value sits as a sibling <p> inside the same Card.
        const value = labelEl.locator("xpath=following-sibling::p").first();
        await expect(value).toHaveText(/^\d+$/);
      }
    });

    test("clicking Orders navigates to /admin/orders", async ({ page }) => {
      await page.getByRole("link", { name: "Orders" }).first().click();
      await expect(page).toHaveURL("/admin/orders");
    });

    test("user dropdown 'Back to store' navigates to /", async ({ page }) => {
      await page.getByRole("button", { name: ADMIN.name }).click();
      await page.getByRole("menuitem", { name: "Back to store" }).click();
      await expect(page).toHaveURL("/");
    });

    test("user dropdown 'Sign out' clears the session", async ({ page }) => {
      await page.getByRole("button", { name: ADMIN.name }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(page).toHaveURL("/");

      // Session cleared → /admin now bounces to /login.
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin$/);
    });

    test("mobile viewport opens the drawer via hamburger", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      await page.getByRole("button", { name: "Open menu" }).click();

      // shadcn Sheet renders role="dialog"; scope assertions to the drawer
      // so they don't match the desktop sidebar's (CSS-hidden) duplicates.
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Dashboard" })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Orders" })).toBeVisible();
    });
  });
});
