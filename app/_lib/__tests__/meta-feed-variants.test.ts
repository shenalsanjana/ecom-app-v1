import { describe, it, expect } from "vitest";
import { variantToFeedRow, feedRowsToCsv, FEED_COLUMNS, type FeedVariant, type FeedRow } from "../meta-feed";

const base: FeedVariant = {
  productId: "cat-tee", productName: "Oversize Cat T-Shirt", color: "White", colorSlug: "white",
  description: "Soft   cotton\n tee", sku: "CAT-WHITE",
  price: 2190, originalPrice: null, inStock: true, image: "/products/cat-tee/white/card/1.jpg",
};

describe("variantToFeedRow", () => {
  it("uses the SKU as id and the product id as item_group_id", () => {
    const row = variantToFeedRow(base);
    expect(row.id).toBe("CAT-WHITE");
    expect(row.item_group_id).toBe("cat-tee");
    expect(row.link).toContain("/products/cat-tee?color=white");
  });
  it("falls back to product-color id when SKU is absent", () => {
    expect(variantToFeedRow({ ...base, sku: null }).id).toBe("cat-tee-white");
  });
  it("collapses description whitespace and marks availability", () => {
    const row = variantToFeedRow({ ...base, inStock: false });
    expect(row.description).toBe("Soft cotton tee");
    expect(row.availability).toBe("out of stock");
  });
  it("inverts price/sale_price on sale", () => {
    const row = variantToFeedRow({ ...base, price: 1990, originalPrice: 2490 });
    expect(row.price).toBe("2490.00 LKR");
    expect(row.sale_price).toBe("1990.00 LKR");
  });
  it("leaves sale_price empty and uses the current price when not on sale", () => {
    const row = variantToFeedRow(base); // base has originalPrice: null
    expect(row.sale_price).toBe("");
    expect(row.price).toBe("2190.00 LKR");
  });
  it("marks in-stock availability", () => {
    const row = variantToFeedRow(base); // base has inStock: true
    expect(row.availability).toBe("in stock");
  });
});

describe("feedRowsToCsv", () => {
  it("emits the FEED_COLUMNS header joined by commas", () => {
    const csv = feedRowsToCsv([]);
    expect(csv.split("\n")[0]).toBe(FEED_COLUMNS.join(","));
  });
  it("quotes and escapes cells containing commas, quotes, or newlines", () => {
    const row: FeedRow = {
      id: "id1",
      title: 'Title, with "quotes"',
      description: "Line one\nLine two",
      availability: "in stock",
      condition: "new",
      price: "1000.00 LKR",
      sale_price: "",
      link: "https://example.com/p/id1",
      image_link: "https://example.com/i/id1.jpg",
      brand: "Dressing Bear",
      google_product_category: "Apparel & Accessories > Clothing",
      item_group_id: "id1",
    };
    const csv = feedRowsToCsv([row]);
    expect(csv.startsWith(FEED_COLUMNS.join(",") + "\n")).toBe(true);
    // Every cell is quoted; embedded quotes are doubled per RFC4180-style escaping.
    // The description cell also carries a raw embedded newline inside its quotes.
    expect(csv).toContain('"Title, with ""quotes"""');
    expect(csv).toContain('"Line one\nLine two"');
  });
});
