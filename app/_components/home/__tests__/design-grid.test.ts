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

/** Collect the joined text content of each <h3> in the tree, one entry per heading. */
function collectH3Texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectH3Texts(child, out);
    return out;
  }
  const type = (node as { type?: unknown }).type;
  const props = (node as { props?: Record<string, unknown> }).props;
  if (type === "h3") {
    out.push(collectText(props?.children ?? null).join(""));
    return out;
  }
  if (props) collectH3Texts(props.children, out);
  return out;
}

/** Find the element in the tree whose React `key` (not a prop — React
 *  extracts it onto the element itself) equals the given value. Each group's
 *  outer <div key={d.slug}> makes this a reliable way to scope assertions
 *  to one group's own subtree. */
function findByKey(node: unknown, key: string): unknown {
  if (node === null || node === undefined || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByKey(child, key);
      if (found) return found;
    }
    return null;
  }
  if ((node as { key?: unknown }).key === key) return node;
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) return findByKey(props.children, key);
  return null;
}

describe("DesignGrid", () => {
  it("links designs by their nested path, never the flat one", () => {
    const hrefs = collectHrefs(
      DesignGrid({
        departments: [
          dept({
            slug: "women",
            designs: [
              { slug: "cat", name: "Cats", hex: "#EFC4C4", image: null },
              { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
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
              { slug: "tote", name: "Tote", hex: "#C9B79A", image: null },
              { slug: "cap", name: "Cap", hex: "#A59585", image: null },
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
        dept({ slug: "plain", subName: null, designs: [{ slug: "tote", name: "Tote", hex: "#C9B79A", image: null }] }),
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
        dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1", image: null }] }),
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
          dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1", image: null }] }),
        ],
      }),
    );

    expect(tags.filter((t) => t === "h3")).toHaveLength(2);
    expect(tags).not.toContain("h2"); // the section's h2 comes from SectionHeader
  });

  it("puts the department name inside the heading's own accessible name, not merely nearby", () => {
    // The visible Eyebrow above the h3 is not programmatically associated
    // with it, so a screen reader navigating by heading alone must still be
    // able to tell "Women" and "Men" apart from the h3 text alone — not just
    // from text elsewhere in the section.
    const h3Texts = collectH3Texts(
      DesignGrid({
        departments: [
          dept({ slug: "women", name: "Women" }),
          dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1", image: null }] }),
        ],
      }),
    );

    expect(h3Texts).toHaveLength(2);
    expect(h3Texts[0]).toContain("Women");
    expect(h3Texts[0]).toContain("Oversized Graphic T-Shirts");
    expect(h3Texts[1]).toContain("Men");
    expect(h3Texts[1]).toContain("Oversized Graphic T-Shirts");
  });

  it("paints a design tile with the design's own hex, not the department's", () => {
    // The department hex and the design hex are deliberately different here
    // (and #123456 appears in neither DEPARTMENT_TINTS nor DESIGN_TINTS), so
    // this only passes if the tile reads `design.hex` rather than `d.hex`.
    const tree = DesignGrid({
      departments: [
        dept({
          slug: "women",
          hex: "#EFC4C4",
          designs: [{ slug: "cat", name: "Cats", hex: "#123456", image: null }],
        }),
      ],
    });

    expect(collectProp(tree, "hex")).toEqual(["#123456"]);
  });

  it("keeps each group's eyebrow, heading, tile labels and hexes scoped to its own subtree", () => {
    const tree = DesignGrid({
      departments: [
        dept({
          slug: "women", name: "Women", hex: "#EFC4C4",
          designs: [{ slug: "cat", name: "Cats", hex: "#123456", image: null }],
        }),
        dept({
          slug: "men", name: "Men", hex: "#AEC3D1",
          designs: [{ slug: "car", name: "Car", hex: "#654321", image: null }],
        }),
      ],
    });

    const women = findByKey(tree, "women");
    const men = findByKey(tree, "men");

    expect(collectText(women)).toContain("Women");
    expect(collectText(women)).not.toContain("Men");
    expect(collectProp(women, "label")).toEqual(["Cats"]);
    expect(collectProp(women, "hex")).toEqual(["#123456"]);

    expect(collectText(men)).toContain("Men");
    expect(collectText(men)).not.toContain("Women");
    expect(collectProp(men, "label")).toEqual(["Car"]);
    expect(collectProp(men, "hex")).toEqual(["#654321"]);
  });

  it("hands a design's photo to its tile, and nothing when there is none", () => {
    const tree = DesignGrid({
      departments: [
        dept({
          slug: "women",
          designs: [
            { slug: "cat", name: "Cats", hex: "#EFC4C4", image: "/img/cat.jpg" },
            { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
          ],
        }),
      ],
    });
    expect(collectProp(tree, "image")).toEqual(["/img/cat.jpg", null]);
  });

  it("states its threshold", () => {
    expect(MIN_DESIGN_GROUPS).toBe(1);
  });
});
