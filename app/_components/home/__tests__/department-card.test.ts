import { describe, it, expect } from "vitest";
import { DepartmentCard } from "@/app/_components/home/department-card";
import type { Slide } from "@/app/_components/ui/slide-show";

type Rendered = { props: Record<string, unknown> };

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

const slides: Slide[] = [
  { hex: "#EFC4C4", photo: "/cat.jpg", label: "Cats" },
  { hex: "#BFD8C2", photo: null, label: "Dino" },
];

describe("DepartmentCard", () => {
  it("links to the given href", () => {
    const el = DepartmentCard({ href: "/categories/women", name: "Women", note: "Unisex", slides }) as Rendered;
    expect(el.props.href).toBe("/categories/women");
  });

  it("renders the name and note as text", () => {
    const tree = DepartmentCard({ href: "/categories/women", name: "Women", note: "Unisex", slides });
    const text = collectText(tree);
    expect(text).toContain("Women");
    expect(text).toContain("Unisex");
  });

  it("hands SlideShow exactly the slides it was given, without rendering it", () => {
    // SlideShow is a client component with hooks -- DepartmentCard is called
    // directly here, but SlideShow itself stays behind its own unexecuted
    // JSX element, so this only inspects the prop it was handed.
    const tree = DepartmentCard({ href: "/x", name: "Women", note: "Unisex", slides });
    expect(collectProp(tree, "slides")).toEqual([slides]);
  });
});
