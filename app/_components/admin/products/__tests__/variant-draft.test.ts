import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { emptyVariant } from "@/app/_components/admin/products/variant-draft";

// Regression guard for the RSC-boundary bug: emptyVariant() is called from the
// server component app/admin/products/new/page.tsx. Next.js forbids calling a
// function exported from a "use client" module on the server, so this factory
// MUST live in a non-client module.
describe("variant-draft", () => {
  it("emptyVariant() returns a blank draft with the standard sizes", () => {
    const v = emptyVariant();
    expect(v).toMatchObject({ color: "", colorSlug: "", sku: "", cardImages: [], detailImages: [] });
    expect(v.sizeStocks.map((s) => s.size)).toEqual(["S", "M", "L", "XL"]);
    expect(v.sizeStocks.every((s) => s.stock === "0")).toBe(true);
    expect(v.id).toBeUndefined();
  });

  it("variant-draft.ts is NOT a client module (server components import emptyVariant from it)", () => {
    const src = readFileSync("app/_components/admin/products/variant-draft.ts", "utf8");
    // A "use client" directive is a bare string statement at the start of a line
    // (not the words appearing inside a comment).
    expect(src).not.toMatch(/^\s*["']use client["']\s*;?\s*$/m);
  });

  it("the server new-product page imports emptyVariant from variant-draft, not the client editor", () => {
    const page = readFileSync("app/admin/products/new/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/app\/_components\/admin\/products\/variant-draft"/);
    expect(page).not.toMatch(/emptyVariant.*from "@\/app\/_components\/admin\/products\/variant-editor"/);
  });
});
