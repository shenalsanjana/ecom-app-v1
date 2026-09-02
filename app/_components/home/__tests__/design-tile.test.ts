import { describe, it, expect } from "vitest";
import Link from "next/link";
import { DesignTile } from "@/app/_components/home/design-tile";
import { CAPTION_OVERLAY, CAPTION_SCRIM_MIN_ALPHA } from "@/app/_lib/taxonomy-tint";
import { SlideShow, type Slide } from "@/app/_components/ui/slide-show";

/** Find every element of the given `type` in the tree (by reference, not by
 *  name -- Link and SlideShow are both function/object identities). */
function collectByType(node: unknown, type: unknown, out: unknown[] = []): unknown[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, type, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === type) out.push(el);
  if (el.props) collectByType(el.props.children, type, out);
  return out;
}

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
    const tree = DesignTile({ href: "/categories/women/cat", name: "Cats", note: "3 products", slides });
    const links = collectByType(tree, Link) as Array<{ props: Record<string, unknown> }>;
    expect(links).toHaveLength(1);
    expect(links[0].props.href).toBe("/categories/women/cat");
  });

  it("names the link by the design name, and gives the link no other content", () => {
    // The link has no visible children of its own -- the tile's photo,
    // caption and dots all render as its siblings (Finding 4) -- so it needs
    // an explicit accessible name rather than one derived from content.
    const tree = DesignTile({ href: "/x", name: "Cats", note: "3 products", slides });
    const links = collectByType(tree, Link) as Array<{ props: Record<string, unknown> }>;
    expect(links[0].props["aria-label"]).toBe("Cats");
    expect(links[0].props.children).toBeUndefined();
  });

  it("renders the tile's photos and dots outside the link, never nested inside it", () => {
    // <button> inside <a> is invalid HTML (nested-interactive) and multiplies
    // the link's accessible name with every dot's own label. The Link has no
    // children at all now -- SlideShow (which owns the dots when it rotates)
    // renders as its sibling, not its descendant.
    const tree = DesignTile({ href: "/x", name: "Cats", note: "3 products", slides });
    const [link] = collectByType(tree, Link) as Array<{ props: Record<string, unknown> }>;
    expect(link.props.children).toBeUndefined();
    // And SlideShow is present somewhere in the tile at all -- otherwise the
    // assertion above would pass vacuously.
    expect(collectByType(tree, SlideShow)).toHaveLength(1);
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
