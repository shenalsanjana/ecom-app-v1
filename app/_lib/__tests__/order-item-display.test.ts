import { describe, it, expect } from "vitest";
import { formatOrderItemLine, omittedItemCount } from "../order-item-display";

describe("formatOrderItemLine", () => {
  it("renders product, color, and quantity as 'Product - Color xN'", () => {
    expect(formatOrderItemLine({ name: "Cat Tee", color: "White", quantity: 2 })).toBe("Cat Tee - White x2");
  });

  it("falls back to an em dash when color is missing (admin views never omit the field)", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: null, quantity: 1 })).toBe("Bear Cap - — x1");
  });

  it("falls back to an em dash when color is undefined", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", quantity: 1 })).toBe("Bear Cap - — x1");
  });

  it("falls back to an em dash when color is blank/whitespace", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "   ", quantity: 1 })).toBe("Bear Cap - — x1");
  });
});

describe("omittedItemCount", () => {
  it("returns 0 when every item is shown", () => {
    expect(omittedItemCount(2, 2)).toBe(0);
  });

  it("returns the difference when more items exist than are shown", () => {
    expect(omittedItemCount(5, 2)).toBe(3);
  });

  it("never goes negative", () => {
    expect(omittedItemCount(1, 2)).toBe(0);
  });
});
