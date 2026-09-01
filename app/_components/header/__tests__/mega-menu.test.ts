import { describe, it, expect } from "vitest";
import type { NavColumn } from "@/app/_lib/taxonomy-nav-model";
import { MegaMenu } from "@/app/_components/header/mega-menu";

const columns: NavColumn[] = [
  {
    label: "Women", href: "/categories/women",
    designs: [
      { label: "Cats", href: "/categories/women/cat" },
      { label: "Dino", href: "/categories/women/dino" },
    ],
  },
  {
    label: "Men", href: "/categories/men",
    designs: [{ label: "Car", href: "/categories/men/car" }],
  },
];

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

/** Collect every rendered text child. */
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

describe("MegaMenu", () => {
  it("emits every department and every design as a link, plus a panel-level browse-all link", () => {
    // NAV_LINKS drops /categories once the panel replaces the plain "Shop"
    // link, so the panel itself must still offer a route to the browse-all
    // page — otherwise it disappears from desktop nav entirely once a
    // second department qualifies.
    const hrefs = collectHrefs(MegaMenu({ columns }));
    expect(hrefs).toEqual([
      "/categories/women", "/categories/women/cat", "/categories/women/dino",
      "/categories/men", "/categories/men/car",
      "/categories",
    ]);
  });

  it("falls back to a plain Shop link when only one department qualifies", () => {
    // Production today. A one-column panel reads as broken; a link does not.
    const tree = MegaMenu({ columns: [columns[0]] });
    expect(collectHrefs(tree)).toEqual(["/categories"]);
    expect(collectText(tree)).toContain("Shop");
  });

  it("falls back when no department qualifies at all", () => {
    expect(collectHrefs(MegaMenu({ columns: [] }))).toEqual(["/categories"]);
  });
});
