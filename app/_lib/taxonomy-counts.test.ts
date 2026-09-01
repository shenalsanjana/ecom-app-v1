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
    const byDesign = countsByDesign([
      { category: "cat" }, { category: "cat" }, { category: "dino" }, { category: "car" },
    ]);
    const byDept = countsByDepartment(departments, byDesign);
    expect(byDept.get("women")).toBe(3);
    expect(byDept.get("men")).toBe(1);
  });

  it("gives an empty department zero rather than leaving it absent", () => {
    // The sidebar renders the number directly; `undefined` would print nothing.
    expect(countsByDepartment(departments, countsByDesign([])).get("plain")).toBe(0);
  });

  it("ignores a product whose design belongs to no listed department", () => {
    const byDesign = countsByDesign([{ category: "cat" }, { category: "orphan" }]);
    const byDept = countsByDepartment(departments, byDesign);
    expect([...byDept.values()].reduce((a, b) => a + b, 0)).toBe(1);
  });
});
