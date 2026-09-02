import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

const { getDepartments, getDesignMedia } = vi.hoisted(() => ({
  getDepartments: vi.fn(),
  getDesignMedia: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/app/_lib/taxonomy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_lib/taxonomy")>()),
  getDepartments,
}));
vi.mock("@/app/_lib/taxonomy-media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_lib/taxonomy-media")>()),
  getDesignMedia,
}));

// The other sections hit the database or render client components; this test is
// about composition, so they are stubbed to identity-only placeholders.
vi.mock("@/app/_components/home/hero", () => ({ Hero: () => null }));
vi.mock("@/app/_components/home/social-proof", () => ({ SocialProof: () => null }));
vi.mock("@/app/_components/home/product-grid", () => ({ ProductGrid: () => null }));
vi.mock("@/app/_components/home/deals-section", () => ({ DealsSection: () => null }));
vi.mock("@/app/_components/home/trust-strip", () => ({ TrustStrip: () => null }));
vi.mock("@/app/_components/home/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/app/_components/home/site-footer", () => ({ SiteFooter: () => null }));

import Home from "../page";
import { DepartmentCards } from "@/app/_components/home/department-cards";
import { DesignGrid } from "@/app/_components/home/design-grid";
import { ProductGrid } from "@/app/_components/home/product-grid";
import { DealsSection } from "@/app/_components/home/deals-section";
import { SlideClock } from "@/app/_components/ui/slide-clock";

const departments: DepartmentView[] = [
  {
    slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
    note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
    sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4", image: null }],
  },
];

/** Every element in the tree, depth-first, in render order. */
function collectElements(
  node: unknown,
  out: { type: unknown; props: Record<string, unknown> }[] = [],
): { type: unknown; props: Record<string, unknown> }[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.props) {
    out.push({ type: el.type, props: el.props });
    collectElements(el.props.children, out);
  }
  return out;
}

beforeEach(() => {
  getDepartments.mockReset().mockResolvedValue(departments);
  getDesignMedia.mockReset().mockResolvedValue(new Map());
});

describe("home page", () => {
  it("reads the taxonomy once and hands the same rows to both sections", async () => {
    const elements = collectElements(await Home());

    expect(getDepartments).toHaveBeenCalledTimes(1);

    const cards = elements.find((e) => e.type === DepartmentCards);
    const grid = elements.find((e) => e.type === DesignGrid);
    expect(cards?.props.departments).toBe(departments);
    expect(grid?.props.departments).toBe(departments);
  });

  it("places the taxonomy sections between Featured products and Deals", async () => {
    const types = collectElements(await Home()).map((e) => e.type);

    const featured = types.indexOf(ProductGrid);
    const cards = types.indexOf(DepartmentCards);
    const grid = types.indexOf(DesignGrid);
    const deals = types.indexOf(DealsSection);

    expect(featured).toBeGreaterThanOrEqual(0);
    expect(cards).toBeGreaterThan(featured);
    expect(grid).toBe(cards + 1);
    expect(deals).toBeGreaterThan(grid);
  });

  it("threads the design media into DesignGrid and nothing else", async () => {
    const media = new Map([["cat", { photos: ["/a.jpg"], count: 2 }]]);
    getDepartments.mockResolvedValue(departments);
    getDesignMedia.mockResolvedValue(media);

    const elements = collectElements(await Home());
    const grid = elements.find((e) => e.type === DesignGrid);
    const cards = elements.find((e) => e.type === DepartmentCards);

    expect(grid?.props.media).toBe(media);
    // Department slides come from getDepartments, so the card section must not
    // have been given the extra read.
    expect(cards?.props.media).toBeUndefined();
    expect(getDesignMedia).toHaveBeenCalledTimes(1);
  });

  it("drives both taxonomy sections off exactly one shared SlideClock", async () => {
    // taxonomy-tile-slides/spec.md: "the implementation MUST NOT start one
    // timer per tile" -- each section used to mount its own SlideClock,
    // which drifts out of phase over time. This is the regression test for
    // that: DepartmentCards and DesignGrid must both sit inside a single
    // SlideClock instance on the home page, not carry one each.
    const elements = collectElements(await Home());
    const clocks = elements.filter((e) => e.type === SlideClock);
    expect(clocks).toHaveLength(1);

    // And both sections must actually be inside it, not merely present
    // somewhere else on the page.
    const clockChildTypes = collectElements(clocks[0].props.children).map((e) => e.type);
    expect(clockChildTypes).toContain(DepartmentCards);
    expect(clockChildTypes).toContain(DesignGrid);
  });
});
