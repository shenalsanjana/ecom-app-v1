import { describe, it, expect, vi } from "vitest";
import type { NavColumn } from "@/app/_lib/taxonomy-nav-model";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({ usePathname }));

import { DepartmentNav } from "@/app/_components/header/department-nav";

const columns: NavColumn[] = [
  { label: "Women", note: null, href: "/categories/women",
    designs: [{ label: "Cats", href: "/categories/women/cat" }] },
  { label: "Plain Tees", note: "Unisex", href: "/categories/plain", designs: [] },
];

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
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectText(props.children, out);
  return out;
}

/** Every element carrying data-active, with its href and value. */
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

describe("DepartmentNav", () => {
  it("links every department at the top level, its designs below it, and the plain links after", () => {
    usePathname.mockReturnValue("/");
    const hrefs = collectHrefs(
      DepartmentNav({ columns, links: [{ href: "/deals", label: "Deals" }] }),
    );
    expect(hrefs).toEqual([
      // Women, then its panel: the department again as "All Women", then the design.
      "/categories/women", "/categories/women", "/categories/women/cat",
      // Plain Tees has no designs, so it gets no panel at all.
      "/categories/plain",
      "/deals",
    ]);
  });

  it("prints the department's qualifier beside its label", () => {
    usePathname.mockReturnValue("/");
    const text = collectText(DepartmentNav({ columns }));
    expect(text).toContain("Plain Tees");
    expect(text).toContain("Unisex");
  });

  it("marks the department you are in, including on its nested design pages", () => {
    usePathname.mockReturnValue("/categories/women/cat");
    const flags = activeFlags(DepartmentNav({ columns, links: [{ href: "/deals", label: "Deals" }] }));
    expect(flags.filter((f) => f.active === true).map((f) => f.href)).toEqual([
      "/categories/women",
    ]);
  });

  it("marks nothing when you are somewhere else entirely", () => {
    usePathname.mockReturnValue("/cart");
    const flags = activeFlags(DepartmentNav({ columns, links: [{ href: "/deals", label: "Deals" }] }));
    expect(flags.every((f) => f.active === false)).toBe(true);
  });
});
