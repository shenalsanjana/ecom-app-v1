import { describe, it, expect } from "vitest";
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import type { Crumb } from "@/app/_lib/taxonomy-trail";

const items: Crumb[] = [
  { label: "Home", href: "/" },
  { label: "Categories", href: "/categories" },
  { label: "Women", href: "/categories/women" },
  { label: "Oversized Graphic T-Shirts" },
  { label: "Cats" },
];

/** Collect every element in the tree, depth-first, in render order. */
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

describe("Breadcrumb", () => {
  it("is a labelled nav wrapping an ordered list", () => {
    const tree = Breadcrumb({ items }) as { type: unknown; props: Record<string, unknown> };
    expect(tree.type).toBe("nav");
    expect(tree.props["aria-label"]).toBe("Breadcrumb");
    expect(collectElements(tree).some((e) => e.type === "ol")).toBe(true);
  });

  it("marks only the last crumb as the current page", () => {
    const current = collectElements(Breadcrumb({ items }))
      .filter((e) => e.props["aria-current"] === "page");
    expect(current).toHaveLength(1);
    expect(collectElements(current[0]).map((e) => e.props.children)).toContain("Cats");
  });

  it("links every crumb that has an href and none that does not", () => {
    const hrefs = collectElements(Breadcrumb({ items }))
      .map((e) => e.props.href)
      .filter((h): h is string => typeof h === "string");
    expect(hrefs).toEqual(["/", "/categories", "/categories/women"]);
  });

  it("hides its separators from assistive technology", () => {
    const seps = collectElements(Breadcrumb({ items }))
      .filter((e) => e.props["aria-hidden"] === "true");
    // One between each pair of crumbs.
    expect(seps).toHaveLength(items.length - 1);
  });
});
