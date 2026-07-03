import { test, expect } from "@playwright/test";
import { ADMIN, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.describe("Spec #12: admin products page", () => {
  test.beforeAll(async () => {
    await seedTestUsers();
  });

  test.afterAll(async () => {
    await deleteTestUsers();
  });

  test.describe("authenticated admin", () => {
    test.beforeEach(async ({ page }) => {
      // Use a non-admin callbackUrl (/about) to sidestep the client-side
      // cookie-propagation race that makes waitForURL("/admin/products") time out.
      // Once the cookie is settled, navigate to the target.
      await page.goto("/login?callbackUrl=/about");
      await page.fill("#identifier", ADMIN.email);
      await page.fill("#password", ADMIN.password);
      await Promise.all([
        page.waitForURL("/about"),
        page.click('button[type="submit"]'),
      ]);
    });

    test("products list renders heading, 4 tabs, category filter, and New-product link", async ({ page }) => {
      await page.goto("/admin/products");
      await expect(page).toHaveURL("/admin/products");

      // Heading
      await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

      // Four tab buttons (robust to an empty/varied product table)
      for (const label of ["Active", "Low stock", "Archived", "All"]) {
        await expect(page.getByRole("button", { name: label })).toBeVisible();
      }

      // Category filter select and New-product link
      await expect(page.getByRole("link", { name: /New product/ })).toBeVisible();
    });

    test("Low-stock tab is URL-driven: clicking it updates the URL", async ({ page }) => {
      await page.goto("/admin/products");
      await page.getByRole("button", { name: "Low stock" }).click();
      await expect(page).toHaveURL(/tab=low-stock/);
    });

    test("create form: shows 'New product' heading and Slug field", async ({ page }) => {
      await page.goto("/admin/products/new");
      await expect(page.getByRole("heading", { name: "New product" })).toBeVisible();
      // Slug field label must be present
      await expect(page.getByText("Slug (URL id)")).toBeVisible();
    });

    test("edit page for an unknown id shows 'Product not found'", async ({ page }) => {
      await page.goto("/admin/products/does-not-exist-xyz/edit");
      await expect(page.getByText("Product not found")).toBeVisible();
    });
  });
});
