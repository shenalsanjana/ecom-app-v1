import { describe, it, expect, vi } from "vitest";
import {
  buildTaxonomyLookup,
  resolveCategorySegments,
  type DepartmentIndex,
  type SlugHistoryReaders,
} from "../taxonomy-lookup";

// Mirrors the seed: `cat` and `dino` live under `women`, `car` under `men`.
const departments: DepartmentIndex = [
  { slug: "men", designs: [{ slug: "car" }] },
  { slug: "women", designs: [{ slug: "cat" }, { slug: "dino" }] },
  { slug: "plain", designs: [] },
];

/** History readers that also record which slugs were actually queried, so the
 *  "live URLs cost zero history reads" guarantee is asserted, not assumed. */
function readers(
  depts: Record<string, string> = {},
  designs: Record<string, string> = {},
): SlugHistoryReaders & { deptCalls: string[]; designCalls: string[] } {
  const deptCalls: string[] = [];
  const designCalls: string[] = [];
  return {
    deptCalls,
    designCalls,
    departmentRedirect: async (s) => {
      deptCalls.push(s);
      return depts[s] ?? null;
    },
    designRedirect: async (s) => {
      designCalls.push(s);
      return designs[s] ?? null;
    },
  };
}

describe("buildTaxonomyLookup — live taxonomy", () => {
  it("reports current departments and designs synchronously", async () => {
    const lookup = await buildTaxonomyLookup(["women"], departments, readers());
    expect(lookup.departmentExists("women")).toBe(true);
    expect(lookup.departmentExists("nope")).toBe(false);
    expect(lookup.designOf("cat")).toEqual({ departmentSlug: "women" });
    expect(lookup.designOf("car")).toEqual({ departmentSlug: "men" });
    expect(lookup.designOf("nope")).toBeNull();
  });

  it("issues no history reads for a slug that is a live department", async () => {
    const history = readers();
    await buildTaxonomyLookup(["women"], departments, history);
    expect(history.deptCalls).toEqual([]);
    expect(history.designCalls).toEqual([]);
  });

  it("issues no history reads for a slug that is a live design", async () => {
    const history = readers();
    await buildTaxonomyLookup(["cat"], departments, history);
    expect(history.deptCalls).toEqual([]);
    expect(history.designCalls).toEqual([]);
  });

  it("reads history only for the design segment of a two-segment request", async () => {
    const history = readers();
    // `retired` misses everything live; `men` is live and must not be queried.
    await buildTaxonomyLookup(["men", "retired"], departments, history);
    expect(history.deptCalls).toEqual(["retired"]);
    expect(history.designCalls).toEqual(["retired"]);
  });

  it("returns null from both history methods when nothing was pre-resolved", async () => {
    const lookup = await buildTaxonomyLookup(["women"], departments, readers());
    // Nothing is in `misses`, so every history answer must be a clean null —
    // never `undefined` leaking out of an empty map.
    expect(lookup.departmentRedirect("anything")).toBeNull();
    expect(lookup.designRedirect("anything")).toBeNull();
  });

  it("answers history by slug, not by position", async () => {
    const history = readers({ ladies: "/categories/women" }, { kitty: "/categories/women/cat" });
    const lookup = await buildTaxonomyLookup(["kitty"], departments, history);
    expect(lookup.designRedirect("kitty")).toBe("/categories/women/cat");
    // A slug outside the pre-resolved set must be null, not another slug's answer.
    expect(lookup.designRedirect("ladies")).toBeNull();
    expect(lookup.departmentRedirect("kitty")).toBeNull();
  });
});

describe("resolveCategorySegments — end to end", () => {
  it("resolves a live department", async () => {
    expect(await resolveCategorySegments(["women"], departments, readers())).toEqual({
      kind: "department",
      slug: "women",
    });
  });

  it("resolves a live nested design", async () => {
    expect(await resolveCategorySegments(["women", "cat"], departments, readers())).toEqual({
      kind: "design",
      departmentSlug: "women",
      designSlug: "cat",
    });
  });

  it("redirects a bare live design slug to its nested path", async () => {
    // The legacy /categories/cat contract.
    expect(await resolveCategorySegments(["cat"], departments, readers())).toEqual({
      kind: "redirect",
      to: "/categories/women/cat",
    });
  });

  it("redirects a mismatched department segment to the canonical path", async () => {
    expect(await resolveCategorySegments(["men", "cat"], departments, readers())).toEqual({
      kind: "redirect",
      to: "/categories/women/cat",
    });
  });

  it("falls through to design history when nothing live matches", async () => {
    const history = readers({}, { kitty: "/categories/women/cat" });
    expect(await resolveCategorySegments(["kitty"], departments, history)).toEqual({
      kind: "redirect",
      to: "/categories/women/cat",
    });
    expect(history.designCalls).toEqual(["kitty"]);
  });

  it("falls through to department history when nothing live matches", async () => {
    const history = readers({ ladies: "/categories/women" }, {});
    expect(await resolveCategorySegments(["ladies"], departments, history)).toEqual({
      kind: "redirect",
      to: "/categories/women",
    });
  });

  it("uses design history for the second segment of a two-segment request", async () => {
    const history = readers({}, { kitty: "/categories/women/cat" });
    expect(await resolveCategorySegments(["men", "kitty"], departments, history)).toEqual({
      kind: "redirect",
      to: "/categories/women/cat",
    });
  });

  it("404s a slug that misses both live tables and both history tables", async () => {
    expect(await resolveCategorySegments(["nope"], departments, readers())).toEqual({
      kind: "notFound",
    });
  });

  it("404s three or more segments without touching history", async () => {
    const history = readers({}, { kitty: "/categories/women/cat" });
    expect(await resolveCategorySegments(["women", "cat", "extra"], departments, history)).toEqual({
      kind: "notFound",
    });
    expect(history.deptCalls).toEqual([]);
    expect(history.designCalls).toEqual([]);
  });

  it("404s zero segments without touching history", async () => {
    const history = readers();
    expect(await resolveCategorySegments([], departments, history)).toEqual({ kind: "notFound" });
    expect(history.deptCalls).toEqual([]);
    expect(history.designCalls).toEqual([]);
  });

  it("runs the two history reads concurrently", async () => {
    const order: string[] = [];
    const history: SlugHistoryReaders = {
      departmentRedirect: async (s) => {
        order.push(`dept:${s}`);
        return null;
      },
      designRedirect: async (s) => {
        order.push(`design:${s}`);
        return null;
      },
    };
    const spy = vi.spyOn(Promise, "all");
    await resolveCategorySegments(["retired"], departments, history);
    expect(order).toEqual(["dept:retired", "design:retired"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
