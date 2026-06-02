import { test, expect } from "@playwright/test";
import { ADMIN, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.beforeAll(async () => {
  await seedTestUsers();
});

test.afterAll(async () => {
  await deleteTestUsers();
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login?callbackUrl=/about");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", ADMIN.password);
  await Promise.all([
    page.waitForURL("/about"),
    page.click('button[type="submit"]'),
  ]);
}

test("directory renders with role tabs + search, URL-driven", async ({ page }) => {
  await login(page);
  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  for (const t of ["Customers", "Admins", "All"]) {
    await expect(page.getByRole("button", { name: new RegExp(t) })).toBeVisible();
  }
  await page.getByRole("button", { name: /Admins/ }).click();
  await expect(page).toHaveURL(/role=admins/);
  // the seeded admin shows under the Admins tab
  await expect(page.getByText(ADMIN.email)).toBeVisible();
});

test("opening own profile shows the self-guard and unknown id 404s", async ({ page }) => {
  await login(page);
  await page.goto("/admin/customers?role=admins");
  // The name cell carries the <Link>; email is plain text and non-navigable.
  // Use role=link to avoid the duplicate "E2E Admin" button in the header.
  await page.getByRole("link", { name: new RegExp(ADMIN.name) }).click();
  await expect(page).toHaveURL(/\/admin\/customers\/.+/);
  await expect(page.getByText(/\(you\)/)).toBeVisible(); // self-guard on own role

  await page.goto("/admin/customers/does-not-exist-xyz");
  await expect(page.getByText("Customer not found")).toBeVisible();
});
