import { describe, it, expect } from "vitest";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";

const departments = [
  { slug: "women", designs: [{ slug: "cat" }, { slug: "dino" }] },
  { slug: "men", designs: [{ slug: "car" }] },
  { slug: "plain", designs: [] },
];

describe("countsByDesign", () => {
  it("counts products per design slug", () => {
    const counts = countsByDesign([
      { category: "cat" }, { category: "cat" }, { category: "dino" },
    ]);
    expect(counts.get("cat")).toBe(2);
    expect(counts.get("dino")).toBe(1);
  });

  it("reports nothing for a design with no products", () => {
    expect(countsByDesign([]).get("cat")).toBeUndefined();
  });
});

describe("countsByDepartment", () => {
  it("sums its designs' counts", () => {
    const products = [
      { category: "cat" }, { category: "cat" }, { category: "dino" }, { category: "car" },
    ];
    const byDept = countsByDepartment(departments, products);
    expect(byDept.get("women")).toBe(3);
    expect(byDept.get("men")).toBe(1);
  });

  it("gives an empty department zero rather than leaving it absent", () => {
    // The sidebar renders the number directly; `undefined` would print nothing.
    expect(countsByDepartment(departments, []).get("plain")).toBe(0);
  });

  it("ignores a product whose design belongs to no listed department", () => {
    const byDept = countsByDepartment(departments, [{ category: "cat" }, { category: "orphan" }]);
    expect([...byDept.values()].reduce((a, b) => a + b, 0)).toBe(1);
  });
  it("counts a product once per department across several collection placements", () => {
    const products = [{ category: "cat", collectionSlugs: ["cat", "cat", "dino", "car"] }];
    expect([...countsByDesign(products)]).toEqual([["cat", 1], ["dino", 1], ["car", 1]]);
    expect([...countsByDepartment(departments, products)]).toEqual([["women", 1], ["men", 1], ["plain", 0]]);
  });
});
