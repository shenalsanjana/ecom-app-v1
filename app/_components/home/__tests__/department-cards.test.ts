import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

// `@/app/_lib/taxonomy` builds getDepartments with unstable_cache at module
// scope, so importing it for the real showsNavDropdown pulls in both of these.
vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import {
  DepartmentCards, MIN_DEPARTMENT_CARDS, departmentSlides, departmentNote,
} from "@/app/_components/home/department-cards";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }],
  ...over,
});

/** Walk the returned element tree and collect every `href` prop. */
function collectHrefs(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectHrefs(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) {
    if (typeof props.href === "string") out.push(props.href);
    collectHrefs(props.children, out);
  }
  return out;
}

/** Collect the value of one prop from every element in the tree. */
function collectProp(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectProp(child, key, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) {
    if (key in props) out.push(props[key]);
    collectProp(props.children, key, out);
  }
  return out;
}

describe("departmentSlides", () => {
  it("projects one slide per design, carrying its photo, tint and name", () => {
    const slides = departmentSlides(dept({
      designs: [
        { slug: "cat", name: "Cats", hex: "#EFC4C4", image: "/cat.jpg" },
        { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
      ],
    }));

    expect(slides).toEqual([
      { hex: "#EFC4C4", photo: "/cat.jpg", label: "Cats" },
      { hex: "#BFD8C2", photo: null, label: "Dino" },
    ]);
  });
});

describe("departmentNote", () => {
  it("prefers the department's own note", () => {
    expect(departmentNote(dept({ note: "Unisex" }))).toBe("Unisex");
  });

  it("falls back to the design count", () => {
    // The prototype's "N products" branch is unreachable: DepartmentCards only
    // renders departments passing showsNavDropdown, so designs is never empty.
    expect(departmentNote(dept({
      note: null,
      designs: [
        { slug: "cat", name: "Cats", hex: "#EFC4C4", image: null },
        { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
      ],
    }))).toBe("2 designs");
  });
});

describe("DepartmentCards", () => {
  it("renders the name, note and link for each linked department", () => {
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "women", tileName: "Women", note: null }),
        dept({ slug: "men", tileName: "Men", note: "Unisex" }),
      ],
    });

    expect(collectHrefs(tree)).toEqual(["/categories/women", "/categories/men"]);
    expect(collectProp(tree, "name")).toEqual(["Women", "Men"]);
    expect(collectProp(tree, "note")).toEqual(["1 designs", "Unisex"]);
  });

  it("hands each card its own department's slides, not another's", () => {
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#111111", image: null }] }),
        dept({ slug: "men", designs: [{ slug: "car", name: "Car", hex: "#222222", image: null }] }),
      ],
    });

    expect(collectProp(tree, "slides")).toEqual([
      [{ hex: "#111111", photo: null, label: "Cats" }],
      [{ hex: "#222222", photo: null, label: "Car" }],
    ]);
  });

  it("still drops a department with no designs, and its threshold is unchanged", () => {
    expect(DepartmentCards({ departments: [dept({ designs: [] })] })).toBeNull();
    expect(MIN_DEPARTMENT_CARDS).toBe(2);
  });
});
