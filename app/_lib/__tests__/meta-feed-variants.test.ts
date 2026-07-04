import { describe, it, expect } from "vitest";
import { variantToFeedRow, type FeedVariant } from "../meta-feed";

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
});
