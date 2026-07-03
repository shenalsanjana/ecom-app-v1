import { test, expect } from "@playwright/test";
import { ADMIN, CUSTOMER, seedTestUsers, deleteTestUsers } from "./fixtures/users";

test.describe("Spec #1: admin route protection", () => {
  test.beforeAll(async () => {
    await seedTestUsers();
  });

  test.afterAll(async () => {
    await deleteTestUsers();
  });

  test.describe("anonymous", () => {
    test("/admin redirects to /login with encoded callbackUrl", async ({ page }) => {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin$/);
    });

    test("/admin/anything/deep redirects with encoded path", async ({ page }) => {
      await page.goto("/admin/anything/deep");
      await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin%2Fanything%2Fdeep$/);
    });

    test("/api/admin/anything returns 401", async ({ request }) => {
      const res = await request.get("/api/admin/anything", { maxRedirects: 0 });
      expect(res.status()).toBe(401);
    });
  });

  test.describe("customer", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/login");
      await page.fill("#identifier", CUSTOMER.email);
      await page.fill("#password", CUSTOMER.password);
      await Promise.all([
        page.waitForURL("/"),
        page.click('button[type="submit"]'),
      ]);
    });

    test("/admin redirects to /", async ({ page }) => {
      await page.goto("/admin");
      await expect(page).toHaveURL("/");
    });

    test("/api/admin/anything returns 403", async ({ page }) => {
      const res = await page.request.get("/api/admin/anything", { maxRedirects: 0 });
      expect(res.status()).toBe(403);
    });
  });

  test.describe("admin", () => {
    test("login with no callbackUrl redirects straight to /admin", async ({ page }) => {
      // Regression guard: an admin logging in with no callbackUrl must be
      // pushed directly to /admin by the client redirect effect. This used to
      // hang on /login ("Signing in…") because update() re-rendered the page in
      // a loop and router.refresh() aborted the in-flight push to the slower,
      // auth-gated /admin route. See app/(auth)/login/page.tsx.
      await page.goto("/login");
      await page.fill("#identifier", ADMIN.email);
      await page.fill("#password", ADMIN.password);
      await Promise.all([
        page.waitForURL("**/admin", { timeout: 15_000 }),
        page.click('button[type="submit"]'),
      ]);
      await expect(page).toHaveURL(/\/admin$/);
    });

    test("login with callbackUrl=/about honours the callback", async ({ page }) => {
      await page.goto("/login?callbackUrl=/about");
      await page.fill("#identifier", ADMIN.email);
      await page.fill("#password", ADMIN.password);
      await Promise.all([
        page.waitForURL("/about"),
        page.click('button[type="submit"]'),
      ]);
      await expect(page).toHaveURL("/about");
    });
  });
});
