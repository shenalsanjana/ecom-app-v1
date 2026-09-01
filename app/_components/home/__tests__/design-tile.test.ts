import { describe, it, expect } from "vitest";
import { DesignTile } from "@/app/_components/home/design-tile";
import { CAPTION_OVERLAY, CAPTION_SCRIM_MIN_ALPHA } from "@/app/_lib/taxonomy-tint";
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
  { hex: "#EFC4C4", photo: "/cat.jpg" },
  { hex: "#BFD8C2", photo: null, title: "Dino" },
];

describe("DesignTile", () => {
  it("links to the given href", () => {
    const el = DesignTile({ href: "/categories/women/cat", name: "Cats", note: "3 products", slides }) as Rendered;
    expect(el.props.href).toBe("/categories/women/cat");
  });

  it("renders the name and note as text", () => {
    const tree = DesignTile({ href: "/x", name: "Cats", note: "3 products", slides });
    const text = collectText(tree);
    expect(text).toContain("Cats");
    expect(text).toContain("3 products");
  });

  it("hands SlideShow exactly the slides it was given, without rendering it", () => {
    // SlideShow is a client component with hooks -- DesignTile is called
    // directly here, but SlideShow itself stays behind its own unexecuted
    // JSX element, so this only inspects the prop it was handed.
    const tree = DesignTile({ href: "/x", name: "Cats", note: "3 products", slides });
    expect(collectProp(tree, "slides")).toEqual([slides]);
  });

  it("paints the caption with a three-stop gradient whose floor is CAPTION_SCRIM_MIN_ALPHA, not a hardcoded number", () => {
    const tree = DesignTile({ href: "/x", name: "Cats", note: "3 products", slides });
    const gradients = collectProp(tree, "style") as Array<{ backgroundImage?: string }>;
    const captionStyle = gradients.find((s) => typeof s?.backgroundImage === "string");

    expect(captionStyle?.backgroundImage).toContain(CAPTION_OVERLAY);
    // The floor stop's alpha is derived from the constant, not spelled out --
    // this only passes if the gradient's middle stop reads the constant.
    const floorPercent = Math.round(CAPTION_SCRIM_MIN_ALPHA * 100);
    expect(captionStyle?.backgroundImage).toContain(
      `color-mix(in srgb, ${CAPTION_OVERLAY} ${floorPercent}%, transparent)`,
    );
    // Three stops: near-opaque at the bottom, the held floor mid-way up, and
    // fully transparent at the top -- not a plain two-stop fade.
    expect(captionStyle?.backgroundImage).toContain("85%, transparent) 0%");
    expect(captionStyle?.backgroundImage).toContain(`${floorPercent}%, transparent) 62%`);
    expect(captionStyle?.backgroundImage).toContain("transparent 100%");
  });
});
