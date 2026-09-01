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

import { DepartmentCards, MIN_DEPARTMENT_CARDS } from "@/app/_components/home/department-cards";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }],
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

describe("DepartmentCards", () => {
  it("renders nothing when only one department has designs", () => {
    // Production today: the migration inserts four departments, the deploy
    // never seeds, and both shipped designs sit under `women`.
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "women" }),
        dept({ slug: "men", name: "Men", tileName: "Men", designs: [] }),
        dept({ slug: "plain", tileName: "Plain T-Shirts", subName: null, designs: [] }),
        dept({ slug: "accessories", tileName: "Accessories", subName: null, designs: [] }),
      ],
    });

    expect(tree).toBeNull();
  });

  it("renders once at least two departments have designs, omitting the empty ones", () => {
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "women" }),
        dept({ slug: "men", name: "Men", tileName: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
        dept({ slug: "plain", tileName: "Plain T-Shirts", subName: null, designs: [] }),
      ],
    });
    const hrefs = collectHrefs(tree);

    expect(hrefs).toEqual(["/categories/women", "/categories/men"]);
    expect(hrefs).not.toContain("/categories/plain");
  });

  it("labels a tile with tileName and note, and paints it with the row's hex", () => {
    // #123456 appears in neither DEPARTMENT_TINTS nor DESIGN_TINTS, so this
    // passes only if the tile reads the database column rather than
    // tintForSlug(). A real seeded value would not tell the two apart.
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "plain", tileName: "Plain T-Shirts", note: "Unisex", hex: "#123456" }),
        dept({ slug: "women" }),
      ],
    });

    expect(collectProp(tree, "label")).toContain("Plain T-Shirts");
    expect(collectProp(tree, "subLabel")).toContain("Unisex");
    expect(collectProp(tree, "hex")).toContain("#123456");
  });

  it("states its threshold", () => {
    expect(MIN_DEPARTMENT_CARDS).toBe(2);
  });
});
