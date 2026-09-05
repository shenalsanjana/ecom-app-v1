import { describe, it, expect } from "vitest";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";

const women = { slug: "women", name: "Women", subName: "Oversized Graphic T-Shirts" };
const plain = { slug: "plain", name: "Plain T-Shirts (Unisex)", subName: null };
const cats = { slug: "cat", name: "Cats" };

describe("taxonomyTrail", () => {
  it("starts every trail at a single Shop all crumb", () => {
    // Home and Categories were two crumbs pointing at two pages; the catalogue
    // moved onto "/" and they became one.
    expect(taxonomyTrail({})).toEqual([{ label: "Shop all" }]);
  });

  it("ends a department page on the department, unlinked and without its sub-category", () => {
    // The sub-category is context for a design, not a place you can be. Omitting
    // it here also stops the department crumb linking to the page you are on.
    expect(taxonomyTrail({ department: women })).toEqual([
      { label: "Shop all", href: "/" },
      { label: "Women" },
    ]);
  });

  it("shows the sub-category, unlinked, between department and design", () => {
    expect(taxonomyTrail({ department: women, design: cats })).toEqual([
      { label: "Shop all", href: "/" },
      { label: "Women", href: "/categories/women" },
      { label: "Oversized Graphic T-Shirts" },
      { label: "Cats" },
    ]);
  });

  it("omits the sub-category crumb for a department that has none", () => {
    const labels = taxonomyTrail({ department: plain, design: { slug: "tote", name: "Tote" } })
      .map((c) => c.label);
    expect(labels).toEqual(["Shop all", "Plain T-Shirts (Unisex)", "Tote"]);
  });

  it("links the design when a product follows it", () => {
    const trail = taxonomyTrail({ department: women, design: cats, productName: "Cat Tee" });
    expect(trail.at(-2)).toEqual({ label: "Cats", href: "/categories/women/cat" });
    expect(trail.at(-1)).toEqual({ label: "Cat Tee" });
  });

  it("never leaves an href on the final crumb", () => {
    for (const input of [
      {},
      { department: women },
      { department: women, design: cats },
      { department: women, design: cats, productName: "Cat Tee" },
    ]) {
      expect(taxonomyTrail(input).at(-1)?.href).toBeUndefined();
    }
  });

  it("drops a design that has no department, rather than inventing a path", () => {
    // designPath needs both segments; a design with no department cannot be linked.
    expect(taxonomyTrail({ design: cats }).map((c) => c.label)).toEqual(["Shop all"]);
  });
});
