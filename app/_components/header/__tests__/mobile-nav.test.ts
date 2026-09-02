import { describe, it, expect } from "vitest";
import type { NavColumn } from "@/app/_lib/taxonomy-nav-model";
import { TaxonomySection } from "@/app/_components/header/mobile-nav";

const columns: NavColumn[] = [
  { label: "Women", note: null, href: "/categories/women",
    designs: [{ label: "Cats", href: "/categories/women/cat" }] },
  { label: "Men", note: null, href: "/categories/men",
    designs: [{ label: "Car", href: "/categories/men/car" }] },
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

describe("MobileNav taxonomy", () => {
  it("lists every department and design in the sheet", () => {
    const hrefs = collectHrefs(TaxonomySection({ columns, onNavigate: () => {} }));
    expect(hrefs).toContain("/categories/women");
    expect(hrefs).toContain("/categories/women/cat");
    expect(hrefs).toContain("/categories/men/car");
  });

  it("still renders the taxonomy with a single department", () => {
    // Deliberately unlike the desktop trigger: one collapsible row is a normal
    // list item, and this is the only place the taxonomy reaches phones.
    const hrefs = collectHrefs(TaxonomySection({ columns: [columns[0]], onNavigate: () => {} }));
    expect(hrefs).toContain("/categories/women/cat");
  });

  it("renders nothing when there are no columns", () => {
    expect(TaxonomySection({ columns: [], onNavigate: () => {} })).toBeNull();
  });

  it("closes the sheet when a link is followed", () => {
    let closed = 0;
    const tree = TaxonomySection({ columns, onNavigate: () => { closed += 1; } });
    const handlers = collectProp(tree, "onClick").filter((h): h is () => void => typeof h === "function");
    expect(handlers.length).toBeGreaterThan(0);
    handlers[0]();
    expect(closed).toBe(1);
  });
});
