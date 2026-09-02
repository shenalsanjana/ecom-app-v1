import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";
import type { DesignMedia } from "@/app/_lib/taxonomy-media";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
// The page module also holds the design and product views, whose imports
// reach next-auth through the header. None of that is under test here.
vi.mock("@/app/_components/home/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/app/_components/home/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/app/_components/home/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/app/_components/shared/sort-select", () => ({ SortSelect: () => null }));
vi.mock("@/app/_components/analytics/track-category-view", () => ({
  TrackCategoryView: () => null,
}));

import { DepartmentBody } from "../page";
import { DesignTile } from "@/app/_components/home/design-tile";

const department: DepartmentView = {
  slug: "men", name: "Men", navLabel: "Men", tileName: "Men",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#AEC3D1", sortOrder: 0,
  designs: [
    { slug: "car", name: "Car", hex: "#AEC3D1", image: null },
    { slug: "simpsons", name: "Simpsons", hex: "#EFD9A8", image: "/design/simpsons.jpg" },
  ],
};

/** Every DesignTile in the tree, with the props it was handed. */
function tiles(node: unknown, out: Record<string, unknown>[] = []) {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) tiles(child, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === DesignTile && el.props) out.push(el.props);
  if (el.props) tiles(el.props.children, out);
  return out;
}

function collectText(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectText(props.children, out);
  return out;
}

describe("DepartmentBody", () => {
  it("renders each design as a card carrying its photos and product count", () => {
    const media = new Map<string, DesignMedia>([
      ["car", { photos: ["/a.jpg", "/b.jpg"], count: 1 }],
      ["simpsons", { photos: ["/c.jpg"], count: 4 }],
    ]);
    const found = tiles(DepartmentBody({ department, media }));

    expect(found.map((t) => t.href)).toEqual([
      "/categories/men/car",
      "/categories/men/simpsons",
    ]);
    // The count is singularised, the way the home page's tiles do it.
    expect(found.map((t) => t.note)).toEqual(["1 product", "4 products"]);
    expect(found[0].slides).toEqual([
      { hex: "#AEC3D1", photo: "/a.jpg" },
      { hex: "#AEC3D1", photo: "/b.jpg" },
    ]);
  });

  it("falls back to the design's own image, then to a captioned tint", () => {
    // A design with no product photography still has to read as something.
    const found = tiles(DepartmentBody({ department, media: new Map() }));

    expect(found[0].slides).toEqual([{ hex: "#AEC3D1", photo: null, title: "Car" }]);
    expect(found[1].slides).toEqual([{ hex: "#EFD9A8", photo: "/design/simpsons.jpg" }]);
    // Zero products prints nothing rather than "0 products" — a live tile
    // showing a zero reads as broken.
    expect(found.map((t) => t.note)).toEqual(["", ""]);
  });

  it("heads the grid with the sub-category and how many designs are in it", () => {
    const text = collectText(DepartmentBody({ department, media: new Map() }));
    expect(text).toContain("Oversized Graphic T-Shirts");
    expect(text).toContain("2 designs");
  });

  it("says so plainly when a department holds no designs yet", () => {
    const empty = { ...department, designs: [] };
    const tree = DepartmentBody({ department: empty, media: new Map() });
    expect(tiles(tree)).toHaveLength(0);
    expect(collectText(tree).join(" ")).toContain("Nothing here yet");
  });
});
