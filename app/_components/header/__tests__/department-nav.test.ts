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

  it("opens the row with the leading links, ahead of every department", () => {
    usePathname.mockReturnValue("/cart");
    const hrefs = collectHrefs(
      DepartmentNav({
        columns,
        leadingLinks: [{ href: "/", label: "Shop the collection" }],
        links: [{ href: "/deals", label: "Deals" }],
      }),
    );
    // Widest first, then each department, then the plain links.
    expect(hrefs[0]).toBe("/");
    expect(hrefs.at(-1)).toBe("/deals");
    expect(collectText(DepartmentNav({ columns, leadingLinks: [{ href: "/", label: "Shop the collection" }] })))
      .toContain("Shop the collection");
  });

  it("marks the root link active only on the root, not on every page under it", () => {
    // "/" is a prefix of every path, so the startsWith rule the departments
    // use would light "Shop all" up on the whole site.
    const leadingLinks = [{ href: "/", label: "Shop the collection" }];

    usePathname.mockReturnValue("/");
    expect(activeFlags(DepartmentNav({ columns, leadingLinks }))
      .filter((f) => f.active === true).map((f) => f.href)).toEqual(["/"]);

    usePathname.mockReturnValue("/categories/women/cat");
    expect(activeFlags(DepartmentNav({ columns, leadingLinks }))
      .filter((f) => f.active === true).map((f) => f.href)).toEqual(["/categories/women"]);
  });

  it("underlines only one of two leading links that share a destination", () => {
    // "Home" and "Shop the collection" both go to "/" — the catalogue is the
    // home page. Underlining both would read as a rendering fault, so the mark
    // falls on the label that describes the page.
    usePathname.mockReturnValue("/");
    const leadingLinks = [
      { href: "/", label: "Home" },
      { href: "/", label: "Shop the collection" },
    ];
    const flags = activeFlags(DepartmentNav({ columns, leadingLinks }));
    expect(flags.filter((f) => f.active === true)).toHaveLength(1);

    // Both are still rendered, and still both link home.
    const text = collectText(DepartmentNav({ columns, leadingLinks }));
    expect(text).toContain("Home");
    expect(text).toContain("Shop the collection");
    expect(collectHrefs(DepartmentNav({ columns, leadingLinks })).filter((h) => h === "/"))
      .toHaveLength(2);
  });

  it("marks nothing when you are somewhere else entirely", () => {
    usePathname.mockReturnValue("/cart");
    const flags = activeFlags(DepartmentNav({ columns, links: [{ href: "/deals", label: "Deals" }] }));
    expect(flags.every((f) => f.active === false)).toBe(true);
  });
});
