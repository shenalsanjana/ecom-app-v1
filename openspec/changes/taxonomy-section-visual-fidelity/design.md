## Context

The authoritative design is `docs/superpowers/specs/2026-09-01-taxonomy-section-visual-fidelity-design.md`; the task-by-task plan is `docs/superpowers/plans/2026-09-01-taxonomy-section-visual-fidelity.md`. This records the decisions rather than restating them.

The prototype this implements is the root revision of `Dressing Bear Storefront.dc.html` in Claude Design project `d904cb16`. It is a *newer* revision than the one `taxonomy-navigation-surfaces` was built from, and the change between the two revisions is almost entirely what that change already shipped. What is left is presentational, plus one read — which is why this change is much smaller than "implement the prototype" sounds.

Two constraints from the codebase shaped this more than the prototype did. The Vitest run is `environment: "node"` and matches only `*.test.ts`, so there is no DOM and no way to render a component that calls hooks — `mega-menu.tsx` is `"use client"` with no hooks for exactly this reason. And `getDepartments()` is read by the footer on every page, so it is not a free place to add data.

## Goals / Non-Goals

**Goals:**
- The two home taxonomy sections stop looking like the same tile twice
- A department card previews the designs inside it; a design tile previews its products
- Both carry real counts rather than none
- The caption's contrast guarantee is measured and enforced, not assumed from the prototype
- `TintTile` goes away rather than growing a third shape

**Non-Goals:**
- The prototype's other six screens
- Any schema change, or any change to `getDepartments()`
- Rebuilding the deltas that already shipped (PDP breadcrumb, card sub-labels, photo-on-tile) — they are verified, not touched

## Decisions

**A shared `SlideShow` with two server shells, not one component with a `variant` prop.** Below the media area the two treatments share no markup at all: a department is a card with a body underneath, a design is a bare tile with a caption inside. A variant prop would be two components in a trenchcoat, and would push both shells client-side for state that belongs only to the media area. *Alternative considered:* two fully independent components — simplest per file, but the cross-fade, clock subscription and dot logic get written twice and drift.

**All rotation logic lives in a pure module; the island is wiring.** The harness cannot render hooks, so anything inside the component is untestable by construction. `app/_lib/slide-rotation.ts` holds the index arithmetic, the single-slide short-circuit and the dot naming, and is tested exhaustively; `SlideShow` is covered only by the props its consumers hand it. This is the split `app/_lib/countdown.ts` and `deals-countdown.tsx` already use. *Alternative considered:* adding jsdom and Testing Library — a real option, but it changes the testing strategy of the whole repo to serve one component, and the previous change explicitly declined to add test infrastructure that would not run here.

**One clock in a provider, not a timer per tile.** The prototype advances every tile off a single 3800ms interval, so they cross-fade together. N tiles with N intervals drift apart visibly within a minute and cost N timers. The tick starts at zero and advances only after mount, so the server's markup and the first paint agree. *Alternative considered:* a timer per tile with a shared start time — still N timers, and still drifts under load.

**Reduced motion is read with `matchMedia`, not a `motion-safe:` class.** A CSS class cannot stop a `setInterval` from running; it can only hide the result. The hover transforms stay on the class convention, because those genuinely are CSS.

**A manual choice pins the tile permanently.** Advancing a slide the visitor has just selected takes the page back off them, and it is also what makes the dots meaningful rather than decorative. Pinned positions are clamped, so a stale pin cannot resolve past the end of a shorter list.

**The design tile's slides come from a separate cached read.** Product photos are three levels down (`Product → ProductVariant → VariantImage`), and `getDepartments()` is read by the footer on every page. Nesting that into the shared read would charge ~20 routes for data only the home page uses. A separate key, read concurrently, tagged `"catalog"` so the existing `revalidateTag("catalog", "max")` already busts it. *Alternative considered:* widening `getDepartments()` — one fewer query on home, at the cost of a deeper query everywhere else.

**One query serves both the slides and the counts.** The row set *is* the non-archived products, so counting rows per design gives the caption and the first four urls give the slides. *Alternative considered:* a separate `groupBy` for counts — a second query answering a question the first already answers.

**The caption's gradient is three-stop, and its floor is measured rather than taken from the prototype.** This is the one place the prototype is not followed literally. A plain `to top` fade from 0.8 across a ~66px caption reaches only ≈0.32 where the name's ascender sits — about 2.8:1 against white on the lightest tint — and no bottom stop at or below 1.0 fixes it. A three-stop gradient holds the floor across the whole text band and fades only above it. The floor is set by the contrast test, not by eye. *Alternative considered:* keeping the flat full-tile scrim — safe, but it darkens the whole tile, which is precisely the muddiness the new design removes.

**The sub-category becomes the section eyebrow and the department name the group heading.** `subName` is shared by Men and Women, so it identifies the section, not the group. The current arrangement produces two identical `h3`s, which is why `design-grid.tsx` carries an `sr-only` disambiguator; swapping the two dissolves the problem rather than patching it.

**The prototype's `.reverse()` on design groups is not ported**, and neither is its `N products` fallback for a department note. The reverse reads as incidental to the prototype's hardcoded fixtures, and `sortOrder` is the repo's declared ordering. The fallback is unreachable: the section only renders departments passing `showsNavDropdown`, so the design count always wins.

## Risks / Trade-offs

**The caption's contrast floor may have to rise past what looks right** → The test is the authority and the value is a named constant, so raising it is a one-line change with a measured justification. If it must go far above 0.68 the caption reads heavier than the prototype intends; that is a product call, and it is flagged rather than absorbed.

**Two client components cannot be unit-tested at all** → Their logic is pure and tested separately, and their consumers assert on the props handed to them — the same coverage `TintTile` had. What is genuinely untested is the hook wiring itself: roughly fifteen lines, reviewed rather than tested.

**The rotation is the home page's second piece of client state, and hydration is the failure mode** → The tick starts at zero and the interval starts in an effect, so server and first paint agree by construction. This mirrors `DealsCountdown`, which solves the same problem with a placeholder.

**The new read is unbounded in rows** → One row per non-archived product, two columns wide, cached an hour. Fine at the current catalog size; if the catalog grows by an order of magnitude this wants a per-design `take`, which Prisma cannot express without raw SQL. Noted rather than pre-solved.

**Removing `SCRIM_ALPHA` removes a documented guarantee** → It is removed only if `TintTile` was its sole consumer, which the plan checks explicitly. Leaving behind a documented promise nothing enforces is worse than deleting it.

## Migration Plan

No schema change, no migration, no data backfill. The change is additive on the read side and can be reverted by reverting the commits: `TintTile` and its test come back with them, and no persisted state will have changed.

## Open Questions

- The exact value of the caption gradient's alpha floor. Task 1 measures it; `0.68` is the expected answer and the tests are the authority.
- Whether `SCRIM_ALPHA` survives. It depends entirely on whether anything outside `TintTile` reads it, which Task 8 checks rather than assumes.
