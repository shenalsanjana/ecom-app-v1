import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import {
  DesignGrid, MIN_DESIGN_GROUPS, designSlides, productNote, designCountNote,
} from "@/app/_components/home/design-grid";

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

describe("designSlides", () => {
  const design = { slug: "cat", name: "Cats", hex: "#EFC4C4", image: "/own.jpg" };

  it("uses the design's product photos when it has them", () => {
    const slides = designSlides(design, { photos: ["/a.jpg", "/b.jpg"], count: 5 });
    expect(slides).toEqual([
      { hex: "#EFC4C4", photo: "/a.jpg" },
      { hex: "#EFC4C4", photo: "/b.jpg" },
    ]);
  });

  it("falls back to the design's own image when no product has one", () => {
    expect(designSlides(design, { photos: [], count: 2 }))
      .toEqual([{ hex: "#EFC4C4", photo: "/own.jpg" }]);
  });

  it("falls back to a tint-only slide carrying the name when there is no photo at all", () => {
    const bare = { slug: "cat", name: "Cats", hex: "#EFC4C4", image: null };
    expect(designSlides(bare, undefined))
      .toEqual([{ hex: "#EFC4C4", photo: null, title: "Cats" }]);
  });
});

describe("productNote", () => {
  it("singularises one product", () => {
    expect(productNote(1)).toBe("1 product");
    expect(productNote(4)).toBe("4 products");
  });

  it("suppresses the note entirely at zero, rather than printing '0 products'", () => {
    // Reachable when a design's products are all archived: media.count can be
    // zero on an otherwise-live tile, and a zero count read aloud on a live
    // tile looks broken rather than honest.
    expect(productNote(0)).toBe("");
  });
});

describe("designCountNote", () => {
  it("singularises one design", () => {
    // Same shape as productNote, inches above it on the page -- a group
    // holding exactly one design must not read "1 designs" next to a tile
    // that correctly reads "1 product".
    expect(designCountNote(1)).toBe("1 design");
    expect(designCountNote(2)).toBe("2 designs");
    expect(designCountNote(0)).toBe("0 designs");
  });
});

describe("DesignGrid headings", () => {
  it("moves the sub-category to the section eyebrow and names each group by department", () => {
    // subName is shared by Men and Women, so it identifies the section; the
    // department name identifies the group.
    const tree = DesignGrid({
      departments: [
        dept({ slug: "women", name: "Women" }),
        dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1", image: null }] }),
      ],
      media: new Map(),
    });

    const h3s = collectH3Texts(tree);
    expect(h3s).toEqual(["Women", "Men"]);
    // The eyebrow is a PROP on SectionHeader, not children, so collectText
    // cannot see it -- SectionHeader is an unrendered element in this tree.
    // Exactly once, in the section header, not repeated per group.
    expect(collectProp(tree, "eyebrow")).toEqual(["Oversized Graphic T-Shirts"]);
  });

  it("omits the eyebrow when the groups' sub-names disagree, rather than mislabelling one with another's", () => {
    const tree = DesignGrid({
      departments: [
        dept({ slug: "women", name: "Women", subName: "Oversized Graphic T-Shirts" }),
        dept({
          slug: "men", name: "Men", subName: "Plain T-Shirts",
          designs: [{ slug: "car", name: "Car", hex: "#AEC3D1", image: null }],
        }),
      ],
      media: new Map(),
    });

    expect(collectProp(tree, "eyebrow")).toEqual([undefined]);
  });

  it("labels each group with its design count", () => {
    const tree = DesignGrid({
      departments: [dept({
        slug: "women",
        designs: [
          { slug: "cat", name: "Cats", hex: "#EFC4C4", image: null },
          { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
        ],
      })],
      media: new Map(),
    });
    expect(collectText(tree)).toContain("2 designs");
  });

  it("singularises a group's design count when it holds exactly one design", () => {
    // showsInDesignSection only requires subName !== null && designs.length > 0
    // -- a one-design department is reachable, and its header must not read
    // "1 designs" the way department-cards.tsx's departmentNote was fixed for
    // in the previous task.
    const tree = DesignGrid({
      departments: [dept({
        slug: "women",
        designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }],
      })],
      media: new Map(),
    });
    expect(collectText(tree)).toContain("1 design");
    expect(collectText(tree)).not.toContain("1 designs");
  });

  it("captions a tile with its real product count", () => {
    const tree = DesignGrid({
      departments: [dept({ slug: "women" })],
      media: new Map([["cat", { photos: [], count: 3 }]]),
    });
    // `note` is a prop handed to DesignTile, not text DesignGrid renders
    // itself, so it is reachable via collectProp rather than collectText.
    expect(collectProp(tree, "note")).toContain("3 products");
  });
});

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
        media: new Map(),
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
        media: new Map(),
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
      media: new Map(),
    });

    expect(tree).toBeNull();
  });

  it("keeps the heading hierarchy well-formed: one h2 for the section, h3 per group", () => {
    const tags = collectTags(
      DesignGrid({
        departments: [
          dept({ slug: "women" }),
          dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1", image: null }] }),
        ],
        media: new Map(),
      }),
    );

    expect(tags.filter((t) => t === "h3")).toHaveLength(2);
    expect(tags).not.toContain("h2"); // the section's h2 comes from SectionHeader
  });

  it("gives a design tile slides painted with the design's own hex, not the department's", () => {
    // The department hex and the design hex are deliberately different here
    // (and #123456 appears in neither DEPARTMENT_TINTS nor DESIGN_TINTS), so
    // this only passes if the slides are built from `design.hex` rather than
    // `d.hex`.
    const tree = DesignGrid({
      departments: [
        dept({
          slug: "women",
          hex: "#EFC4C4",
          designs: [{ slug: "cat", name: "Cats", hex: "#123456", image: null }],
        }),
      ],
      media: new Map(),
    });

    expect(collectProp(tree, "slides")).toEqual([
      [{ hex: "#123456", photo: null, title: "Cats" }],
    ]);
  });

  it("keeps each group's heading, tile names and slides scoped to its own subtree", () => {
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
      media: new Map(),
    });

    const women = findByKey(tree, "women");
    const men = findByKey(tree, "men");

    expect(collectH3Texts(women)).toEqual(["Women"]);
    expect(collectProp(women, "name")).toEqual(["Cats"]);
    expect(collectProp(women, "slides")).toEqual([[{ hex: "#123456", photo: null, title: "Cats" }]]);

    expect(collectH3Texts(men)).toEqual(["Men"]);
    expect(collectProp(men, "name")).toEqual(["Car"]);
    expect(collectProp(men, "slides")).toEqual([[{ hex: "#654321", photo: null, title: "Car" }]]);
  });

  it("hands a design's photo to its tile's slides, and nothing when there is none", () => {
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
      media: new Map(),
    });
    expect(collectProp(tree, "slides")).toEqual([
      [{ hex: "#EFC4C4", photo: "/img/cat.jpg" }],
      [{ hex: "#BFD8C2", photo: null, title: "Dino" }],
    ]);
  });

  it("states its threshold", () => {
    expect(MIN_DESIGN_GROUPS).toBe(1);
  });
});
