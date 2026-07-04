import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const {
  reviewGroupBy, reviewAggregate, reviewFindMany, productFindUnique, productFindMany,
} = vi.hoisted(() => ({
  reviewGroupBy: vi.fn(),
  reviewAggregate: vi.fn(),
  reviewFindMany: vi.fn(),
  productFindUnique: vi.fn(),
  productFindMany: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    review: { groupBy: reviewGroupBy, aggregate: reviewAggregate, findMany: reviewFindMany },
    product: { findUnique: productFindUnique, findMany: productFindMany },
  },
}));

import {
  getFeaturedProducts, getProductDetail, getProductReviews, getReviewHistogram,
} from "../products";

beforeEach(() => {
  reviewGroupBy.mockReset().mockResolvedValue([]);
  reviewAggregate.mockReset().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } });
  reviewFindMany.mockReset().mockResolvedValue([]);
  productFindUnique.mockReset().mockResolvedValue({
    id: "cat-white", name: "Cat", price: 2190, originalPrice: null, image: "/x.jpg",
    description: "d", stock: 5, categorySlug: "cat", sizes: "S,M,L,XL", archived: false,
    category: { slug: "cat", name: "Cat", image: "/x.jpg" },
    variants: [{
      id: "var-1", productId: "cat-white", color: "White", colorSlug: "white",
      swatchHex: "#ffffff", sku: "SKU-1", price: null, originalPrice: null,
      sortOrder: 0, archived: false, images: [], sizeStocks: [],
    }],
  });
  productFindMany.mockReset().mockResolvedValue([]);
});

describe("review readers only see approved reviews", () => {
  it("getProductReviews filters approved:true", async () => {
    await getProductReviews("cat-white", 5);
    expect(reviewFindMany.mock.calls[0][0].where.approved).toBe(true);
  });

  it("getReviewHistogram filters approved:true", async () => {
    await getReviewHistogram("cat-white");
    expect(reviewGroupBy.mock.calls[0][0].where.approved).toBe(true);
  });

  it("getProductDetail rating aggregate filters approved:true", async () => {
    await getProductDetail("cat-white");
    expect(reviewAggregate.mock.calls[0][0].where.approved).toBe(true);
  });

  it("list-rating aggregate filters approved:true", async () => {
    productFindMany.mockResolvedValueOnce([{
      id: "cat-white", name: "Cat", price: 2190, originalPrice: null, categorySlug: "cat",
      variants: [{
        colorSlug: "white", color: "White", swatchHex: "#ffffff", price: null, originalPrice: null,
        sortOrder: 0, images: [{ url: "/x.jpg" }], sizeStocks: [{ size: "M", stock: 5 }],
      }],
    }]);
    await getFeaturedProducts();
    expect(reviewGroupBy.mock.calls[0][0].where.approved).toBe(true);
  });
});
