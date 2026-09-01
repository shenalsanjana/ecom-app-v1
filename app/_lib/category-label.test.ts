import { describe, it, expect } from "vitest";
import { cardEyebrow } from "@/app/_lib/category-label";

// A card carries its design *slug*, not the design name — ProductView.category
// is `p.designSlug`. So the second argument is prettified, and "cat" reads
// "Cat"; the plural design name "Cats" is never in the card's hands.
describe("cardEyebrow", () => {
  it("reads department then design", () => {
    expect(cardEyebrow("Women", "cat")).toBe("Women › Cat");
  });

  it("prettifies a multi-word design slug on the design side only", () => {
    expect(cardEyebrow("Women", "day-dresses")).toBe("Women › Day Dresses");
  });

  it("falls back to the design alone with no dangling separator", () => {
    expect(cardEyebrow(null, "cat")).toBe("Cat");
  });
});
