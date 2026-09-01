import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

const { getDepartments } = vi.hoisted(() => ({ getDepartments: vi.fn() }));

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

import { SiteFooter } from "@/app/_components/home/site-footer";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [],
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

beforeEach(() => getDepartments.mockReset());

describe("SiteFooter category links", () => {
  it("links designs by their nested path", async () => {
    getDepartments.mockResolvedValue([
      dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }] }),
      dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
    ]);

    const hrefs = collectHrefs(await SiteFooter());

    expect(hrefs).toContain("/categories/women/cat");
    expect(hrefs).toContain("/categories/men/car");
    expect(hrefs).not.toContain("/categories/cat");
    expect(hrefs).not.toContain("/categories/car");
  });

  it("caps the column at six links and skips empty departments", async () => {
    getDepartments.mockResolvedValue([
      dept({
        slug: "women",
        designs: Array.from({ length: 8 }, (_, i) => ({
          slug: `d${i}`, name: `Design ${i}`, hex: "#EFC4C4",
        })),
      }),
      dept({ slug: "men", name: "Men", designs: [] }),
    ]);

    const hrefs = collectHrefs(await SiteFooter());
    const designLinks = hrefs.filter((h) => h.startsWith("/categories/women/"));

    expect(designLinks).toHaveLength(6);
    expect(hrefs).not.toContain("/categories/men");
  });
});
