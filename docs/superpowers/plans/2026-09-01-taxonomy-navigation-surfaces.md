# Taxonomy Navigation Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the storefront's taxonomy surfaces — a header mega-menu, a richer browse filter tree, and unified breadcrumbs with department-aware card labels and photo-capable tiles.

**Architecture:** A shared foundation goes first (a breadcrumb component, a pure trail builder, a pure counts helper, and photo support on the existing tile), because all three surfaces consume it. The mega-menu is the only genuinely new surface: it is a client leaf built on Base UI's `navigation-menu`, fed rows by a Server Component header. The filter tree is extracted from a 244-line page and enriched. The breadcrumb work is largely repair: three ad-hoc implementations collapse into one, and the PDP's design crumb stops pointing at a URL nothing reads.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript, Tailwind v4, Base UI (`@base-ui/react` ^1.4.1), Prisma/PostgreSQL behind `unstable_cache`, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-09-01-taxonomy-navigation-surfaces-design.md`

## Global Constraints

- **Tests are `.test.ts`, never `.tsx`.** `vitest.config.ts` sets `environment: "node"`, `globals: false`, and collects only `app/**/__tests__/**/*.test.ts` and `app/**/*.test.ts`. Test files contain **no JSX**: call a component as a function and inspect the returned element tree.
- **A tree walk does not enter child components.** A child appears as an element whose `type` is the function and whose `props` are what was passed; its rendered markup is invisible. Assert a component's own output in its own test.
- **Importing `@/app/_lib/taxonomy` pulls in Prisma and `next/cache`** (`getDepartments` is built with `unstable_cache` at module scope). Any test importing it must mock both, as `app/categories/__tests__/index-page.test.ts` does.
- **`SiteHeader` and `SiteFooter` render on every page.** A mistake in either is site-wide.
- **CLAUDE.md §3:** favour Server Components; keep Client Components small and at the leaves; **never render an `async` Server Component inside a `"use client"` component.** Data crosses the boundary, components do not.
- **Base UI, not Radix.** The exact part names, verified from `node_modules/@base-ui/react/*/index.parts.d.ts`:
  - `NavigationMenu`: `Root, List, Item, Trigger, Content, Portal, Positioner, Popup, Viewport, Backdrop, Arrow, Link, Icon`
  - `Accordion`: `Root, Item, Header, Trigger, Panel`
  - `NavigationMenu.Root` renders a `<nav>` and accepts `value` / `defaultValue` / `onValueChange` / `delay` (default 50ms).
- **If the type checker rejects a Base UI composition below, do not invent an API.** Read the part's `.d.ts` under `node_modules/@base-ui/react/navigation-menu/` or `/accordion/`, adjust minimally, and say exactly what you changed in your report.
- **The final breadcrumb crumb never carries an href**, and `aria-current="page"` goes on the last item only.
- **The sub-category crumb never carries an href** — `subName` is a column on the department, not a URL level — and appears **only when a design is present**, so a department page's own crumb stays last and unlinked instead of self-linking.
- **Ink over a photo is not measured.** `inkFor` applies only to tintless tiles; a tile with an image uses `INK_LIGHT` over a scrim.
- Commits follow Conventional Commits per `openspec/COMMIT_PROCESS.md`.

## Not in this plan

The OpenSpec artifacts (`proposal.md`, `design.md`, `tasks.md` and the delta specs) are created by `/opsx:propose` before implementation and merged by `/opsx:sync` after, per CLAUDE.md §1. Do not hand-write delta specs while executing this plan.

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `app/_lib/taxonomy-trail.ts` | 1 | Pure: taxonomy position → breadcrumb items |
| `app/_lib/taxonomy-trail.test.ts` | 1 | Trail shape, href rules, sub-crumb rule |
| `app/_components/ui/breadcrumb.tsx` | 1 | One `<nav aria-label="Breadcrumb"><ol>` renderer |
| `app/_components/ui/__tests__/breadcrumb.test.ts` | 1 | Markup semantics, last-crumb rules |
| `app/_lib/taxonomy-counts.ts` | 2 | Pure: products → per-design and per-department counts |
| `app/_lib/taxonomy-counts.test.ts` | 2 | Attribution and empty cases |
| `app/_components/ui/tint-tile.tsx` | 3 | Gains optional `image` with scrim + light ink |
| `app/_components/ui/__tests__/tint-tile.test.ts` | 3 | Extended: photo path vs. tint path |
| `app/_components/header/mega-menu.tsx` | 4 | Client leaf: the panel, or a plain link when degenerate |
| `app/_components/header/__tests__/mega-menu.test.ts` | 4 | Emitted links, degenerate fallback |
| `app/_components/home/site-header.tsx` | 4 | Becomes async, reads departments once, passes rows down |
| `app/_components/header/mobile-nav.tsx` | 5 | Gains the taxonomy accordion |
| `app/_components/header/__tests__/mobile-nav.test.ts` | 5 | Accordion links and the one-department case |
| `app/_components/categories/filter-tree.tsx` | 6 | Extracted sidebar + design counts + active state |
| `app/_components/categories/__tests__/filter-tree.test.ts` | 6 | Counts, active state, links |
| `app/categories/(index)/page.tsx` | 6 | Uses the extracted tree and gains a breadcrumb |
| `app/categories/[...slug]/page.tsx` | 7 | Two inline navs → shared breadcrumb |
| `app/products/[id]/page.tsx` | 7 | Full trail; dead crumb fixed |
| `app/_components/product/breadcrumb.tsx` | 7 | **Deleted** — superseded |
| `app/_lib/products.ts` | 7, 8 | `getProductDetail` includes the department; `cardSelect` gains the design→department relation |
| `app/_components/home/product-card.tsx` | 8 | Eyebrow reads "Department › Design" |

---

### Task 1: The breadcrumb and its trail builder

**Files:**
- Create: `app/_lib/taxonomy-trail.ts`, `app/_lib/taxonomy-trail.test.ts`
- Create: `app/_components/ui/breadcrumb.tsx`, `app/_components/ui/__tests__/breadcrumb.test.ts`

**Interfaces:**
- Consumes: `designPath` from `@/app/_lib/taxonomy-path` (pure, no Prisma — import from there, **not** from `@/app/_lib/taxonomy`, so the trail test needs no mocks)
- Produces: `type Crumb = { label: string; href?: string }`, `taxonomyTrail(input): Crumb[]`, and `Breadcrumb({ items, className? })`. Tasks 6 and 7 consume both.

- [ ] **Step 1: Write the failing trail test**

Create `app/_lib/taxonomy-trail.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";

const women = { slug: "women", name: "Women", subName: "Oversized Graphic T-Shirts" };
const plain = { slug: "plain", name: "Plain T-Shirts (Unisex)", subName: null };
const cats = { slug: "cat", name: "Cats" };

describe("taxonomyTrail", () => {
  it("starts every trail at Home and Categories", () => {
    expect(taxonomyTrail({})).toEqual([
      { label: "Home", href: "/" },
      { label: "Categories" },
    ]);
  });

  it("ends a department page on the department, unlinked and without its sub-category", () => {
    // The sub-category is context for a design, not a place you can be. Omitting
    // it here also stops the department crumb linking to the page you are on.
    expect(taxonomyTrail({ department: women })).toEqual([
      { label: "Home", href: "/" },
      { label: "Categories", href: "/categories" },
      { label: "Women" },
    ]);
  });

  it("shows the sub-category, unlinked, between department and design", () => {
    expect(taxonomyTrail({ department: women, design: cats })).toEqual([
      { label: "Home", href: "/" },
      { label: "Categories", href: "/categories" },
      { label: "Women", href: "/categories/women" },
      { label: "Oversized Graphic T-Shirts" },
      { label: "Cats" },
    ]);
  });

  it("omits the sub-category crumb for a department that has none", () => {
    const labels = taxonomyTrail({ department: plain, design: { slug: "tote", name: "Tote" } })
      .map((c) => c.label);
    expect(labels).toEqual(["Home", "Categories", "Plain T-Shirts (Unisex)", "Tote"]);
  });

  it("links the design when a product follows it", () => {
    const trail = taxonomyTrail({ department: women, design: cats, productName: "Cat Tee" });
    expect(trail.at(-2)).toEqual({ label: "Cats", href: "/categories/women/cat" });
    expect(trail.at(-1)).toEqual({ label: "Cat Tee" });
  });

  it("never leaves an href on the final crumb", () => {
    for (const input of [
      {},
      { department: women },
      { department: women, design: cats },
      { department: women, design: cats, productName: "Cat Tee" },
    ]) {
      expect(taxonomyTrail(input).at(-1)?.href).toBeUndefined();
    }
  });

  it("drops a design that has no department, rather than inventing a path", () => {
    // designPath needs both segments; a design with no department cannot be linked.
    expect(taxonomyTrail({ design: cats }).map((c) => c.label)).toEqual(["Home", "Categories"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run app/_lib/taxonomy-trail.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/taxonomy-trail"`.

- [ ] **Step 3: Write the trail builder**

Create `app/_lib/taxonomy-trail.ts`:

```ts
import { designPath } from "@/app/_lib/taxonomy-path";

export type Crumb = { label: string; href?: string };

type TrailInput = {
  department?: { slug: string; name: string; subName: string | null } | null;
  design?: { slug: string; name: string } | null;
  productName?: string | null;
};

/** Home › Categories › Department › [sub-category] › [Design] › [Product].
 *
 *  Two rules the callers rely on:
 *  - The sub-category is never a link and appears only alongside a design.
 *    `subName` is a column on the department, not a level in the URL, and on a
 *    department's own page it would otherwise push that page's crumb into
 *    linking to itself.
 *  - The final crumb never carries an href — it is the page you are on. */
export function taxonomyTrail({ department, design, productName }: TrailInput): Crumb[] {
  const crumbs: Crumb[] = [
    { label: "Home", href: "/" },
    { label: "Categories", href: "/categories" },
  ];

  if (department) {
    crumbs.push({ label: department.name, href: `/categories/${department.slug}` });
    // A design cannot be linked without its department, so both are required.
    if (design) {
      if (department.subName) crumbs.push({ label: department.subName });
      crumbs.push({ label: design.name, href: designPath(department.slug, design.slug) });
    }
  }

  if (productName) crumbs.push({ label: productName });

  const last = crumbs[crumbs.length - 1];
  crumbs[crumbs.length - 1] = { label: last.label };
  return crumbs;
}
```

- [ ] **Step 4: Run the trail test**

Run: `npx vitest run app/_lib/taxonomy-trail.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing breadcrumb test**

Create `app/_components/ui/__tests__/breadcrumb.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import type { Crumb } from "@/app/_lib/taxonomy-trail";

const items: Crumb[] = [
  { label: "Home", href: "/" },
  { label: "Categories", href: "/categories" },
  { label: "Women", href: "/categories/women" },
  { label: "Oversized Graphic T-Shirts" },
  { label: "Cats" },
];

/** Collect every element in the tree, depth-first, in render order. */
function collectElements(
  node: unknown,
  out: { type: unknown; props: Record<string, unknown> }[] = [],
): { type: unknown; props: Record<string, unknown> }[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.props) {
    out.push({ type: el.type, props: el.props });
    collectElements(el.props.children, out);
  }
  return out;
}

describe("Breadcrumb", () => {
  it("is a labelled nav wrapping an ordered list", () => {
    const tree = Breadcrumb({ items }) as { type: unknown; props: Record<string, unknown> };
    expect(tree.type).toBe("nav");
    expect(tree.props["aria-label"]).toBe("Breadcrumb");
    expect(collectElements(tree).some((e) => e.type === "ol")).toBe(true);
  });

  it("marks only the last crumb as the current page", () => {
    const current = collectElements(Breadcrumb({ items }))
      .filter((e) => e.props["aria-current"] === "page");
    expect(current).toHaveLength(1);
    expect(collectElements(current[0]).map((e) => e.props.children)).toContain("Cats");
  });

  it("links every crumb that has an href and none that does not", () => {
    const hrefs = collectElements(Breadcrumb({ items }))
      .map((e) => e.props.href)
      .filter((h): h is string => typeof h === "string");
    expect(hrefs).toEqual(["/", "/categories", "/categories/women"]);
  });

  it("hides its separators from assistive technology", () => {
    const seps = collectElements(Breadcrumb({ items }))
      .filter((e) => e.props["aria-hidden"] === "true");
    // One between each pair of crumbs.
    expect(seps).toHaveLength(items.length - 1);
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run app/_components/ui/__tests__/breadcrumb.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_components/ui/breadcrumb"`.

- [ ] **Step 7: Write the breadcrumb component**

Create `app/_components/ui/breadcrumb.tsx`:

```tsx
import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Crumb } from "@/app/_lib/taxonomy-trail";

/** The one breadcrumb on the site. `aria-current` marks the last crumb only:
 *  an unlinked middle crumb (the sub-category) is context, not your location. */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              {i > 0 && (
                <li aria-hidden="true">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </li>
              )}
              <li
                {...(isLast ? { "aria-current": "page" as const } : {})}
                className={isLast ? "font-medium text-foreground line-clamp-1" : undefined}
              >
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="underline-offset-4 transition-colors duration-(--duration-fast) hover:text-brand hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  crumb.label
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 8: Run both test files**

Run: `npx vitest run app/_lib/taxonomy-trail.test.ts app/_components/ui/__tests__/breadcrumb.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 9: Full suite and commit**

Run `npm run test`, then:

```bash
git add app/_lib/taxonomy-trail.ts app/_lib/taxonomy-trail.test.ts app/_components/ui/breadcrumb.tsx app/_components/ui/__tests__/breadcrumb.test.ts
git commit -m "feat(taxonomy): add the shared breadcrumb and its trail builder"
```

---

### Task 2: Taxonomy counts

**Files:**
- Create: `app/_lib/taxonomy-counts.ts`, `app/_lib/taxonomy-counts.test.ts`

**Interfaces:**
- Produces: `countsByDesign(products): Map<string, number>` and `countsByDepartment(departments, byDesign): Map<string, number>`. Task 6 consumes both.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/taxonomy-counts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";

const departments = [
  { slug: "women", designs: [{ slug: "cat" }, { slug: "dino" }] },
  { slug: "men", designs: [{ slug: "car" }] },
  { slug: "plain", designs: [] },
];

describe("countsByDesign", () => {
  it("counts products per design slug", () => {
    const counts = countsByDesign([
      { category: "cat" }, { category: "cat" }, { category: "dino" },
    ]);
    expect(counts.get("cat")).toBe(2);
    expect(counts.get("dino")).toBe(1);
  });

  it("reports nothing for a design with no products", () => {
    expect(countsByDesign([]).get("cat")).toBeUndefined();
  });
});

describe("countsByDepartment", () => {
  it("sums its designs' counts", () => {
    const byDesign = countsByDesign([
      { category: "cat" }, { category: "cat" }, { category: "dino" }, { category: "car" },
    ]);
    const byDept = countsByDepartment(departments, byDesign);
    expect(byDept.get("women")).toBe(3);
    expect(byDept.get("men")).toBe(1);
  });

  it("gives an empty department zero rather than leaving it absent", () => {
    // The sidebar renders the number directly; `undefined` would print nothing.
    expect(countsByDepartment(departments, countsByDesign([])).get("plain")).toBe(0);
  });

  it("ignores a product whose design belongs to no listed department", () => {
    const byDesign = countsByDesign([{ category: "cat" }, { category: "orphan" }]);
    const byDept = countsByDepartment(departments, byDesign);
    expect([...byDept.values()].reduce((a, b) => a + b, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run app/_lib/taxonomy-counts.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/taxonomy-counts"`.

- [ ] **Step 3: Write the helper**

Create `app/_lib/taxonomy-counts.ts`:

```ts
/** Product counts for the browse filter tree. Kept pure and separate from the
 *  page so the arithmetic is testable without a database. */

/** `category` is the product's design slug — see ProductView in products.ts. */
export function countsByDesign(products: { category: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return counts;
}

/** Zero, not absent, for a department with no products: the sidebar prints the
 *  number directly and `undefined` would render as nothing at all. */
export function countsByDepartment(
  departments: { slug: string; designs: { slug: string }[] }[],
  byDesign: Map<string, number>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of departments) {
    counts.set(d.slug, d.designs.reduce((sum, g) => sum + (byDesign.get(g.slug) ?? 0), 0));
  }
  return counts;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run app/_lib/taxonomy-counts.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Full suite and commit**

Run `npm run test`, then:

```bash
git add app/_lib/taxonomy-counts.ts app/_lib/taxonomy-counts.test.ts
git commit -m "feat(taxonomy): add pure per-design and per-department counts"
```

---

### Task 3: Photo support on the tint tile

**Files:**
- Modify: `app/_components/ui/tint-tile.tsx`
- Modify: `app/_components/ui/__tests__/tint-tile.test.ts`

**Interfaces:**
- Produces: `TintTile` gains `image?: string | null`. Its existing props and tintless behaviour are unchanged. Task 6 may pass a design's image; the home `DesignGrid` gains it in Task 8.

The tile currently paints a flat tint and picks ink with `inkFor`. `Design.image` is a nullable column with an admin upload path and no renderer. Over a photograph, measured contrast against the tint is meaningless, so a tile with an image uses `INK_LIGHT` over a dark gradient scrim. The tint stays as the background in both cases, so a slow or failed image still shows a sensible ground.

- [ ] **Step 1: Add the failing tests**

Append to `app/_components/ui/__tests__/tint-tile.test.ts` (keep the existing tests and imports; add `INK_LIGHT` to the import from `@/app/_lib/taxonomy-tint` if it is not already there):

```ts
describe("TintTile with a photo", () => {
  it("keeps the tint as the ground so a failed image still has a background", () => {
    const el = TintTile({ href: "/x", label: "Cats", hex: "#EFC4C4", image: "/img/cat.jpg" }) as Rendered;
    expect((el.props.style as { backgroundColor: string }).backgroundColor).toBe("#EFC4C4");
  });

  it("uses light ink over a photo rather than measuring contrast against the tint", () => {
    // #EFC4C4 is light, so inkFor would choose dark ink — which would be the
    // wrong answer over a photograph that could be any colour.
    const el = TintTile({ href: "/x", label: "Cats", hex: "#EFC4C4", image: "/img/cat.jpg" }) as Rendered;
    expect((el.props.style as { color: string }).color).toBe(INK_LIGHT);
  });

  it("renders the image and a scrim above it", () => {
    const tree = TintTile({ href: "/x", label: "Cats", hex: "#EFC4C4", image: "/img/cat.jpg" });
    const srcs = collectProp(tree, "src");
    expect(srcs).toContain("/img/cat.jpg");
    expect(collectProp(tree, "data-scrim")).toHaveLength(1);
  });

  it("is unchanged when image is null", () => {
    const withNull = TintTile({ href: "/x", label: "Cats", hex: "#EFC4C4", image: null }) as Rendered;
    const without = TintTile({ href: "/x", label: "Cats", hex: "#EFC4C4" }) as Rendered;
    expect((withNull.props.style as { color: string }).color)
      .toBe((without.props.style as { color: string }).color);
    expect(collectProp(withNull, "src")).toHaveLength(0);
  });
});
```

Add this helper to the same file if it is not already present:

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run app/_components/ui/__tests__/tint-tile.test.ts`
Expected: FAIL — the photo tests fail (no `src` in the tree, ink is `INK_DARK`); the four original tests still pass.

- [ ] **Step 3: Implement**

Rewrite `app/_components/ui/tint-tile.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { inkFor, INK_LIGHT } from "@/app/_lib/taxonomy-tint";

type TintTileProps = {
  href: string;
  label: string;
  subLabel?: string | null;
  hex: string;
  image?: string | null;
  className?: string;
};

/** A tinted browse tile.
 *
 *  Without an image, ink is chosen by measured contrast (`inkFor`), never by a
 *  luminance threshold — see the comment block in app/_lib/taxonomy-tint.ts.
 *  With one, contrast against the tint says nothing about legibility over the
 *  photograph, so the tile uses light ink over a scrim instead. The tint stays
 *  as the ground either way, so a slow or failed image still has a background. */
export function TintTile({ href, label, subLabel, hex, image, className }: TintTileProps) {
  const ink = image ? INK_LIGHT : inkFor(hex);
  return (
    <Link
      href={href}
      className={cn(
        "relative flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-center",
        "transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
      style={{ backgroundColor: hex, color: ink }}
    >
      {image && (
        <>
          <Image src={image} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
          <div
            data-scrim=""
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10"
          />
        </>
      )}
      <span className="relative font-heading text-[28px] font-bold leading-tight">{label}</span>
      {subLabel && (
        <span className="relative font-mono text-[10px] uppercase tracking-[0.16em]">{subLabel}</span>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: Run the tile tests**

Run: `npx vitest run app/_components/ui/__tests__/tint-tile.test.ts`
Expected: PASS, 8 tests (4 original + 4 new).

- [ ] **Step 5: Full suite, type check, contrast gate, commit**

Run `npm run test`, `npx tsc --noEmit`, and `npm run check:contrast` — the contrast gate must still pass, because the tintless path is untouched. Then:

```bash
git add app/_components/ui/tint-tile.tsx app/_components/ui/__tests__/tint-tile.test.ts
git commit -m "feat(taxonomy): let a tint tile carry a photo over its tint ground"
```

---

### Task 4: The header mega-menu

**Files:**
- Create: `app/_lib/taxonomy-nav.ts`, `app/_lib/taxonomy-nav.test.ts`
- Create: `app/_components/header/mega-menu.tsx`, `app/_components/header/__tests__/mega-menu.test.ts`
- Modify: `app/_components/home/site-header.tsx`

**Interfaces:**
- Consumes: `getDepartments`, `showsNavDropdown` from `@/app/_lib/taxonomy` (server side only)
- Produces: `type NavColumn = { label: string; href: string; designs: { label: string; href: string }[] }`, `navColumns(departments): NavColumn[]`, `MIN_MEGA_MENU_COLUMNS = 2`, and `MegaMenu({ columns })`. Task 5 consumes `NavColumn` and the same rows.

**Two constraints that shape this task — read before writing code.**

1. **`mega-menu.tsx` is a Client Component and MUST NOT import `@/app/_lib/taxonomy`.** That module builds `getDepartments` with `unstable_cache` and imports Prisma at module scope; pulling it into a client bundle is a build failure, not a size problem. The header does the taxonomy work on the server and passes plain data down. A **type-only** import (`import type { NavColumn }`) is erased at compile time and is fine.
2. **Do not use `NavigationMenu.Link` for the panel's links.** Base UI's `render` prop puts the rendered element in `props.render`, so an href passed that way is invisible to a tree walk and untestable by this repo's convention. Plain `next/link` `<Link>` elements inside the content keep hrefs in `props.children`. The only thing given up is Base UI's close-on-click, which is moot when the click performs a full navigation.

- [ ] **Step 1: Write the failing model test**

Create `app/_lib/taxonomy-nav.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { navColumns, MIN_MEGA_MENU_COLUMNS } from "@/app/_lib/taxonomy-nav";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }],
  ...over,
});

describe("navColumns", () => {
  it("builds one column per department, using the nav label", () => {
    const cols = navColumns([dept({ navLabel: "Women" })]);
    expect(cols).toEqual([
      {
        label: "Women",
        href: "/categories/women",
        designs: [{ label: "Cats", href: "/categories/women/cat" }],
      },
    ]);
  });

  it("omits a department with no designs, through the derived rule", () => {
    const cols = navColumns([dept({ slug: "women" }), dept({ slug: "men", navLabel: "Men", designs: [] })]);
    expect(cols.map((c) => c.href)).toEqual(["/categories/women"]);
  });

  it("includes a department that has designs but no sub-category", () => {
    // showsNavDropdown asks only about designs — unlike the home design grid,
    // the nav lists Plain Tees and Accessories too.
    const cols = navColumns([
      dept({ slug: "plain", navLabel: "Plain Tees", subName: null,
             designs: [{ slug: "tote", name: "Tote", hex: "#C9B79A" }] }),
    ]);
    expect(cols).toHaveLength(1);
    expect(cols[0].designs[0].href).toBe("/categories/plain/tote");
  });

  it("states its threshold", () => {
    expect(MIN_MEGA_MENU_COLUMNS).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run app/_lib/taxonomy-nav.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/taxonomy-nav"`.

- [ ] **Step 3: Write the model**

Create `app/_lib/taxonomy-nav.ts`:

```ts
import { designPath } from "@/app/_lib/taxonomy-path";
import { showsNavDropdown, type DepartmentView } from "@/app/_lib/taxonomy";

export type NavColumn = {
  label: string;
  href: string;
  designs: { label: string; href: string }[];
};

/** Below this many columns the panel is one lonely list, which is a worse
 *  affordance than a plain link to the browse page. Production has one
 *  qualifying department today. */
export const MIN_MEGA_MENU_COLUMNS = 2;

/** Server-side only: this module reaches `@/app/_lib/taxonomy`, which imports
 *  Prisma. The header calls it and passes the plain result to the client leaf. */
export function navColumns(departments: DepartmentView[]): NavColumn[] {
  return departments.filter(showsNavDropdown).map((d) => ({
    label: d.navLabel,
    href: `/categories/${d.slug}`,
    designs: d.designs.map((g) => ({ label: g.name, href: designPath(d.slug, g.slug) })),
  }));
}
```

- [ ] **Step 4: Run the model test**

Run: `npx vitest run app/_lib/taxonomy-nav.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing component test**

Create `app/_components/header/__tests__/mega-menu.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { NavColumn } from "@/app/_lib/taxonomy-nav";
import { MegaMenu } from "@/app/_components/header/mega-menu";

const columns: NavColumn[] = [
  {
    label: "Women", href: "/categories/women",
    designs: [
      { label: "Cats", href: "/categories/women/cat" },
      { label: "Dino", href: "/categories/women/dino" },
    ],
  },
  {
    label: "Men", href: "/categories/men",
    designs: [{ label: "Car", href: "/categories/men/car" }],
  },
];

/** Walk the returned element tree and collect every `href` prop. */
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

/** Collect every rendered text child. */
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

describe("MegaMenu", () => {
  it("emits every department and every design as a link", () => {
    const hrefs = collectHrefs(MegaMenu({ columns }));
    expect(hrefs).toEqual([
      "/categories/women", "/categories/women/cat", "/categories/women/dino",
      "/categories/men", "/categories/men/car",
    ]);
  });

  it("falls back to a plain Shop link when only one department qualifies", () => {
    // Production today. A one-column panel reads as broken; a link does not.
    const tree = MegaMenu({ columns: [columns[0]] });
    expect(collectHrefs(tree)).toEqual(["/categories"]);
    expect(collectText(tree)).toContain("Shop");
  });

  it("falls back when no department qualifies at all", () => {
    expect(collectHrefs(MegaMenu({ columns: [] }))).toEqual(["/categories"]);
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run app/_components/header/__tests__/mega-menu.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_components/header/mega-menu"`.

- [ ] **Step 7: Write the component**

Create `app/_components/header/mega-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { NavigationMenu } from "@base-ui/react/navigation-menu";
import { MIN_MEGA_MENU_COLUMNS, type NavColumn } from "@/app/_lib/taxonomy-nav";

const TRIGGER_CLASS =
  "flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand data-[popup-open]:text-brand";

/** The "Shop" nav item, expanded into a panel of departments.
 *
 *  Takes plain columns rather than DepartmentView rows: this is a Client
 *  Component, and `@/app/_lib/taxonomy` imports Prisma. The header does that
 *  work and passes the result down. The type-only import below is erased.
 *
 *  Links are plain next/link elements rather than NavigationMenu.Link — Base
 *  UI's `render` prop would move the href into props.render, where this repo's
 *  element-tree tests cannot see it. */
export function MegaMenu({ columns }: { columns: NavColumn[] }) {
  if (columns.length < MIN_MEGA_MENU_COLUMNS) {
    return (
      <Link
        href="/categories"
        className="text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
      >
        Shop
      </Link>
    );
  }

  return (
    <NavigationMenu.Root>
      <NavigationMenu.List className="flex items-center">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className={TRIGGER_CLASS}>
            Shop
            <NavigationMenu.Icon>
              <ChevronDown className="h-3.5 w-3.5" />
            </NavigationMenu.Icon>
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="w-[min(56rem,90vw)] p-6">
            <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4">
              {columns.map((col) => (
                <li key={col.href}>
                  <Link
                    href={col.href}
                    className="font-heading text-sm font-semibold tracking-tight text-foreground transition-colors duration-(--duration-fast) hover:text-brand"
                  >
                    {col.label}
                  </Link>
                  <ul className="mt-3 space-y-1.5">
                    {col.designs.map((d) => (
                      <li key={d.href}>
                        <Link
                          href={d.href}
                          className="text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
                        >
                          {d.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner sideOffset={12} className="z-40">
          <NavigationMenu.Popup className="rounded-xl border bg-background shadow-lg">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}
```

If `tsc` rejects any part above, read its `.d.ts` under `node_modules/@base-ui/react/navigation-menu/`, adjust minimally, and report exactly what you changed — do not invent an API.

- [ ] **Step 8: Run the component test**

Run: `npx vitest run app/_components/header/__tests__/mega-menu.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Wire the header**

In `app/_components/home/site-header.tsx`: add the imports

```tsx
import { getDepartments } from "@/app/_lib/taxonomy";
import { navColumns } from "@/app/_lib/taxonomy-nav";
import { MegaMenu } from "@/app/_components/header/mega-menu";
```

make the component async and read the taxonomy once:

```tsx
export async function SiteHeader() {
  // One cached read (same key the footer already uses on every page), turned
  // into plain columns here so the client leaves never import Prisma.
  const columns = navColumns(await getDepartments());
```

pass `columns` to `<MobileNav columns={columns} />` (Task 5 adds the prop; until then MobileNav ignores it — add the prop in Task 5, not here), and replace the "Shop" entry of the desktop nav. `NAV_LINKS` loses its `/categories` entry, and `MegaMenu` renders in its place:

```tsx
const NAV_LINKS = [
  { href: "/deals", label: "Deals" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];
```

```tsx
        <nav className="hidden items-center gap-5 text-sm md:flex">
          <MegaMenu columns={columns} />
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
            >
              {l.label}
            </Link>
          ))}
        </nav>
```

- [ ] **Step 10: Full suite, type check, commit**

Run `npm run test` and `npx tsc --noEmit`. Every page renders this header, so a failure here is site-wide — read any failure carefully rather than adjusting the test.

```bash
git add app/_lib/taxonomy-nav.ts app/_lib/taxonomy-nav.test.ts app/_components/header/mega-menu.tsx app/_components/header/__tests__/mega-menu.test.ts app/_components/home/site-header.tsx
git commit -m "feat(nav): expand Shop into a department mega-menu"
```

---

### Task 5: The taxonomy in the mobile sheet

**Files:**
- Modify: `app/_components/header/mobile-nav.tsx`
- Create: `app/_components/header/__tests__/mobile-nav.test.ts`
- Modify: `app/_components/home/site-header.tsx` (pass `columns`)

**Interfaces:**
- Consumes: `NavColumn` (type only) from Task 4
- Produces: `MobileNav({ columns })`

The desktop panel is gated behind `md:`, so without this the taxonomy never appears in mobile navigation. Unlike the desktop trigger, the accordion renders whenever **at least one** column exists: a single collapsible row is an ordinary list item, not a broken-looking dropdown.

- [ ] **Step 1: Write the failing test**

Create `app/_components/header/__tests__/mobile-nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { NavColumn } from "@/app/_lib/taxonomy-nav";
import { TaxonomySection } from "@/app/_components/header/mobile-nav";

const columns: NavColumn[] = [
  { label: "Women", href: "/categories/women",
    designs: [{ label: "Cats", href: "/categories/women/cat" }] },
  { label: "Men", href: "/categories/men",
    designs: [{ label: "Car", href: "/categories/men/car" }] },
];

/** Walk the returned element tree and collect every `href` prop. */
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

describe("MobileNav taxonomy", () => {
  it("lists every department and design in the sheet", () => {
    const hrefs = collectHrefs(TaxonomySection({ columns, onNavigate: () => {} }));
    expect(hrefs).toContain("/categories/women");
    expect(hrefs).toContain("/categories/women/cat");
    expect(hrefs).toContain("/categories/men/car");
  });

  it("still renders the taxonomy with a single department", () => {
    // Deliberately unlike the desktop trigger: one collapsible row is a normal
    // list item, and this is the only place the taxonomy reaches phones.
    const hrefs = collectHrefs(TaxonomySection({ columns: [columns[0]], onNavigate: () => {} }));
    expect(hrefs).toContain("/categories/women/cat");
  });

  it("renders nothing when there are no columns", () => {
    expect(TaxonomySection({ columns: [], onNavigate: () => {} })).toBeNull();
  });

  it("closes the sheet when a link is followed", () => {
    let closed = 0;
    const tree = TaxonomySection({ columns, onNavigate: () => { closed += 1; } });
    const handlers = collectProp(tree, "onClick").filter((h): h is () => void => typeof h === "function");
    expect(handlers.length).toBeGreaterThan(0);
    handlers[0]();
    expect(closed).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run app/_components/header/__tests__/mobile-nav.test.ts`
Expected: FAIL — `Failed to resolve import` / `TaxonomySection is not a function`, because it does not exist yet.

**Why the test targets `TaxonomySection` and not `MobileNav`:** `MobileNav` holds `useState`, and calling it as a plain function in the node environment invokes a hook outside a renderer, which throws rather than failing an assertion. Splitting the taxonomy list into an exported presentational function keeps it testable by this repo's convention and keeps the stateful shell untested-but-trivial. Do not add a DOM test environment for this.

Add this helper to the test file alongside `collectHrefs`:

```ts
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
```

- [ ] **Step 3: Implement**

In `app/_components/header/mobile-nav.tsx`, add the imports:

```tsx
import { Accordion } from "@base-ui/react/accordion";
import type { NavColumn } from "@/app/_lib/taxonomy-nav";
```

change the signature to `export function MobileNav({ columns }: { columns: NavColumn[] })`, render `<TaxonomySection columns={columns} onNavigate={() => setOpen(false)} />` inside the sheet's content above the existing static links, and add this exported presentational function to the same file:

```tsx
/** The taxonomy list inside the mobile sheet. Exported and stateless so it can
 *  be tested by calling it: MobileNav itself holds `useState`, which cannot run
 *  in the node test environment. `onNavigate` closes the sheet on a tap. */
export function TaxonomySection({
  columns,
  onNavigate,
}: {
  columns: NavColumn[];
  onNavigate: () => void;
}) {
  if (columns.length === 0) return null;
  return (
          <Accordion.Root className="mb-4 border-b pb-4">
            {columns.map((col) => (
              <Accordion.Item key={col.href} className="border-b last:border-b-0">
                <Accordion.Header>
                  <Accordion.Trigger className="flex w-full items-center justify-between py-3 text-sm font-medium">
                    {col.label}
                    <ChevronDown className="h-4 w-4 transition-transform data-[panel-open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Panel className="pb-3">
                  <ul className="space-y-1 pl-3">
                    <li>
                      <Link
                        href={col.href}
                        onClick={() => setOpen(false)}
                        className="block py-1.5 text-sm text-muted-foreground hover:text-brand"
                      >
                        All {col.label}
                      </Link>
                    </li>
                    {col.designs.map((d) => (
                      <li key={d.href}>
                        <Link
                          href={d.href}
                          onClick={() => setOpen(false)}
                          className="block py-1.5 text-sm text-muted-foreground hover:text-brand"
                        >
                          {d.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion.Root>
  );
}
```

Inside that block, replace every `onClick={() => setOpen(false)}` with `onClick={onNavigate}`. Add `ChevronDown` to the existing `lucide-react` import. Keep the existing `NAV_LINKS` block and the sheet's search field exactly as they are.

- [ ] **Step 4: Pass the prop from the header**

In `app/_components/home/site-header.tsx`, change `<MobileNav />` to `<MobileNav columns={columns} />`.

- [ ] **Step 5: Run the test**

Run: `npx vitest run app/_components/header/__tests__/mobile-nav.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Full suite, type check, commit**

```bash
git add app/_components/header/mobile-nav.tsx app/_components/header/__tests__/mobile-nav.test.ts app/_components/home/site-header.tsx
git commit -m "feat(nav): put the taxonomy in the mobile sheet"
```

---

### Task 6: The browse filter tree

**Files:**
- Create: `app/_components/categories/filter-tree.tsx`, `app/_components/categories/__tests__/filter-tree.test.ts`
- Modify: `app/categories/(index)/page.tsx`

**Interfaces:**
- Consumes: `countsByDesign` / `countsByDepartment` (Task 2), `Breadcrumb` + `taxonomyTrail` (Task 1), `designPath`
- Produces: `FilterTree({ departments, byDesign, byDepartment, totalCount, selectedDesign })`

The sidebar already renders the indented department → design tree with per-department counts — the foundation shipped that. This extracts it from the 244-line page, adds per-**design** counts, and adds an active state for the selected design and its parent. The page also gains the shared breadcrumb.

- [ ] **Step 1: Write the failing test**

Create `app/_components/categories/__tests__/filter-tree.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { FilterTree } from "@/app/_components/categories/filter-tree";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }],
  ...over,
});

const departments = [
  dept({ slug: "women", designs: [
    { slug: "cat", name: "Cats", hex: "#EFC4C4" },
    { slug: "dino", name: "Dino", hex: "#BFD8C2" },
  ] }),
  dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
];

const byDesign = new Map([["cat", 3], ["dino", 1], ["car", 2]]);
const byDepartment = new Map([["women", 4], ["men", 2]]);

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
  if (typeof node === "number") { out.push(String(node)); return out; }
  if (typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectText(props.children, out);
  return out;
}

/** Every element carrying data-active, with its value. */
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

describe("FilterTree", () => {
  it("links every department and design, plus All", () => {
    const hrefs = collectHrefs(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "" }),
    );
    expect(hrefs).toEqual([
      "/categories",
      "/categories/women", "/categories/women/cat", "/categories/women/dino",
      "/categories/men", "/categories/men/car",
    ]);
  });

  it("shows a count beside every design, not just every department", () => {
    const text = collectText(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "" }),
    );
    // department totals
    expect(text).toContain("4");
    expect(text).toContain("2");
    // design counts
    expect(text).toContain("3");
    expect(text).toContain("1");
  });

  it("prints zero for a design with no products rather than nothing", () => {
    const text = collectText(
      FilterTree({
        departments: [dept({ designs: [{ slug: "ghost", name: "Ghost", hex: "#EFC4C4" }] })],
        byDesign: new Map(), byDepartment: new Map([["women", 0]]),
        totalCount: 0, selectedDesign: "",
      }),
    );
    expect(text).toContain("0");
  });

  it("marks the selected design and its parent department active, and nothing else", () => {
    const flags = activeFlags(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "cat" }),
    );
    const active = flags.filter((f) => f.active === true).map((f) => f.href);
    expect(active).toEqual(["/categories/women", "/categories/women/cat"]);
  });

  it("marks All active when no design is selected", () => {
    const flags = activeFlags(
      FilterTree({ departments, byDesign, byDepartment, totalCount: 6, selectedDesign: "" }),
    );
    expect(flags.filter((f) => f.active === true).map((f) => f.href)).toEqual(["/categories"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run app/_components/categories/__tests__/filter-tree.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_components/categories/filter-tree"`.

- [ ] **Step 3: Write the component**

Create `app/_components/categories/filter-tree.tsx`:

```tsx
import Link from "next/link";
import { designPath } from "@/app/_lib/taxonomy-path";
import type { DepartmentView } from "@/app/_lib/taxonomy";

type Props = {
  departments: DepartmentView[];
  byDesign: Map<string, number>;
  byDepartment: Map<string, number>;
  totalCount: number;
  selectedDesign: string;
};

const ROW = "block rounded-lg px-4 py-3 text-sm font-medium transition-colors";
const ROW_ACTIVE = "bg-primary text-primary-foreground shadow-lg";
const ROW_IDLE = "bg-background text-muted-foreground hover:bg-accent hover:text-foreground";

/** The browse sidebar: departments, their designs, and how many products sit
 *  under each. Pure — the page does the reading and the arithmetic. */
export function FilterTree({ departments, byDesign, byDepartment, totalCount, selectedDesign }: Props) {
  return (
    <>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Departments
      </h2>
      <ul className="space-y-1">
        <li>
          <Link
            href="/categories"
            data-active={!selectedDesign}
            className={`${ROW} ${!selectedDesign ? ROW_ACTIVE : ROW_IDLE}`}
          >
            <span className="flex items-center justify-between">
              <span>All</span>
              <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs font-normal">
                {totalCount}
              </span>
            </span>
          </Link>
        </li>
        {departments.map((d) => {
          // A department is active because the selected design lives under it.
          const deptActive = d.designs.some((g) => g.slug === selectedDesign);
          return (
            <li key={d.slug}>
              <Link
                href={`/categories/${d.slug}`}
                data-active={deptActive}
                className={`${ROW} ${deptActive ? ROW_ACTIVE : ROW_IDLE}`}
              >
                <span className="flex items-center justify-between">
                  <span>{d.name}</span>
                  <span className="rounded-full bg-primary-foreground/10 px-2 py-0.5 text-xs font-normal">
                    {byDepartment.get(d.slug) ?? 0}
                  </span>
                </span>
              </Link>
              {d.designs.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-4">
                  {d.designs.map((g) => {
                    const active = g.slug === selectedDesign;
                    return (
                      <li key={g.slug}>
                        <Link
                          href={designPath(d.slug, g.slug)}
                          data-active={active}
                          className={`flex items-center justify-between rounded-lg px-4 py-1.5 text-sm transition-colors ${
                            active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          <span>{g.name}</span>
                          <span className="text-xs text-muted-foreground">{byDesign.get(g.slug) ?? 0}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run app/_components/categories/__tests__/filter-tree.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Use it from the page**

In `app/categories/(index)/page.tsx`:

Add imports:

```tsx
import { countsByDesign, countsByDepartment } from "@/app/_lib/taxonomy-counts";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import { FilterTree } from "@/app/_components/categories/filter-tree";
```

After `linkedDepartments` is computed, add:

```tsx
  const byDesign = countsByDesign(allProducts);
  const byDepartment = countsByDepartment(linkedDepartments, byDesign);
```

Replace the entire `<h2>Departments</h2>` heading and the `<ul className="space-y-1">…</ul>` that follows it inside the `<aside>` — from the heading through that list's closing tag — with:

```tsx
              <FilterTree
                departments={linkedDepartments}
                byDesign={byDesign}
                byDepartment={byDepartment}
                totalCount={allProducts.length}
                selectedDesign={selectedCategory}
              />
```

Leave the `<aside>`, the `sticky top-24` wrapper, and the Sort block exactly as they are. Then add the breadcrumb immediately inside the hero `<div className="mx-auto max-w-7xl px-4 py-12 …">`, above the `<h1>`:

```tsx
          <Breadcrumb items={taxonomyTrail({})} className="mb-4" />
```

Delete the now-unused inline count computation (`const designSlugs = …` / `const deptProducts = …`) and any import left unused by the extraction — `inkFor` and `designPath` may still be used elsewhere on the page, so let `npx tsc --noEmit` and `npm run lint` tell you rather than guessing.

- [ ] **Step 6: Full suite, type check, lint, commit**

```bash
git add app/_components/categories/filter-tree.tsx app/_components/categories/__tests__/filter-tree.test.ts "app/categories/(index)/page.tsx"
git commit -m "feat(browse): extract the filter tree, add design counts and active state"
```

---

### Task 7: One breadcrumb everywhere

**Files:**
- Modify: `app/_lib/products.ts` (`getProductDetail` includes the department)
- Modify: `app/categories/[...slug]/page.tsx` (two inline navs)
- Modify: `app/products/[id]/page.tsx`
- Delete: `app/_components/product/breadcrumb.tsx`

**Interfaces:**
- Consumes: `Breadcrumb` + `taxonomyTrail` (Task 1)

Three ad-hoc breadcrumbs collapse into one. The PDP's design crumb currently points at `/?category=${designSlug}`; `app/page.tsx` reads no search params, so that link silently lands on the home page. This is the fix.

- [ ] **Step 1: Include the department in the product detail read**

In `app/_lib/products.ts`, inside `getProductDetail`'s `prisma.product.findUnique`, change `design: true` to:

```ts
        design: { include: { department: true } },
```

That is the only data change: the department rides along on the join the query already performs. Check whether `ProductDetail`'s type needs widening — if it is derived from the Prisma payload it will widen itself; if it names fields explicitly, add the department there too, and report which it was.

- [ ] **Step 2: Replace the PDP breadcrumb**

In `app/products/[id]/page.tsx`, swap the import

```tsx
import { Breadcrumb } from "@/app/_components/product/breadcrumb";
```

for

```tsx
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";
```

and replace the `<Breadcrumb …/>` call with:

```tsx
          <Breadcrumb
            items={taxonomyTrail({
              department: detail.product.design.department,
              design: detail.product.design,
              productName: detail.product.name,
            })}
          />
```

- [ ] **Step 3: Replace both inline navs on the category routes**

In `app/categories/[...slug]/page.tsx`, add:

```tsx
import { Breadcrumb } from "@/app/_components/ui/breadcrumb";
import { taxonomyTrail } from "@/app/_lib/taxonomy-trail";
```

On the **design** page, replace the whole `<nav className="mb-4 text-sm"> … </nav>` block with:

```tsx
          <Breadcrumb items={taxonomyTrail({ department, design })} className="mb-4" />
```

On the **department** page, replace its `<nav className="mb-4 text-sm"> … </nav>` block with:

```tsx
          <Breadcrumb items={taxonomyTrail({ department })} className="mb-4" />
```

Both pages already have `department` (and `design`) in scope at those points. If either lacks `subName` on the object in scope, widen the read rather than passing a partial — `taxonomyTrail` needs `{ slug, name, subName }`.

- [ ] **Step 4: Delete the superseded component**

```bash
git rm app/_components/product/breadcrumb.tsx
grep -rn "product/breadcrumb" app --include=*.ts --include=*.tsx
```
Expected: no output.

- [ ] **Step 5: Verify the dead link is gone**

```bash
grep -rn "?category=" app --include=*.tsx
```
Expected: hits only in `app/categories/(index)/page.tsx` and `app/search/page.tsx`, which genuinely read that param — **no hit pointing at `/` any more.**

- [ ] **Step 6: Full suite, type check, commit**

```bash
git add app/_lib/products.ts "app/categories/[...slug]/page.tsx" "app/products/[id]/page.tsx"
git commit -m "fix(taxonomy): one breadcrumb everywhere, and stop the PDP crumb pointing at a dead URL"
```

---

### Task 8: Designs carry their photo

**Files:**
- Modify: `app/_lib/taxonomy.ts` (`DesignSummary` gains `image`, the select fetches it)
- Modify: `app/_components/home/design-grid.tsx` (pass it through)
- Modify: `app/_components/home/__tests__/design-grid.test.ts`

`Design.image` is a nullable column with an admin upload path and no renderer. Task 3 gave `TintTile` the ability to show one; this supplies it.

- [ ] **Step 1: Widen the taxonomy read**

In `app/_lib/taxonomy.ts`, add `image` to the type and the select:

```ts
export type DesignSummary = { slug: string; name: string; hex: string; image: string | null };
```

```ts
      include: { designs: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { slug: true, name: true, hex: true, image: true } } },
```

- [ ] **Step 2: Add the failing test**

Append to `app/_components/home/__tests__/design-grid.test.ts` (the existing `dept` fixture's designs will need `image: null` added to satisfy the widened type — update it, and expect the existing tests to keep passing):

```ts
  it("hands a design's photo to its tile, and nothing when there is none", () => {
    const tree = DesignGrid({
      departments: [
        dept({
          slug: "women",
          designs: [
            { slug: "cat", name: "Cats", hex: "#EFC4C4", image: "/img/cat.jpg" },
            { slug: "dino", name: "Dino", hex: "#BFD8C2", image: null },
          ],
        }),
      ],
    });
    expect(collectProp(tree, "image")).toEqual(["/img/cat.jpg", null]);
  });
```

Add the `collectProp` helper to this file if Task 4 of the previous change did not already leave one there.

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run app/_components/home/__tests__/design-grid.test.ts`
Expected: FAIL — `collectProp(tree, "image")` returns `[]`, because the grid passes no `image`.

- [ ] **Step 4: Pass it through**

In `app/_components/home/design-grid.tsx`, add `image={design.image}` to the `TintTile` call.

- [ ] **Step 5: Run the test**

Run: `npx vitest run app/_components/home/__tests__/design-grid.test.ts`
Expected: PASS — the existing tests plus the new one.

- [ ] **Step 6: Full suite, type check, commit**

`npx tsc --noEmit` is the real gate here: widening `DesignSummary` ripples to every fixture that constructs one. Fix the fixtures, not the type.

```bash
git add app/_lib/taxonomy.ts app/_components/home/design-grid.tsx app/_components/home/__tests__/design-grid.test.ts
git commit -m "feat(taxonomy): render a design's photo on its tile when it has one"
```

---

### Task 9: Card sub-labels

**Files:**
- Modify: `app/_lib/products.ts` (`cardSelect`, `ProductView`, the mapping)
- Modify: `app/_components/home/product-card.tsx`
- Modify: `app/_lib/category-label.ts`
- Modify: `app/_lib/category-label.test.ts` (create it if absent)

A card's eyebrow currently reads the design name alone. It gains its department: "Women › Cats". The department name comes from a relation on the query `cardSelect` already runs — never a second read, and never `getDepartments()` threaded into a card.

- [ ] **Step 1: Widen the card read**

In `app/_lib/products.ts`, add to `cardSelect`:

```ts
  design: { select: { name: true, department: { select: { name: true } } } },
```

add to `ProductView`:

```ts
  /** Department name for the card eyebrow. Null only if a design somehow has no
   *  department row; the card falls back to the design name alone. */
  departmentName: string | null;
```

and in the mapping at the `category: p.designSlug` line, add:

```ts
      departmentName: p.design?.department?.name ?? null,
```

- [ ] **Step 2: Write the failing label test**

`cardEyebrow` lives in `app/_lib/category-label.ts`, beside `prettifyCategory` — **not** in `product-card.tsx`. The card is a Client Component whose import chain reaches dialogs, the wishlist and colour swatches; importing it from a node test loads all of that for one pure string function. Add to `app/_lib/category-label.test.ts` (create the file if it does not exist, with the imports below):

```ts
import { describe, it, expect } from "vitest";
import { cardEyebrow } from "@/app/_lib/category-label";

describe("cardEyebrow", () => {
  it("reads department then design", () => {
    expect(cardEyebrow("Women", "cat")).toBe("Women › Cats");
  });

  it("falls back to the design alone with no dangling separator", () => {
    expect(cardEyebrow(null, "cat")).toBe("Cats");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run app/_lib/category-label.test.ts`
Expected: FAIL — `cardEyebrow` is not exported from `@/app/_lib/category-label`.

- [ ] **Step 4: Implement**

Add to `app/_lib/category-label.ts`, below `prettifyCategory`:

```ts
/** "Women › Cats", or just "Cats" when the department is unknown — never a
 *  dangling separator. Pure and kept out of the card component so it can be
 *  tested without loading the card's client-only import chain. */
export function cardEyebrow(departmentName: string | null, designSlug: string): string {
  const design = prettifyCategory(designSlug);
  return departmentName ? `${departmentName} › ${design}` : design;
}
```

Then in `app/_components/home/product-card.tsx`: import `cardEyebrow` from `@/app/_lib/category-label` (it already imports `prettifyCategory` from there), destructure `departmentName` from `product` alongside `category`, and replace the eyebrow's `prettifyCategory(category)` with `cardEyebrow(departmentName, category)`. Drop the `prettifyCategory` import if nothing else in the file uses it — let lint tell you.

- [ ] **Step 5: Run the test**

Run: `npx vitest run app/_components/home/__tests__/product-card-label.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Full suite, type check, commit**

Widening `ProductView` ripples into every fixture that builds one — fix the fixtures, not the type.

```bash
git add app/_lib/products.ts app/_lib/category-label.ts app/_lib/category-label.test.ts app/_components/home/product-card.tsx
git commit -m "feat(cards): label a card with its department as well as its design"
```

---

### Task 10: Full validation

**Files:** none — verification only.

- [ ] **Step 1: Full unit suite**

Run: `npm run test`
Expected: PASS. The baseline before this plan is 869 across 106 files; this plan adds roughly 37 tests across 8 new files plus additions to two existing ones. Report the real number rather than a predicted one — the count is evidence, not a target. Any pre-existing failure is a stop-and-investigate.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean. Two widened types (`DesignSummary`, `ProductView`) ripple through fixtures; this is the step that finds them.

- [ ] **Step 3: Contrast gate**

Run: `npm run check:contrast`
Expected: all pairs and tints at AA. The tintless tile path is untouched, so this must not move.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no **new** findings. The known pre-existing set is 7 problems (4 errors, 3 warnings) in `order-items-editor.tsx`, `product-picker.tsx`, `buy-box-client.tsx`, `image-gallery.tsx`, `sms.ts` and `taxonomy-route.test.ts` — none of which this plan touches. Verify with `git diff --name-only` against the branch base rather than trusting the tally.

- [ ] **Step 5: Record what cannot run here**

`npm run build` and `npm run test:e2e` **cannot run on this dev box** — `DATABASE_URL` points at the docker-compose host `postgres`, which does not resolve. Do not report them as passing. State in the final summary that both are owed a green run in CI or against the VPS.

This change carries more build risk than its predecessors: it adds a `next/image` call with a remote-ish `src` from the database, and Next's image config may reject a host or a path pattern the unit tests never exercise. Say so explicitly in the summary rather than implying the change is fully verified.

- [ ] **Step 6: Commit any incidental fixes**

Fix and commit separately with a `fix(...)` message so review can see them apart from the feature work.
