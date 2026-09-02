import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { navColumns } from "@/app/_lib/taxonomy-nav";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }],
  ...over,
});

describe("navColumns", () => {
  it("builds one column per department, using the nav label", () => {
    const cols = navColumns([dept({ navLabel: "Women" })]);
    expect(cols).toEqual([
      {
        label: "Women",
        note: null,
        href: "/categories/women",
        designs: [{ label: "Cats", href: "/categories/women/cat" }],
      },
    ]);
  });

  it("omits a department with no designs, through the derived rule", () => {
    const cols = navColumns([dept({ slug: "women" }), dept({ slug: "men", navLabel: "Men", designs: [] })]);
    expect(cols.map((c) => c.href)).toEqual(["/categories/women"]);
  });

  it("includes a department that has designs but no sub-category", () => {
    // showsNavDropdown asks only about designs — unlike the home design grid,
    // the nav lists Plain Tees and Accessories too.
    const cols = navColumns([
      dept({ slug: "plain", navLabel: "Plain Tees", subName: null,
             designs: [{ slug: "tote", name: "Tote", hex: "#C9B79A", image: null }] }),
    ]);
    expect(cols).toHaveLength(1);
    expect(cols[0].designs[0].href).toBe("/categories/plain/tote");
  });

  it("carries the department's qualifier through to the nav", () => {
    const cols = navColumns([
      dept({ slug: "plain", navLabel: "Plain Tees", note: "Unisex" }),
    ]);
    expect(cols[0].note).toBe("Unisex");
  });
});
