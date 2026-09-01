## Context

The authoritative design is `docs/superpowers/specs/2026-09-01-taxonomy-navigation-surfaces-design.md`; the task-by-task plan is `docs/superpowers/plans/2026-09-01-taxonomy-navigation-surfaces.md`. This records the decisions rather than restating them.

The foundation spec's §9 called C, D and E "separate changes … independent of one another." They are being built together at the product owner's explicit request. Reading the code makes that less reckless than it sounds: D is mostly built already — the foundation shipped the indented tree with per-department counts — and E is mostly repair, because the PDP breadcrumb exists and is broken. C is the only genuinely new surface. All three want the same shared breadcrumb and trail builder, which would otherwise be written three times.

## Goals / Non-Goals

**Goals:**
- The taxonomy is reachable from the header on every page, and from the mobile sheet
- The browse tree says how many products sit under each design and which one you are viewing
- One breadcrumb implementation, and the PDP's design crumb stops pointing at a URL nothing reads
- `Design.image` finally renders somewhere

**Non-Goals:**
- Search-page taxonomy filtering
- Admin UI for `tileName` / `note` / `subName`
- The three findings parked by the previous change (the footer's six-link cap, the un-hidden department eyebrow, the two-tile row)

## Decisions

**One panel under "Shop", not a nav item per department.** §9 says "per-department hover dropdowns", but the header already carries five items; four more crowds it and worsens with every department added. One panel shows the same information and scales. *Alternative considered:* a left-rail panel where hovering a department swaps the right side — richer, but the two-step hover is the fussiest thing to make keyboard-accessible, for no gain at four departments.

**Base UI's `navigation-menu` and `accordion`, not hand-rolled hover state.** Hover-only menus fail keyboard and touch outright. The primitive already handles hover intent, focus, Escape, outside-click and arrow keys, and it is already a dependency. *Alternative considered:* a `useState` dropdown — that is how menus become inaccessible.

**Navigation data is computed on the server and passed as props.** `app/_lib/taxonomy.ts` builds `getDepartments` with `unstable_cache` and imports Prisma at module scope; importing it from a Client Component is a build failure, not a size problem. The header reduces rows to plain `{label, href}` columns; the client leaf takes a type-only import. This also makes the derivation unit-testable without a DOM.

**The panel's links are plain `next/link` elements, not `NavigationMenu.Link`.** Base UI's `render` prop moves the rendered element into `props.render`, where this repo's element-tree tests cannot see the href. What is given up is close-on-click, which is moot when the click performs a full navigation.

**Two thresholds that deliberately disagree.** The desktop trigger degrades to a plain link below two qualifying departments; the mobile accordion renders from one. A one-column mega panel looks broken, whereas a single collapsible row is an ordinary list item — and the accordion is the only place the taxonomy reaches phones at all.

**The sub-category crumb is never a link and appears only with a design.** `subName` is a column on the department, not an addressable level. Showing it on a department's own page would also push that page's crumb into linking to itself.

**Over a photo, ink is light on a scrim; `inkFor` is untouched for tintless tiles.** Measured contrast against a tint says nothing once a photograph covers it. Two grounds, two rules, each honest about what it can measure.

**The card's department name comes from a relation on the existing read.** `cardSelect` can join design → department in the query it already runs. Threading `getDepartments()` into every card render would create a second source of truth for a name.

**No Playwright specs for the menu.** They cannot run on this dev box, and an unrun test is worse than none. Interaction behaviour is delegated to Base UI; what remains ours is which links the panel emits, which the element-tree pattern covers.

## Risks / Trade-offs

- **`SiteHeader` renders on every page and becomes async** → a mistake is site-wide rather than local. Mitigated by the read being the same cached call the footer already makes on every page, under the same key, and by the header's own composition being trivial once the derivation is a tested pure function.
- **Two widened types (`DesignSummary`, `ProductView`) ripple through fixtures** → `npx tsc --noEmit` is the gate that finds them; the plan says to fix the fixtures, not the type.
- **A `next/image` whose `src` comes from the database** → Next's image configuration may reject a host or path pattern that no unit test exercises. This is genuine build-time risk that cannot be checked here, and the plan requires saying so rather than implying full verification.
- **Client components cannot be exercised by the node test environment** → two pieces were deliberately shaped for testability: the mobile sheet's list is an exported presentational function, and the card's label is a pure helper beside `prettifyCategory`. The stateful shells stay untested and trivial.
- **Three surfaces in one change** → each is sequenced as its own reviewable task, and the shared foundation lands first so the three cannot drift apart.

## Migration Plan

None. No schema change, no migration, no environment variable, no backfill. Rollback is a revert.

## Open Questions

None. The three decisions that were open during brainstorming — the menu's shape, whether tiles show photos, and whether mobile gets the taxonomy — were settled with the product owner before the spec was written.
