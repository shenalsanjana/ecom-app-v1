import { describe, it, expect } from "vitest";
import { designPath, showsNavDropdown, showsInDesignSection } from "../taxonomy";
import type { DepartmentView } from "../taxonomy";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }],
  ...over,
});

describe("designPath", () => {
  it("builds a nested path", () => {
    expect(designPath("women", "cat")).toBe("/categories/women/cat");
  });
});

describe("derived department behaviour", () => {
  it("shows a nav dropdown only when the department has designs", () => {
    expect(showsNavDropdown(dept({}))).toBe(true);
    expect(showsNavDropdown(dept({ designs: [] }))).toBe(false);
  });

  it("shows in the design section only with both a subName and designs", () => {
    expect(showsInDesignSection(dept({}))).toBe(true);
    expect(showsInDesignSection(dept({ subName: null }))).toBe(false);
    expect(showsInDesignSection(dept({ designs: [] }))).toBe(false);
  });
});
