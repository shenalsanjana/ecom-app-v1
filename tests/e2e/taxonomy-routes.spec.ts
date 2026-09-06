import { test, expect } from "@playwright/test";

// `/categories/cat` and `/categories/dino` are live, search-indexed URLs. The
// nested taxonomy must keep them reachable as permanent redirects rather than
// 404s — that is the whole point of the catch-all route.
//
// The HTTP-level block below runs without a browser, so it still guards the
// redirect contract on machines where Chromium cannot launch.

test.describe("HTTP contract", () => {
  test("legacy /categories/cat 308s to /categories/women/cat", async ({ request }) => {
    const res = await request.get("/categories/cat", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toContain("/categories/women/cat");
  });

  test("legacy /categories/dino 308s to /categories/women/dino", async ({ request }) => {
    const res = await request.get("/categories/dino", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toContain("/categories/women/dino");
  });

  test("a wrong department segment 308s to the canonical nested path", async ({ request }) => {
    const res = await request.get("/categories/men/cat", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toContain("/categories/women/cat");
  });

  test("department and design pages return 200", async ({ request }) => {
    expect((await request.get("/categories/women")).status()).toBe(200);
    expect((await request.get("/categories/women/cat")).status()).toBe(200);
  });

  test("unknown slugs 404", async ({ request }) => {
    expect((await request.get("/categories/definitely-not-real")).status()).toBe(404);
    expect((await request.get("/categories/women/definitely-not-real")).status()).toBe(404);
    expect((await request.get("/categories/women/cat/extra")).status()).toBe(404);
  });

  test("a design page emits only nested paths for its own links", async ({ request }) => {
    const html = await (await request.get("/categories/women/cat")).text();
    // Canonical, breadcrumb and sibling links all resolve through designPath —
    // a flat `/categories/{slug}` here would 308 away and drop sort/page state.
    expect(html).toMatch(/rel="canonical" href="[^"]*\/categories\/women\/cat"/);
    expect(html).toContain('href="/categories/women"');
    expect(html).toContain('href="/categories/women/dino"');
  });

  test("bare /categories 308s to the home page, carrying its query", async ({ request }) => {
    // The shop-all list moved onto "/". Everything below /categories is
    // untouched — the redirect matches the bare path only.
    const bare = await request.get("/categories", { maxRedirects: 0 });
    expect(bare.status()).toBe(308);
    expect(new URL(bare.headers()["location"], "http://x").pathname).toBe("/");

    const filtered = await request.get("/categories?category=cat&page=2", { maxRedirects: 0 });
    expect(filtered.status()).toBe(308);
    const to = new URL(filtered.headers()["location"], "http://x");
    expect(to.pathname).toBe("/");
    expect(to.searchParams.get("category")).toBe("cat");
    expect(to.searchParams.get("page")).toBe("2");
  });

  test("the shop-all home page links each department to its nested route", async ({ request }) => {
    const html = await (await request.get("/")).text();
    for (const slug of ["men", "women", "plain", "accessories"]) {
      expect(html).toContain(`href="/categories/${slug}"`);
    }
  });
});

test.describe("rendered pages", () => {
  // NOTE: this test does NOT verify the redirect contract, and must not be
  // read as if it does. `page.goto` reports the status of the FINAL response
  // and follows a `<meta http-equiv="refresh">` just as happily as a 308, so
  // this assertion passes either way — it passed while the route was serving
  // 200 + meta-refresh, which is exactly the regression that matters. The 308
  // itself is asserted by the `HTTP contract` request.get tests above. All
  // this adds is that the browser ends up rendering the nested page.
  test("a browser following the legacy URL ends up on the nested page", async ({ page }) => {
    const res = await page.goto("/categories/cat");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/categories/women/cat");
  });

  test("department page renders its designs as tiles", async ({ page }) => {
    await page.goto("/categories/women");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Women");
    await expect(page.getByRole("link", { name: "Cats" })).toHaveAttribute(
      "href",
      "/categories/women/cat",
    );
  });

  test("design page renders", async ({ page }) => {
    await page.goto("/categories/women/cat");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Cats");
  });

  test("wrong department segment redirects to canonical", async ({ page }) => {
    await page.goto("/categories/men/cat");
    expect(new URL(page.url()).pathname).toBe("/categories/women/cat");
  });

  test("unknown slug 404s", async ({ page }) => {
    const res = await page.goto("/categories/definitely-not-real");
    expect(res?.status()).toBe(404);
  });
});
