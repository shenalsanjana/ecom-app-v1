import { describe, it, expect, vi, beforeEach } from "vitest";

describe("absoluteUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("APP_URL", "https://dressingbear.example");
  });

  it("joins base and path with exactly one slash", async () => {
    const { absoluteUrl } = await import("@/app/_lib/absolute-url");
    expect(absoluteUrl("/products/p1")).toBe("https://dressingbear.example/products/p1");
  });

  it("handles a path without a leading slash", async () => {
    const { absoluteUrl } = await import("@/app/_lib/absolute-url");
    expect(absoluteUrl("feed/meta-catalog.csv")).toBe("https://dressingbear.example/feed/meta-catalog.csv");
  });

  it("does not double the slash when base has a trailing slash", async () => {
    vi.stubEnv("APP_URL", "https://dressingbear.example/");
    const { absoluteUrl } = await import("@/app/_lib/absolute-url");
    expect(absoluteUrl("/products/p1")).toBe("https://dressingbear.example/products/p1");
  });

  it("falls back to localhost when APP_URL is unset", async () => {
    vi.stubEnv("APP_URL", "");
    const { absoluteUrl } = await import("@/app/_lib/absolute-url");
    expect(absoluteUrl("/x")).toBe("http://localhost:3000/x");
  });
});
