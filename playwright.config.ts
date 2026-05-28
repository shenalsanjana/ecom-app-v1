import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Load env into the runner process before workers fork. The fixtures
// use prisma directly (needs DATABASE_URL); the webServer (next dev)
// loads .env.local on its own.
for (const f of [".env", ".env.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
