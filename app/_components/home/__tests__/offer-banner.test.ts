import { describe, it, expect } from "vitest";
import { OfferBanner } from "@/app/_components/home/offer-banner";
import { DealsCountdown } from "@/app/_components/home/deals-countdown";

/** Every element in the tree, depth-first. A walk does not enter child
 *  components, so DealsCountdown appears as an element, not as its markup. */
function collect(
  node: unknown,
  out: { type: unknown; props: Record<string, unknown> }[] = [],
) {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.props) {
    out.push({ type: el.type, props: el.props });
    collect(el.props.children, out);
  }
  return out;
}

function text(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) text(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) text(props.children, out);
  return out;
}

/** Text fragments joined as they render, not space-separated: "Up to ", 40,
 *  "% off" is one sentence, and joining with a space would break every
 *  assertion about it. */
const flat = (node: unknown) => text(node).join("").replace(/\s+/g, " ").trim();

const render = (over: Partial<Parameters<typeof OfferBanner>[0]> = {}) =>
  OfferBanner({
    heading: "The whole rack",
    blurb: "Oversize graphic tees and heavyweight basics.",
    offer: { pct: 40, count: 12 },
    ...over,
  });

describe("OfferBanner", () => {
  it("prints the live discount, how many pieces carry it, and where to go", () => {
    const joined = flat(render());
    expect(joined).toContain("Up to 40% off");
    expect(joined).toContain("12 pieces reduced right now.");
    expect(joined).toContain("Shop the sale");

    const hrefs = collect(render()).map((e) => e.props.href).filter(Boolean);
    expect(hrefs).toContain("/deals");
  });

  it("gives the sale its own call to action: terracotta, full width, focusable", () => {
    // The panel sits on cocoa, so the CTA is the one terracotta element on the
    // page's first screen — buttonVariants' "brand" is what globals.css
    // reserves that colour for.
    const cta = collect(render()).find((e) => e.props.href === "/deals");
    const cls = String(cta?.props.className ?? "");
    expect(cls).toContain("bg-brand");
    expect(cls).toContain("text-brand-foreground");
    expect(cls).toContain("w-full");
    expect(cls).toContain("focus-visible:");
  });

  it("drops the whole panel when nothing is reduced", () => {
    // An empty sale panel is worse than no panel, and a placeholder figure
    // would be a fabricated claim shown to real customers.
    const joined = flat(render({ offer: { pct: 0, count: 0 } }));
    expect(joined).not.toContain("% off");
    expect(joined).not.toContain("Shop the sale");

    const els = collect(render({ offer: { pct: 0, count: 0 } }));
    expect(els.some((e) => e.type === DealsCountdown)).toBe(false);
    expect(els.map((e) => e.props.href).filter(Boolean)).not.toContain("/deals");
  });

  it("runs one countdown, in the panel, and only while a sale is on", () => {
    expect(collect(render()).filter((e) => e.type === DealsCountdown)).toHaveLength(1);
  });

  it("says piece, not pieces, for a single reduced product", () => {
    expect(flat(render({ offer: { pct: 15, count: 1 } })))
      .toContain("1 piece reduced right now.");
  });

  it("carries the page's only h1, and drops the blurb when handed none", () => {
    const h1s = collect(render()).filter((e) => e.type === "h1");
    expect(h1s).toHaveLength(1);
    expect(text(h1s[0].props.children).join("")).toBe("The whole rack");

    // Under a filter the heading names a design, and a paragraph about the
    // whole catalogue would describe something the grid no longer shows.
    const filtered = flat(render({ heading: "Cats", blurb: null }));
    expect(filtered).toContain("Cats");
    expect(filtered).not.toContain("Oversize graphic tees");
  });

  it("puts the offer between the heading and the signals in source order", () => {
    // This is the phone order: a single column would otherwise drop the sale
    // panel below four trust signals, furthest from the headline, on the
    // viewport that matters most. At lg the grid placement classes lift it
    // back into a right-hand column.
    const els = collect(render());
    const h1 = els.findIndex((e) => e.type === "h1");
    const panel = els.findIndex((e) => e.type === DealsCountdown);
    const signals = els.findIndex((e) => e.type === "ul");

    expect(h1).toBeGreaterThanOrEqual(0);
    expect(panel).toBeGreaterThan(h1);
    expect(signals).toBeGreaterThan(panel);
  });

  it("declares no second column when there is no panel to fill it", () => {
    const grid = collect(render({ offer: { pct: 0, count: 0 } }))
      .find((e) => String(e.props.className ?? "").includes("max-w-7xl"));
    expect(String(grid?.props.className)).not.toContain("lg:grid-cols-");
  });

  it("keeps the trust signals whether or not a sale is running", () => {
    for (const offer of [{ pct: 40, count: 12 }, { pct: 0, count: 0 }]) {
      const joined = flat(render({ offer }));
      expect(joined).toContain("Cash on Delivery island-wide");
      expect(joined).toContain("Pay in 3 with Koko or MintPay");
    }
  });
});
