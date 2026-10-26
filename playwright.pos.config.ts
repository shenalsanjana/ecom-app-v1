import { defineConfig, devices } from "@playwright/test";

// This suite must never use the shop's configured DATABASE_URL.
const databaseUrl = process.env.POS_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Set POS_TEST_DATABASE_URL to the isolated local POS database.");
const url = new URL(databaseUrl);
if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/pos_test") {
  throw new Error("POS browser tests require the isolated pos_test database on localhost:55432.");
}
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["shop-pos.spec.ts", "sales-dashboard.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: "list",
  use: { baseURL: "http://localhost:3101", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
  webServer: {
    command: "npm run start -- --port 3101",
    url: "http://localhost:3101/login",
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: "isolated-local-pos-browser-test-secret",
      AUTH_URL: "http://localhost:3101",
      APP_URL: "http://localhost:3101",
      ROYAL_EXPRESS_ENABLED: "false",
      NEXT_PUBLIC_META_PIXEL_ID: "",
      NEXT_PUBLIC_META_PIXEL_ID_SECONDARY: "",
    },
  },
});
