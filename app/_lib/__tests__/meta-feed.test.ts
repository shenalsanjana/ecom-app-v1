import { describe, it, expect, vi, beforeEach } from "vitest";

const base = "https://dressingbear.example";

function p(overrides: Partial<import("@/app/_lib/meta-feed").FeedProduct> = {}) {
  return {
    id: "p1",
    name: "Oversize Bear Tee",
    description: "Soft, heavy cotton.",
    price: 1990,
    originalPrice: null,
    stock: 5,
    image: "/products/p1/main.jpg",
    archived: false,
    ...overrides,
  };
}

describe("meta-feed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("APP_URL", base);
  });

  it("maps a regular (not-on-sale) product: price set, sale_price empty", async () => {
    const { productToFeedRow } = await import("@/app/_lib/meta-feed");
    const row = productToFeedRow(p());
    expect(row.id).toBe("p1");
    expect(row.price).toBe("1990.00 LKR");
    expect(row.sale_price).toBe("");
    expect(row.availability).toBe("in stock");
    expect(row.condition).toBe("new");
    expect(row.brand).toBe("Dressing Bear");
    expect(row.link).toBe(`${base}/products/p1`);
    expect(row.image_link).toBe(`${base}/products/p1/main.jpg`);
    expect(row.item_group_id).toBe("p1");
  });

  it("inverts price mapping on sale: price=originalPrice, sale_price=price", async () => {
    const { productToFeedRow } = await import("@/app/_lib/meta-feed");
    const row = productToFeedRow(p({ price: 1490, originalPrice: 1990 }));
    expect(row.price).toBe("1990.00 LKR");
    expect(row.sale_price).toBe("1490.00 LKR");
  });

  it("treats originalPrice <= price as not on sale", async () => {
    const { productToFeedRow } = await import("@/app/_lib/meta-feed");
    const row = productToFeedRow(p({ price: 1990, originalPrice: 1990 }));
    expect(row.price).toBe("1990.00 LKR");
    expect(row.sale_price).toBe("");
  });

  it("marks availability out of stock when stock is 0", async () => {
    const { productToFeedRow } = await import("@/app/_lib/meta-feed");
    expect(productToFeedRow(p({ stock: 0 })).availability).toBe("out of stock");
  });

  it("serializes rows to CSV with a header and quoted, escaped fields", async () => {
    const { productToFeedRow, feedRowsToCsv, FEED_COLUMNS } = await import("@/app/_lib/meta-feed");
    const csv = feedRowsToCsv([
      productToFeedRow(p({ description: 'He said "hi"\nthen left', name: "Tee, v2" })),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(FEED_COLUMNS.join(","));
    expect(lines[1]).toContain('"He said ""hi"" then left"'); // newline → space, quotes doubled
    expect(lines[1]).toContain('"Tee, v2"');                   // comma stays inside quotes
  });
});
