import { describe, it, expect } from "vitest";
import { resolveCategoryRoute } from "../taxonomy-route";
import type { TaxonomyLookup } from "../taxonomy-route";

const lookup: TaxonomyLookup = {
  departmentExists: (s) => ["women", "men", "dino-dept"].includes(s),
  designOf: (s) => (s === "cat" ? { departmentSlug: "women" } : s === "dino" ? { departmentSlug: "dino-dept" } : null),
  departmentRedirect: (s) => (s === "ladies" ? "/categories/women" : null),
  designRedirect: (s) => (s === "kitty" ? "/categories/women/cat" : null),
};

const shadowed: TaxonomyLookup = {
  ...lookup,
  designRedirect: (s) => (s === "cat" ? "/categories/men/stale" : s === "kitty" ? "/categories/women/cat" : null),
  departmentRedirect: (s) => (s === "cat" ? "/categories/stale" : s === "ladies" ? "/categories/women" : null),
};

const dualRole: TaxonomyLookup = {
  departmentExists: (s) => ["women", "unisex"].includes(s),
  designOf: (s) => (s === "unisex" ? { departmentSlug: "women" } : null),
  departmentRedirect: (s) => null,
  designRedirect: (s) => null,
};

describe("resolveCategoryRoute — one segment", () => {
  it("renders a current department", () => {
    expect(resolveCategoryRoute(["women"], lookup)).toEqual({ kind: "department", slug: "women" });
  });

  it("redirects a current design to its nested path", () => {
    expect(resolveCategoryRoute(["cat"], lookup)).toEqual({ kind: "redirect", to: "/categories/women/cat" });
  });

  it("redirects a historical department slug", () => {
    expect(resolveCategoryRoute(["ladies"], lookup)).toEqual({ kind: "redirect", to: "/categories/women" });
  });

  it("redirects a historical design slug", () => {
    expect(resolveCategoryRoute(["kitty"], lookup)).toEqual({ kind: "redirect", to: "/categories/women/cat" });
  });

  it("404s an unknown slug", () => {
    expect(resolveCategoryRoute(["nope"], lookup)).toEqual({ kind: "notFound" });
  });

  it("prefers a current design over both history tables", () => {
    expect(resolveCategoryRoute(["cat"], shadowed)).toEqual({ kind: "redirect", to: "/categories/women/cat" });
  });

  it("gives department precedence when a slug is both department and design", () => {
    expect(resolveCategoryRoute(["unisex"], dualRole)).toEqual({ kind: "department", slug: "unisex" });
  });
});

describe("resolveCategoryRoute — two segments", () => {
  it("renders a matching department/design pair", () => {
    expect(resolveCategoryRoute(["women", "cat"], lookup)).toEqual({
      kind: "design", departmentSlug: "women", designSlug: "cat",
    });
  });

  it("redirects to canonical when the department segment is wrong", () => {
    expect(resolveCategoryRoute(["men", "cat"], lookup)).toEqual({
      kind: "redirect", to: "/categories/women/cat",
    });
  });

  it("redirects a historical design regardless of department segment", () => {
    expect(resolveCategoryRoute(["men", "kitty"], lookup)).toEqual({
      kind: "redirect", to: "/categories/women/cat",
    });
  });

  it("404s an unknown design", () => {
    expect(resolveCategoryRoute(["women", "nope"], lookup)).toEqual({ kind: "notFound" });
  });

  it("redirects an old department slug paired with a current design", () => {
    expect(resolveCategoryRoute(["ladies", "cat"], lookup)).toEqual({
      kind: "redirect", to: "/categories/women/cat",
    });
  });

  it("404s when design segment is empty", () => {
    expect(resolveCategoryRoute(["women", ""], lookup)).toEqual({ kind: "notFound" });
  });
});

describe("resolveCategoryRoute — arity and empty segments", () => {
  it("404s zero segments", () => {
    expect(resolveCategoryRoute([], lookup)).toEqual({ kind: "notFound" });
  });

  it("404s three or more segments", () => {
    expect(resolveCategoryRoute(["women", "cat", "extra"], lookup)).toEqual({ kind: "notFound" });
  });

  it("404s when first segment is empty", () => {
    expect(resolveCategoryRoute([""], lookup)).toEqual({ kind: "notFound" });
  });

  it("redirects when department is empty but design is current", () => {
    expect(resolveCategoryRoute(["", "cat"], lookup)).toEqual({
      kind: "redirect", to: "/categories/women/cat",
    });
  });
});
