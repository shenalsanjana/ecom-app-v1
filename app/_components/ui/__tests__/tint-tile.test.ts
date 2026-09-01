import { describe, it, expect } from "vitest";
import { INK_DARK, INK_LIGHT } from "@/app/_lib/taxonomy-tint";
import { TintTile } from "@/app/_components/ui/tint-tile";

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

describe("TintTile", () => {
  it("renders the href, label and background it is given", () => {
    const el = TintTile({ href: "/categories/women", label: "Women", hex: "#EFC4C4" }) as Rendered;

    expect(el.props.href).toBe("/categories/women");
    expect((el.props.style as { backgroundColor: string }).backgroundColor).toBe("#EFC4C4");
    expect(collectText(el)).toContain("Women");
  });

  it("omits the sub-label when none is given", () => {
    const withSub = TintTile({ href: "/x", label: "Plain T-Shirts", subLabel: "Unisex", hex: "#D3CCC0" });
    const without = TintTile({ href: "/x", label: "Plain T-Shirts", subLabel: null, hex: "#D3CCC0" });

    expect(collectText(withSub)).toContain("Unisex");
    expect(collectText(without)).toEqual(["Plain T-Shirts"]);
  });

  it("picks ink by measured contrast, not by a luminance threshold", () => {
    // #E4DCC6 (snoopy) is light — dark ink wins.
    const light = TintTile({ href: "/x", label: "Snoopy", hex: "#E4DCC6" }) as Rendered;
    expect((light.props.style as { color: string }).color).toBe(INK_DARK);

    // A dark tint must flip to light ink. A 0.5-luminance rule would get this
    // right but get #78645A (0.471-class) wrong; inkFor measures instead.
    const dark = TintTile({ href: "/x", label: "Night", hex: "#2B2118" }) as Rendered;
    expect((dark.props.style as { color: string }).color).toBe(INK_LIGHT);
  });
});
