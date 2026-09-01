# Home Taxonomy Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home page read the Department → Design taxonomy: department cards under "Shop by category", and a new "Shop by design" grid grouped by department.

**Architecture:** `app/page.tsx` becomes an async Server Component that calls the already-cached `getDepartments()` exactly once and passes the result to two pure, synchronous presentational components. Both route their visibility through the derived rules the taxonomy foundation shipped but never called (`showsNavDropdown`, `showsInDesignSection`), and both build hrefs with `designPath` so the page stops emitting flat links that only resolve through a 308.

**Tech Stack:** Next.js 16 App Router, React Server Components, TypeScript, Tailwind v4, Vitest (node environment), Prisma/PostgreSQL behind `unstable_cache`.

**Spec:** `docs/superpowers/specs/2026-09-01-home-taxonomy-sections-design.md`

## Global Constraints

- **Tests are `.test.ts`, never `.tsx`.** `vitest.config.ts` sets `include: ["app/**/__tests__/**/*.test.ts", "app/**/*.test.ts"]` and `environment: "node"`. Test files therefore contain **no JSX**: call a component as a function and inspect the returned element tree.
- **A tree walk does not enter child components.** `<DesignGrid departments={x} />` appears in the parent's tree as an element whose `type` is the function and whose `props` are what was passed. Its markup is only visible if you call it directly. Assert hrefs in the component's own test; assert composition and ordering in the page's test.
- **Importing `@/app/_lib/taxonomy` pulls in Prisma and `next/cache`** (`getDepartments` is built with `unstable_cache` at module scope). Every test that imports it must mock both, exactly as `app/categories/__tests__/index-page.test.ts` does.
- **Ink is never chosen by a luminance threshold.** Always `inkFor(hex)`. `app/_lib/taxonomy-tint.ts` records that a 0.5 threshold sends `dino` (0.471) and `bear` (0.328) to light ink at 1.73:1 and 2.38:1.
- **Tints render from the database `hex` column**, never from the `DESIGN_TINTS` / `tintForSlug` code map. The map stays as the seed's source and the contrast gate's input.
- **Keep the real derived rules in tests.** Never re-mock `showsNavDropdown` or `showsInDesignSection` — the point is to prove the sections route through them rather than reimplement the conditions.
- Thresholds, verbatim from spec §5: department cards render at **≥2** linked departments; the design grid renders at **≥1** qualifying department.
- Commits follow Conventional Commits per `openspec/COMMIT_PROCESS.md`.

## Not in this plan

Spec §8 (the `storefront-home` and `storefront-taxonomy` delta specs) is **not**
a task here. Per `CLAUDE.md` §1 the OPSX artifacts — `proposal.md`, `design.md`,
`tasks.md` and the delta specs — are created by `/opsx:propose` before
implementation begins, and merged by `/opsx:sync` after it. Do not hand-write
delta specs while executing this plan.

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `app/_components/ui/tint-tile.tsx` | 1 | The tinted browse tile shared by both sections: href, label, optional sub-label, background `hex`, ink via `inkFor` |
| `app/_components/ui/__tests__/tint-tile.test.ts` | 1 | Tile props and ink selection |
| `app/_components/home/department-cards.tsx` | 2 | "Shop by category" — department tiles, filtered and thresholded |
| `app/_components/home/__tests__/department-cards.test.ts` | 2 | Filtering, threshold, hrefs, labels |
| `app/_components/home/design-grid.tsx` | 3 | "Shop by design" — one group per qualifying department, nested design links |
| `app/_components/home/__tests__/design-grid.test.ts` | 3 | Grouping, `subName` rule, threshold, nested hrefs, heading pair |
| `app/page.tsx` | 4 | Fetches `getDepartments()` once, composes the section order |
| `app/__tests__/home-page.test.ts` | 4 | Single fetch, shared array, section order |
| `app/_components/home/category-strip.tsx` | 4 | **Deleted** — superseded by `department-cards.tsx` |
| `app/_components/home/site-footer.tsx` | 5 | Category column links become nested paths |
| `app/_components/home/__tests__/site-footer.test.ts` | 5 | No flat design links anywhere in the footer |

---

### Task 1: The shared tint tile

**Files:**
- Create: `app/_components/ui/tint-tile.tsx`
- Create: `app/_components/ui/__tests__/tint-tile.test.ts`

**Interfaces:**
- Consumes: `inkFor`, `INK_DARK`, `INK_LIGHT` from `@/app/_lib/taxonomy-tint`; `cn` from `@/lib/utils`
- Produces: `TintTile({ href, label, subLabel?, hex, className? })` — a React element whose root is a `next/link` `Link`. Tasks 2 and 3 both render it.

- [ ] **Step 1: Write the failing test**

Create `app/_components/ui/__tests__/tint-tile.test.ts`. This component imports no Prisma and no `next/cache`, so it needs no mocks.

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_components/ui/__tests__/tint-tile.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_components/ui/tint-tile"`.

- [ ] **Step 3: Write the implementation**

Create `app/_components/ui/tint-tile.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";
import { inkFor } from "@/app/_lib/taxonomy-tint";

type TintTileProps = {
  href: string;
  label: string;
  subLabel?: string | null;
  hex: string;
  className?: string;
};

/** A tinted browse tile. Ink is chosen by measured contrast (`inkFor`), never by
 *  a luminance threshold — see the comment block in app/_lib/taxonomy-tint.ts. */
export function TintTile({ href, label, subLabel, hex, className }: TintTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-center",
        "transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
      style={{ backgroundColor: hex, color: inkFor(hex) }}
    >
      <span className="font-heading text-[28px] font-bold leading-tight">{label}</span>
      {subLabel && (
        <span className="font-mono text-[10px] uppercase tracking-[0.16em]">{subLabel}</span>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_components/ui/__tests__/tint-tile.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/_components/ui/tint-tile.tsx app/_components/ui/__tests__/tint-tile.test.ts
git commit -m "feat(home): add the shared tint tile for taxonomy browse sections"
```

---

### Task 2: Department cards

**Files:**
- Create: `app/_components/home/department-cards.tsx`
- Create: `app/_components/home/__tests__/department-cards.test.ts`

**Interfaces:**
- Consumes: `TintTile` from Task 1; `showsNavDropdown` and the `DepartmentView` type from `@/app/_lib/taxonomy`; `Section`, `SectionHeader` from `@/app/_components/ui/*`
- Produces: `DepartmentCards({ departments }: { departments: DepartmentView[] })` — synchronous, returns `null` below the threshold. Exports `MIN_DEPARTMENT_CARDS = 2`. Task 4 renders it.

- [ ] **Step 1: Write the failing test**

Create `app/_components/home/__tests__/department-cards.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

// `@/app/_lib/taxonomy` builds getDepartments with unstable_cache at module
// scope, so importing it for the real showsNavDropdown pulls in both of these.
vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { DepartmentCards, MIN_DEPARTMENT_CARDS } from "@/app/_components/home/department-cards";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }],
  ...over,
});

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

describe("DepartmentCards", () => {
  it("renders nothing when only one department has designs", () => {
    // Production today: the migration inserts four departments, the deploy
    // never seeds, and both shipped designs sit under `women`.
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "women" }),
        dept({ slug: "men", name: "Men", tileName: "Men", designs: [] }),
        dept({ slug: "plain", tileName: "Plain T-Shirts", subName: null, designs: [] }),
        dept({ slug: "accessories", tileName: "Accessories", subName: null, designs: [] }),
      ],
    });

    expect(tree).toBeNull();
  });

  it("renders once at least two departments have designs, omitting the empty ones", () => {
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "women" }),
        dept({ slug: "men", name: "Men", tileName: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
        dept({ slug: "plain", tileName: "Plain T-Shirts", subName: null, designs: [] }),
      ],
    });
    const hrefs = collectHrefs(tree);

    expect(hrefs).toEqual(["/categories/women", "/categories/men"]);
    expect(hrefs).not.toContain("/categories/plain");
  });

  it("labels a tile with tileName and note, and paints it with the row's hex", () => {
    // #123456 appears in neither DEPARTMENT_TINTS nor DESIGN_TINTS, so this
    // passes only if the tile reads the database column rather than
    // tintForSlug(). A real seeded value would not tell the two apart.
    const tree = DepartmentCards({
      departments: [
        dept({ slug: "plain", tileName: "Plain T-Shirts", note: "Unisex", hex: "#123456" }),
        dept({ slug: "women" }),
      ],
    });

    expect(collectProp(tree, "label")).toContain("Plain T-Shirts");
    expect(collectProp(tree, "subLabel")).toContain("Unisex");
    expect(collectProp(tree, "hex")).toContain("#123456");
  });

  it("states its threshold", () => {
    expect(MIN_DEPARTMENT_CARDS).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_components/home/__tests__/department-cards.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_components/home/department-cards"`.

- [ ] **Step 3: Write the implementation**

Create `app/_components/home/department-cards.tsx`:

```tsx
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { TintTile } from "@/app/_components/ui/tint-tile";
import { showsNavDropdown, type DepartmentView } from "@/app/_lib/taxonomy";

/** Below this many linked departments the four-up grid reads as a bug rather
 *  than a catalog, so the section renders nothing at all. Production ships four
 *  departments but designs under only one, and `scripts/deploy.sh` never seeds. */
export const MIN_DEPARTMENT_CARDS = 2;

export function DepartmentCards({ departments }: { departments: DepartmentView[] }) {
  // showsNavDropdown is the spec's derived rule: never link a department that
  // holds no designs, or the tile leads to an indexable "Nothing here yet." page.
  const linked = departments.filter(showsNavDropdown);
  if (linked.length < MIN_DEPARTMENT_CARDS) return null;

  return (
    <Section>
      <SectionHeader title="Shop by category" />
      <ul className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {linked.map((d) => (
          <li key={d.slug}>
            <TintTile
              href={`/categories/${d.slug}`}
              label={d.tileName}
              subLabel={d.note}
              hex={d.hex}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_components/home/__tests__/department-cards.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/department-cards.tsx app/_components/home/__tests__/department-cards.test.ts
git commit -m "feat(home): render departments in the Shop by category section"
```

---

### Task 3: The grouped design grid

**Files:**
- Create: `app/_components/home/design-grid.tsx`
- Create: `app/_components/home/__tests__/design-grid.test.ts`

**Interfaces:**
- Consumes: `TintTile` from Task 1; `showsInDesignSection`, `designPath` and the `DepartmentView` type from `@/app/_lib/taxonomy`; `Section`, `SectionHeader`, `Eyebrow`
- Produces: `DesignGrid({ departments }: { departments: DepartmentView[] })` — synchronous, returns `null` when no department qualifies. Exports `MIN_DESIGN_GROUPS = 1`. Task 4 renders it.

- [ ] **Step 1: Write the failing test**

Create `app/_components/home/__tests__/design-grid.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { DesignGrid, MIN_DESIGN_GROUPS } from "@/app/_components/home/design-grid";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }],
  ...over,
});

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

/** Collect the tag name of every intrinsic element in the tree, in order. */
function collectTags(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectTags(child, out);
    return out;
  }
  const type = (node as { type?: unknown }).type;
  if (typeof type === "string") out.push(type);
  const props = (node as { props?: Record<string, unknown> }).props;
  if (props) collectTags(props.children, out);
  return out;
}

describe("DesignGrid", () => {
  it("links designs by their nested path, never the flat one", () => {
    const hrefs = collectHrefs(
      DesignGrid({
        departments: [
          dept({
            slug: "women",
            designs: [
              { slug: "cat", name: "Cats", hex: "#EFC4C4" },
              { slug: "dino", name: "Dino", hex: "#BFD8C2" },
            ],
          }),
        ],
      }),
    );

    expect(hrefs).toEqual(["/categories/women/cat", "/categories/women/dino"]);
    expect(hrefs).not.toContain("/categories/cat");
  });

  it("excludes a department with no sub-category, however many designs it has", () => {
    // showsInDesignSection requires subName — Plain T-Shirts and Accessories
    // are excluded by design, not by oversight.
    const hrefs = collectHrefs(
      DesignGrid({
        departments: [
          dept({ slug: "women" }),
          dept({
            slug: "accessories", name: "Accessories", subName: null,
            designs: [
              { slug: "tote", name: "Tote", hex: "#C9B79A" },
              { slug: "cap", name: "Cap", hex: "#A59585" },
            ],
          }),
        ],
      }),
    );

    expect(hrefs).toEqual(["/categories/women/cat"]);
  });

  it("renders nothing when no department qualifies", () => {
    const tree = DesignGrid({
      departments: [
        dept({ slug: "plain", subName: null, designs: [{ slug: "tote", name: "Tote", hex: "#C9B79A" }] }),
        dept({ slug: "men", name: "Men", designs: [] }),
      ],
    });

    expect(tree).toBeNull();
  });

  it("names each group by department as well as sub-category", () => {
    // Men and Women both seed subName "Oversized Graphic T-Shirts", so the
    // department name is the only thing telling the two groups apart.
    const tree = DesignGrid({
      departments: [
        dept({ slug: "women", name: "Women" }),
        dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
      ],
    });
    const text = collectText(tree);

    expect(text).toContain("Women");
    expect(text).toContain("Men");
    expect(text.filter((t) => t === "Oversized Graphic T-Shirts")).toHaveLength(2);
  });

  it("keeps the heading hierarchy well-formed: one h2 for the section, h3 per group", () => {
    const tags = collectTags(
      DesignGrid({
        departments: [
          dept({ slug: "women" }),
          dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
        ],
      }),
    );

    expect(tags.filter((t) => t === "h3")).toHaveLength(2);
    expect(tags).not.toContain("h2"); // the section's h2 comes from SectionHeader
  });

  it("states its threshold", () => {
    expect(MIN_DESIGN_GROUPS).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_components/home/__tests__/design-grid.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_components/home/design-grid"`.

- [ ] **Step 3: Write the implementation**

Create `app/_components/home/design-grid.tsx`:

```tsx
import { Eyebrow } from "@/app/_components/ui/eyebrow";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";
import { TintTile } from "@/app/_components/ui/tint-tile";
import { designPath, showsInDesignSection, type DepartmentView } from "@/app/_lib/taxonomy";

/** One qualifying department is enough: production has exactly one, and a
 *  single named group still reads as a catalog rather than as a broken grid. */
export const MIN_DESIGN_GROUPS = 1;

export function DesignGrid({ departments }: { departments: DepartmentView[] }) {
  // showsInDesignSection is `subName !== null && designs.length > 0` — the
  // departments with no sub-category are excluded deliberately.
  const groups = departments.filter(showsInDesignSection);
  if (groups.length < MIN_DESIGN_GROUPS) return null;

  return (
    <Section>
      <SectionHeader title="Shop by design" />
      <div className="space-y-12">
        {groups.map((d) => (
          <div key={d.slug}>
            {/* Men and Women share a subName, so the department name is what
                identifies a group. The two always render as a pair. */}
            <Eyebrow className="mb-1">{d.name}</Eyebrow>
            <h3 className="font-heading text-xl font-semibold tracking-tight">{d.subName}</h3>
            <ul className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {d.designs.map((design) => (
                <li key={design.slug}>
                  <TintTile
                    href={designPath(d.slug, design.slug)}
                    label={design.name}
                    hex={design.hex}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_components/home/__tests__/design-grid.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add app/_components/home/design-grid.tsx app/_components/home/__tests__/design-grid.test.ts
git commit -m "feat(home): add the Shop by design grid grouped by department"
```

---

### Task 4: Wire the home page and retire the old strip

**Files:**
- Modify: `app/page.tsx`
- Delete: `app/_components/home/category-strip.tsx`
- Create: `app/__tests__/home-page.test.ts`

**Interfaces:**
- Consumes: `DepartmentCards` (Task 2), `DesignGrid` (Task 3), `getDepartments` from `@/app/_lib/taxonomy`
- Produces: nothing downstream — this is the composition point.

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/home-page.test.ts`. A tree walk does not enter child components, so this test asserts **composition** — which components appear, in what order, with what props — and leaves href assertions to Tasks 2 and 3.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

const { getDepartments } = vi.hoisted(() => ({ getDepartments: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/app/_lib/taxonomy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_lib/taxonomy")>()),
  getDepartments,
}));

// The other sections hit the database or render client components; this test is
// about composition, so they are stubbed to identity-only placeholders.
vi.mock("@/app/_components/home/hero", () => ({ Hero: () => null }));
vi.mock("@/app/_components/home/social-proof", () => ({ SocialProof: () => null }));
vi.mock("@/app/_components/home/product-grid", () => ({ ProductGrid: () => null }));
vi.mock("@/app/_components/home/deals-section", () => ({ DealsSection: () => null }));
vi.mock("@/app/_components/home/trust-strip", () => ({ TrustStrip: () => null }));
vi.mock("@/app/_components/home/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/app/_components/home/site-footer", () => ({ SiteFooter: () => null }));

import Home from "../page";
import { DepartmentCards } from "@/app/_components/home/department-cards";
import { DesignGrid } from "@/app/_components/home/design-grid";
import { ProductGrid } from "@/app/_components/home/product-grid";
import { DealsSection } from "@/app/_components/home/deals-section";

const departments: DepartmentView[] = [
  {
    slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
    note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
    sortOrder: 1, designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }],
  },
];

/** Every element in the tree, depth-first, in render order. */
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

beforeEach(() => {
  getDepartments.mockReset().mockResolvedValue(departments);
});

describe("home page", () => {
  it("reads the taxonomy once and hands the same rows to both sections", async () => {
    const elements = collectElements(await Home());

    expect(getDepartments).toHaveBeenCalledTimes(1);

    const cards = elements.find((e) => e.type === DepartmentCards);
    const grid = elements.find((e) => e.type === DesignGrid);
    expect(cards?.props.departments).toBe(departments);
    expect(grid?.props.departments).toBe(departments);
  });

  it("places the taxonomy sections between Featured products and Deals", async () => {
    const types = collectElements(await Home()).map((e) => e.type);

    const featured = types.indexOf(ProductGrid);
    const cards = types.indexOf(DepartmentCards);
    const grid = types.indexOf(DesignGrid);
    const deals = types.indexOf(DealsSection);

    expect(featured).toBeGreaterThanOrEqual(0);
    expect(cards).toBeGreaterThan(featured);
    expect(grid).toBe(cards + 1);
    expect(deals).toBeGreaterThan(grid);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/__tests__/home-page.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_components/home/department-cards"` is already fixed by Task 2, so the failure is on the assertions: `getDepartments` is never called and neither section appears in the tree.

- [ ] **Step 3: Rewrite `app/page.tsx`**

Replace the whole file:

```tsx
import { DealsSection } from "@/app/_components/home/deals-section";
import { DepartmentCards } from "@/app/_components/home/department-cards";
import { DesignGrid } from "@/app/_components/home/design-grid";
import { Hero } from "@/app/_components/home/hero";
import { ProductGrid } from "@/app/_components/home/product-grid";
import { SocialProof } from "@/app/_components/home/social-proof";
import { TrustStrip } from "@/app/_components/home/trust-strip";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { SiteHeader } from "@/app/_components/home/site-header";
import { getDepartments } from "@/app/_lib/taxonomy";

export const revalidate = 300;

export default async function Home() {
  // One cached read, shared by both taxonomy sections.
  const departments = await getDepartments();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <SocialProof />
        <ProductGrid />
        <DepartmentCards departments={departments} />
        <DesignGrid departments={departments} />
        <DealsSection />
        <TrustStrip />
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 4: Delete the superseded strip**

```bash
git rm app/_components/home/category-strip.tsx
```

Then confirm nothing still imports it:

```bash
grep -rn "category-strip\|CategoryStrip" app --include=*.ts --include=*.tsx
```
Expected: no output.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run app/__tests__/home-page.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/__tests__/home-page.test.ts
git commit -m "feat(home): compose the taxonomy sections from one departments read"
```

---

### Task 5: Fix the footer's flat category links

**Files:**
- Modify: `app/_components/home/site-footer.tsx:60-64`
- Create: `app/_components/home/__tests__/site-footer.test.ts`

**Interfaces:**
- Consumes: `getDepartments`, `designPath` from `@/app/_lib/taxonomy`
- Produces: nothing downstream.

The footer renders on every page and currently builds six `/categories/{slug}` links from `getDesigns()`, each of which now 308s. `getDesigns` has no department, so the fix is to read departments and flatten.

- [ ] **Step 1: Write the failing test**

Create `app/_components/home/__tests__/site-footer.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DepartmentView } from "@/app/_lib/taxonomy";

const { getDepartments } = vi.hoisted(() => ({ getDepartments: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/app/_lib/taxonomy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_lib/taxonomy")>()),
  getDepartments,
}));

import { SiteFooter } from "@/app/_components/home/site-footer";

const dept = (over: Partial<DepartmentView>): DepartmentView => ({
  slug: "women", name: "Women", navLabel: "Women", tileName: "Women",
  note: null, subName: "Oversized Graphic T-Shirts", hex: "#EFC4C4",
  sortOrder: 1, designs: [],
  ...over,
});

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

beforeEach(() => getDepartments.mockReset());

describe("SiteFooter category links", () => {
  it("links designs by their nested path", async () => {
    getDepartments.mockResolvedValue([
      dept({ slug: "women", designs: [{ slug: "cat", name: "Cats", hex: "#EFC4C4" }] }),
      dept({ slug: "men", name: "Men", designs: [{ slug: "car", name: "Car", hex: "#AEC3D1" }] }),
    ]);

    const hrefs = collectHrefs(await SiteFooter());

    expect(hrefs).toContain("/categories/women/cat");
    expect(hrefs).toContain("/categories/men/car");
    expect(hrefs).not.toContain("/categories/cat");
    expect(hrefs).not.toContain("/categories/car");
  });

  it("caps the column at six links and skips empty departments", async () => {
    getDepartments.mockResolvedValue([
      dept({
        slug: "women",
        designs: Array.from({ length: 8 }, (_, i) => ({
          slug: `d${i}`, name: `Design ${i}`, hex: "#EFC4C4",
        })),
      }),
      dept({ slug: "men", name: "Men", designs: [] }),
    ]);

    const hrefs = collectHrefs(await SiteFooter());
    const designLinks = hrefs.filter((h) => h.startsWith("/categories/women/"));

    expect(designLinks).toHaveLength(6);
    expect(hrefs).not.toContain("/categories/men");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/_components/home/__tests__/site-footer.test.ts`
Expected: FAIL — the footer still calls the unmocked `getDesigns`, so the first assertion finds no `/categories/women/cat`.

- [ ] **Step 3: Rewrite the footer's link construction**

In `app/_components/home/site-footer.tsx`, change the import:

```tsx
import { designPath, getDepartments } from "@/app/_lib/taxonomy";
```

(drop `import { getDesigns } from "@/app/_lib/products";` — it is no longer used here; `app/search/page.tsx` still uses it, so leave the read itself in place.)

Then replace the body's first two statements:

```tsx
export async function SiteFooter() {
  const departments = await getDepartments();
  // Flatten in taxonomy order. Departments holding no designs contribute
  // nothing, so no empty department is ever linked from the footer.
  const categoryLinks: LinkItem[] = departments
    .flatMap((d) =>
      d.designs.map((design) => ({
        label: design.name,
        href: designPath(d.slug, design.slug),
      })),
    )
    .slice(0, 6);
```

The rest of the component — the `columns` array and the returned markup — is unchanged. The column heading stays "Categories"; renaming user-facing copy is out of scope.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/_components/home/__tests__/site-footer.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify no flat design links remain anywhere**

```bash
grep -rn 'categories/\${' app --include=*.tsx
```
Expected: only `/categories/${d.slug}` forms (department roots, which are canonical). No `/categories/${c.slug}` built from a design.

- [ ] **Step 6: Commit**

```bash
git add app/_components/home/site-footer.tsx app/_components/home/__tests__/site-footer.test.ts
git commit -m "fix(home): link footer categories by their nested taxonomy path"
```

---

### Task 6: Full validation

**Files:** none — verification only.

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test`
Expected: PASS. The baseline before this plan is 849 tests across 101 files; this plan adds 17 tests across 5 files, so expect **866 across 106**. Any pre-existing failure is a stop-and-investigate, not a rebaseline.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 3: Contrast gate**

Run: `npm run check:contrast`
Expected: `All pairs and tints meet WCAG AA.` — 35 checks. This change renders tints from the database rather than the code map, but the seed writes the same values, so the gate's input is unchanged.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no **new** findings. There are 4 pre-existing errors and 1 warning in `order-items-editor.tsx`, `product-picker.tsx`, `buy-box-client.tsx`, `image-gallery.tsx` and `sms.ts`, none of which this plan touches.

- [ ] **Step 5: Record what cannot run here**

`npm run build` and `npm run test:e2e` **cannot run on this dev box** — `DATABASE_URL` points at the docker-compose host `postgres`, which does not resolve, so build-time prerender and Playwright both fail on connection, not on this change. Do not report them as passing. State in the final summary that both are owed a green run in CI or against the VPS, exactly as `openspec/archive/2026-08-30-storefront-taxonomy-foundation.md` records for the foundation.

- [ ] **Step 6: Commit any incidental fixes**

If steps 1–4 surfaced anything, fix it and commit separately with a `fix(...)` message so the review can see it apart from the feature work.
