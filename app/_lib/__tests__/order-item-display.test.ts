import { describe, it, expect } from "vitest";
import { formatOrderItemLine, omittedItemCount } from "../order-item-display";

describe("formatOrderItemLine", () => {
  it("renders product, color, size, and quantity as 'Product - Color - Size xN'", () => {
    expect(formatOrderItemLine({ name: "Cat Tee", color: "White", size: "M", quantity: 2 })).toBe(
      "Cat Tee - White - M x2",
    );
  });

  it("falls back to an em dash when color is missing (admin views never omit the field)", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: null, size: "L", quantity: 1 })).toBe(
      "Bear Cap - — - L x1",
    );
  });

  it("falls back to an em dash when color is undefined", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", size: "L", quantity: 1 })).toBe("Bear Cap - — - L x1");
  });

  it("falls back to an em dash when color is blank/whitespace", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "   ", size: "L", quantity: 1 })).toBe(
      "Bear Cap - — - L x1",
    );
  });

  it("falls back to an em dash when size is missing", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "Black", size: null, quantity: 1 })).toBe(
      "Bear Cap - Black - — x1",
    );
  });

  it("falls back to an em dash when size is undefined", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "Black", quantity: 1 })).toBe(
      "Bear Cap - Black - — x1",
    );
  });

  it("falls back to an em dash when size is blank/whitespace", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", color: "Black", size: "  ", quantity: 1 })).toBe(
      "Bear Cap - Black - — x1",
    );
  });

  it("falls back to an em dash for both when color and size are missing", () => {
    expect(formatOrderItemLine({ name: "Bear Cap", quantity: 1 })).toBe("Bear Cap - — - — x1");
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
