import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { DesignGrid, MIN_DESIGN_GROUPS } from "@/app/_components/home/design-grid";

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

/** Walk the returned element tree and collect every rendered text child. */
function collectText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === "string") { out.push(node); return out; }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectText(props.children, out);
  return out;
}

/** Collect the tag name of every intrinsic element in the tree, in order. */
function collectTags(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectTags(child, out);
    return out;
  }
  const type = (node as { type?: unknown }).type;
  if (typeof type === "string") out.push(type);
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectTags(props.children, out);
  return out;
}

describe("DesignGrid", () => {
  it("links designs by their nested path, never the flat one", () => {
    const hrefs = collectHrefs(
      DesignGrid({
        departments: [
          dept({
            slug: "women",
            designs: [
              { slug: "cat", name: "Cats", hex: "#EFC4C4" },
              { slug: "dino", name: "Dino", hex: "#BFD8C2" },
            ],
          }),
        ],
      }),
    );

    expect(hrefs).toEqual(["/categories/women/cat", "/categories/women/dino"]);
    expect(hrefs).not.toContain("/categories/cat");
  });

  it("excludes a department with no sub-category, however many designs it has", () => {
    // showsInDesignSection requires subName — Plain T-Shirts and Accessories
    // are excluded by design, not by oversight.
    const hrefs = collectHrefs(
      DesignGrid({
        departments: [
          dept({ slug: "women" }),
          dept({
            slug: "accessories", name: "Accessories", subName: null,
            designs: [
              { slug: "tote", name: "Tote", hex: "#C9B79A" },
              { slug: "cap", name: "Cap", hex: "#A59585" },
            ],
          }),
        ],
      }),
    );

    expect(hrefs).toEqual(["/categories/women/cat"]);
  });

  it("renders nothing when no department qualifies", () => {
    const tree = DesignGrid({
      departments: [
        dept({ slug: "plain", subName: null, designs: [{ slug: "tote", name: "Tote", hex: "#C9B79A" }] }),
        dept({ slug: "men", name: "Men", designs: [] }),
      ],
    });

    expect(tree).toBeNull();
  });

  it("names each group by department as well as sub-category", () => {
    // Men and Women both seed subName "Oversized Graphic T-Shirts", so the
    // department name is the only thing telling the two groups apart.
    const tree = DesignGrid({
      departments: [
        dept({ slug: "women", name: "Women" }),
        dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
      ],
    });
    const text = collectText(tree);

    expect(text).toContain("Women");
    expect(text).toContain("Men");
    expect(text.filter((t) => t === "Oversized Graphic T-Shirts")).toHaveLength(2);
  });

  it("keeps the heading hierarchy well-formed: one h2 for the section, h3 per group", () => {
    const tags = collectTags(
      DesignGrid({
        departments: [
          dept({ slug: "women" }),
          dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
        ],
      }),
    );

    expect(tags.filter((t) => t === "h3")).toHaveLength(2);
    expect(tags).not.toContain("h2"); // the section's h2 comes from SectionHeader
  });

  it("states its threshold", () => {
    expect(MIN_DESIGN_GROUPS).toBe(1);
  });
});
