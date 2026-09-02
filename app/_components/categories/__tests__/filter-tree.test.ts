import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { FilterTree } from "@/app/_components/categories/filter-tree";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }],
  ...over,
});

const departments = [
  dept({ slug: "women", designs: [
    { slug: "cat", name: "Cats", hex: "#EFC4C4", image: null },
    { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
  ] }),
  dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1", image: null }] }),
];

const byDesign = new Map([["cat", 3], ["dino", 1], ["car", 2]]);
const byDepartment = new Map([["women", 4], ["men", 2]]);

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

function collectText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === "string") { out.push(node); return out; }
  if (typeof node === "number") { out.push(String(node)); return out; }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectText(props.children, out);
  return out;
}

/** Every element carrying data-active, with its value. */
function activeFlags(node: unknown, out: { href: unknown; active: unknown }[] = []) {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) activeFlags(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) {
    if ("data-active" in props) out.push({ href: props.href, active: props["data-active"] });
    activeFlags(props.children, out);
  }
  return out;
}

describe("FilterTree", () => {
  it("links All and every department, holding the designs back until one is chosen", () => {
    const hrefs = collectHrefs(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "" }),
    );
    expect(hrefs).toEqual(["/categories", "/categories/women", "/categories/men"]);
  });

  it("unfolds only the selected design's own department", () => {
    const hrefs = collectHrefs(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "cat" }),
    );
    expect(hrefs).toEqual([
      "/categories",
      "/categories/women", "/categories/women/cat", "/categories/women/dino",
      "/categories/men",
    ]);
  });

  it("points All at the href it is given, so applied filters survive the click", () => {
    const hrefs = collectHrefs(
      FilterTree({
        departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "cat",
        allHref: "/categories?minPrice=1000",
      }),
    );
    expect(hrefs[0]).toBe("/categories?minPrice=1000");
  });

  it("shows a count beside every visible design, not just every department", () => {
    const text = collectText(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "cat" }),
    );
    // department totals
    expect(text).toContain("4");
    expect(text).toContain("2");
    // design counts
    expect(text).toContain("3");
    expect(text).toContain("1");
  });

  it("prints zero for a design with no products rather than nothing", () => {
    const text = collectText(
      FilterTree({
        departments: [dept({ designs: [{ slug: "ghost", name: "Ghost", hex: "#EFC4C4", image: null }] })],
        byDesign: new Map(), byDepartment: new Map([["women", 0]]),
        totalCount: 0, selectedDesign: "ghost",
      }),
    );
    expect(text).toContain("0");
  });

  it("marks the selected design and its parent department active, and nothing else", () => {
    const flags = activeFlags(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "cat" }),
    );
    const active = flags.filter((f) => f.active === true).map((f) => f.href);
    expect(active).toEqual(["/categories/women", "/categories/women/cat"]);
  });

  it("marks All active when no design is selected", () => {
    const flags = activeFlags(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "" }),
    );
    expect(flags.filter((f) => f.active === true).map((f) => f.href)).toEqual(["/categories"]);
  });
});
