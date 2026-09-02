import { describe, it, expect } from "vitest";
import Image from "next/image";
import { SlideShow, SlideLayer, RotatingSlideShow, type Slide } from "@/app/_components/ui/slide-show";

/** Find every element of the given `type` in the tree (by reference, not by
 *  name -- Image and RotatingSlideShow are both function/object identities). */
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

const oneSlide: Slide[] = [{ hex: "#EFC4C4", photo: "/cat.jpg" }];
const threeSlides: Slide[] = [
  { hex: "#EFC4C4", photo: "/a.jpg" },
  { hex: "#BFD8C2", photo: "/b.jpg" },
  { hex: "#AEC3D1", photo: null, title: "Dino" },
];

describe("SlideShow", () => {
  it("never reaches RotatingSlideShow -- the hook-owning component -- for a single slide", () => {
    // taxonomy-tile-slides/spec.md: "SHALL NOT subscribe to the clock". This
    // suite has no DOM/renderer, so it asserts the structural guarantee that
    // makes that true: the conditional is a component boundary (SlideShow
    // never even constructs a RotatingSlideShow element), not an `if` around
    // useSlideTick() -- an `if` around the hook call would still be reached
    // by this test the same way a component-boundary is, so what actually
    // matters here is that no RotatingSlideShow element appears in the tree
    // at all when there's nothing to rotate through.
    const tree = SlideShow({ slides: oneSlide, dots: "top-right", fadeMs: 650, subject: "Cats", sizes: "50vw" });
    expect(collectByType(tree, RotatingSlideShow)).toHaveLength(0);
  });

  it("never reaches RotatingSlideShow for zero slides, and renders nothing", () => {
    const tree = SlideShow({ slides: [], dots: "top-right", fadeMs: 650, subject: "Cats", sizes: "50vw" });
    expect(collectByType(tree, RotatingSlideShow)).toHaveLength(0);
    expect(tree).toBeNull();
  });

  it("delegates to RotatingSlideShow for more than one slide", () => {
    const tree = SlideShow({ slides: threeSlides, dots: "top-right", fadeMs: 650, subject: "Cats", sizes: "50vw" });
    expect(collectByType(tree, RotatingSlideShow)).toHaveLength(1);
  });

  // SlideShow's static path returns an unexecuted <SlideLayer/> element (JSX
  // doesn't run a component's body until something actually renders it, and
  // this suite has no renderer) -- SlideLayer carries no hooks, unlike
  // RotatingSlideShow, so it's safe to call directly to inspect what it
  // paints.
  function renderStaticLayer(slide: Slide, sizes = "50vw") {
    const tree = SlideShow({ slides: [slide], dots: "top-right", fadeMs: 650, subject: "Cats", sizes });
    expect((tree as { type: unknown }).type).toBe(SlideLayer);
    const { type, props } = tree as { type: (p: unknown) => unknown; props: unknown };
    return type(props);
  }

  it("paints a photo with next/image, not a raw CSS background", () => {
    // TintTile used next/image deliberately, for next.config.ts's
    // remotePatterns allowlist, resizing/format negotiation and lazy
    // loading. A raw CSS background-image bypasses all three.
    const rendered = renderStaticLayer(oneSlide[0], "50vw");
    const images = collectByType(rendered, Image) as Array<{ props: Record<string, unknown> }>;
    expect(images).toHaveLength(1);
    expect(images[0].props.src).toBe("/cat.jpg");
    expect(images[0].props.sizes).toBe("50vw");
    expect(images[0].props.fill).toBe(true);
  });

  it("marks an /uploads/ photo unoptimized, matching product-card.tsx's precedent", () => {
    const rendered = renderStaticLayer({ hex: "#EFC4C4", photo: "/uploads/x.jpg" });
    const [image] = collectByType(rendered, Image) as Array<{ props: Record<string, unknown> }>;
    expect(image.props.unoptimized).toBe(true);
  });

  it("does not mark a normal remote photo unoptimized", () => {
    const rendered = renderStaticLayer(oneSlide[0]);
    const [image] = collectByType(rendered, Image) as Array<{ props: Record<string, unknown> }>;
    expect(image.props.unoptimized).toBe(false);
  });

  it("renders no photo element at all for a titled tint-only slide", () => {
    const rendered = renderStaticLayer({ hex: "#EFC4C4", photo: null, title: "Cats" });
    expect(collectByType(rendered, Image)).toHaveLength(0);
  });
});
