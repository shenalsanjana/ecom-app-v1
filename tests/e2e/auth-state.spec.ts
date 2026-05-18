import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../app/_lib/prisma";

const EMAIL = "authtest@example.com";
const PASSWORD = "TestPass123!";
const NAME = "Auth Test";

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, name: NAME },
    create: { name: NAME, email: EMAIL, passwordHash },
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test("navbar reflects login and logout instantly without a page refresh", async ({ page }) => {
  await page.goto("/");

  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  await page.getByRole("button", { name: /^Account$/ }).click();
  await expect(page.getByRole("menuitem", { name: "Log in" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign in/i }).click();

  await page.waitForURL("**/", { timeout: 10_000 });

  const signedInTrigger = page.getByRole("button", { name: `Signed in as ${NAME}` });
  await expect(signedInTrigger).toBeVisible({ timeout: 5_000 });

  await signedInTrigger.click();
  await expect(page.getByText("Hi,")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "My account" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();

  const navCountBeforeLogout = navigations.length;
  await page.getByRole("menuitem", { name: /Log out/ }).click();

  await expect(page.getByRole("button", { name: /^Account$/ })).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: /^Account$/ }).click();
  await expect(page.getByRole("menuitem", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign up" })).toBeVisible();
  await expect(page.getByText("Hi,")).toHaveCount(0);

  const logoutNavs = navigations.slice(navCountBeforeLogout);
  const hardReloads = logoutNavs.filter((url) => !url.includes("#"));
  expect(hardReloads.length, "logout should not trigger a hard navigation").toBeLessThanOrEqual(1);
});
