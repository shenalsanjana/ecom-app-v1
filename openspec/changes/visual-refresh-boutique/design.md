## Context

The storefront is a Next.js 16 app on Tailwind v4 with shadcn-derived primitives in `components/ui/` and surface components in `app/_components/`. `app/globals.css` carries the OKLCH token contract. Today's tokens are pure neutrals (chroma 0) — the default shadcn "no-decision" palette. Geist Sans is loaded for both body and headings. There's a `.dark { }` block plus a `prefers-color-scheme: dark` media query, but no surface has been visually validated in dark mode and the dark palette is also pure neutrals.

The brainstorming session (transcripts and mockups in `.superpowers/brainstorm/`) settled on:

- **Direction:** Boutique (warm cream + cocoa + olive) over Editorial (premium-cold) and Modern (DTC-generic).
- **Accent:** Olive `oklch(0.55 0.075 125)` over Blush (commits to a feminine register) and Terracotta (dominates every screen).
- **Type pairing:** Fraunces (variable, optical sizing) + Inter over Playfair + DM Sans (high-contrast price wear) and Cormorant + Manrope (illegible at small sizes).

Constraint baked in by the user: **no major page changes** — no restructure, no new pages, no new flows. This change is token-first, surfaces follow.

## Goals / Non-Goals

**Goals:**
- Establish a coherent warm/calm boutique identity across every customer-facing surface.
- Enforce a WCAG AA contrast floor on every committed token pair, automatically.
- Introduce a small, named set of subtle micro-interactions consistent with `prefers-reduced-motion`.
- Bundle adjacent a11y bug-fixes (heading hierarchy, missing aria labels, hit targets) — these would be invisible after the visual flip otherwise.
- No behavioral or layout regressions.
- Single atomic flip: tokens, primitives, and surfaces ship together so the site is never visually mid-refactor.

**Non-Goals:**
- No page restructuring, new pages, removed pages, or route changes.
- No layout / grid / breakpoint changes.
- No prop API changes on UI primitives (variant names + prop shapes preserved).
- No new dependencies. (Inter and Fraunces via `next/font/google` are not new packages.)
- No replacement dark-mode palette — dark mode is dropped, not redesigned.
- No screen-reader landmark restructuring (would require page changes).
- No axe-core CI integration, no skip-to-content link (separate, route-level changes).
- No animated illustrations, no brand-asset refresh.
- No carousel autoplay (none exist; not adding).
- No image zoom-on-hover, no scroll-linked animations, no page transitions.
- WhatsApp float button left as-is (brand green non-negotiable).

## Visual direction

- **Background:** warm cream `oklch(0.972 0.013 80)` (~#FAF7F2). All page surfaces, including header/footer.
- **Foreground (text + CTAs):** cocoa ink `oklch(0.235 0.018 60)` (~#3A2E22). Primary buttons are cocoa-on-cream, NOT olive — olive is an accent, not a CTA color.
- **Brand accent:** olive `oklch(0.55 0.075 125)` (~#7A8456) — exposed as `--brand` and `--brand-foreground` (NOT `--accent` — see "Brand vs hover token" decision). Used for: sale prices, sale badges, link hover underlines, focus rings, free-shipping qualified state, badge `brand` variant, button `brand` variant. ~5.1:1 contrast on cream for badge text, ~4.7:1 for sale prices — both AA.
- **Subtle hover (`--accent`):** warm muted-darker `oklch(0.90 0.014 75)` with cocoa `--accent-foreground`. Drives shadcn-derived hover/focus states (dropdown items, error-page CTA hovers, category pagination, search filters). NOT olive — see "Brand vs hover token" decision.
- **Muted / borders:** warm hairlines `oklch(0.89 0.014 75)` (~#E8E1D6) and warm subtle fills `oklch(0.93 0.012 75)`. Skeletons live here.
- **Destructive:** warmed red `oklch(0.52 0.18 28)` so it doesn't read as a foreign cool color in the warm palette.
- **Radius:** `--radius: 1rem` (was 0.625rem). Cards/dialogs read `radius-2xl` (~1.8rem). Buttons keep `radius-md` (~0.8rem). Add-to-cart and back-to CTAs use `rounded-full` explicitly — pills, by intent, not by token.
- **Shadow:** one warm shadow token `--shadow-card: 0 12px 32px -16px rgba(122, 80, 40, 0.18)` — applied on `:hover` only, never at rest. Cards stay calm.
- **Typography:** Fraunces (variable, `opsz` axis used) for product names, page headings, and prices via `--font-heading`. Inter for body and UI via `--font-sans`. Geist Mono kept for tabular numerals on cart totals.

## Decisions

### Brand vs hover token (`--brand` distinct from `--accent`)

The original brainstorm assigned olive to `--accent`, treating it as the brand color. Implementation surfaced a real conflict: `--accent` is shadcn's *subtle-hover* semantic, used by `dropdown-menu` item focus, error-page CTA hovers (`account/error.tsx`, `checkout/error.tsx`, `search/error.tsx`), category pagination buttons (`categories/page.tsx`, `deals/page.tsx`), and search-filter selected states (`search/page.tsx`). Setting `--accent` to olive turned every one of those interactions into a saturated olive flash — visually loud and inconsistent with "subtle micro-interactions".
**Decision:** split the two semantics.
- `--brand: oklch(0.55 0.075 125)` (olive) and `--brand-foreground: oklch(0.985 0.008 80)` (cream). New tokens, new utilities (`bg-brand`, `text-brand`, `text-brand-foreground`, `bg-brand/10`).
- `--accent: oklch(0.90 0.014 75)` (warm muted-darker) and `--accent-foreground: oklch(0.235 0.018 60)` (cocoa). Consumed by every existing `bg-accent` / `hover:bg-accent` / `focus:bg-accent` site (dropdown items, error CTAs, pagination, filters).
- `--ring: var(--brand)` — focus rings remain olive (intentional brand moment).
The `accent` variant on Button and Badge announced in the original spec is renamed to `brand`. Spec, tasks, and this design doc all reflect the renamed variant.
**Alternatives considered:** (a) keep `--accent` = olive and tone it down via `bg-accent/20` everywhere — rejected, brittle and obscures the brand at full saturation in the few places it should be loud (sale badges, filled wishlist heart). (b) Keep `--accent` = olive and re-class every `bg-accent`/`hover:bg-accent` site to `bg-muted`/`hover:bg-muted` — rejected, fights the convention without need.

### Single change, not split
Splitting tokens / primitives / surfaces / states into multiple changes would create stretches where tokens are new but consumers haven't picked them up — the site would look broken in mid-refactor. Token-first design only works as an atomic flip. **Decision:** one change, four commit groups (tokens, primitives, surfaces, states+a11y), ~15 tasks, ≤1.5k LOC of diff.
**Alternatives:** two changes (tokens+primitives | surfaces+states) or three changes (tokens | primitives | surfaces+states). Both create visible mid-refactor states. Rejected.

### Drop dark mode entirely instead of building a coherent dark palette
Boutique identity is warm/cream-led. A faithful dark variant would need its own palette engineering and visual QA — out of scope. The current `.dark { }` block is generic neutral and has never been visually validated against this design.
**Decision:** delete the `.dark { }` block and the `prefers-color-scheme: dark` media query in `globals.css`. Leave `dark:` Tailwind classes scattered through components in place — they become dead code, harmless without a `.dark` ancestor. A future dark-mode change can re-introduce both.
**Alternatives:** (a) build a warm dark variant (adds palette+QA cost, scope creep); (b) keep current generic dark and accept a mismatched dark experience (worst-of-both). Both rejected.

### `tsx` script for contrast audit, not vitest
Repo currently has no test runner installed (`devDependencies`: eslint, prisma, tsx, tailwindcss, typescript). Adding vitest just to verify color pairs would violate the project's "Never add a dependency without justifying it in `design.md`" rule.
**Decision:** `scripts/check-contrast.ts` — a one-shot Node script invoked via `tsx` (already a devDep). Imports oklch→sRGB conversion, computes relative luminance, checks AA thresholds (4.5:1 body, 3:1 large text and UI), prints pass/fail per pair, exits 1 on fail. Runs manually pre-commit; can be promoted to CI in a separate change.
**Alternatives:** vitest + a-color-test-package (rejected: dep cost); manual eyeballing (rejected: not durable, no merge gate).

### Override `tw-animate-css` keyframes locally in `dialog.tsx`, don't strip the package
Several other components (e.g., the cart drawer, future toast) reuse the package's `data-state` keyframes. Stripping it would force re-implementing those across the codebase.
**Decision:** keep the package, override the specific `data-[state=open]` and `data-[state=closed]` animations in `dialog.tsx` so the new `--duration-slow` and warm cocoa overlay take precedence. No package removal.
**Alternatives:** remove `tw-animate-css` and re-implement (rejected: unnecessary surface area).

### Fraunces variable axis-subset, not full file
Fraunces ships with `wght`, `opsz`, `SOFT`, and `WONK` axes. We use `opsz` (warm at display, neutral at small) and `wght` (400 / 500 / 700). The other axes are dead weight.
**Decision:** load via `next/font/google` with `variable: '--font-fraunces'`, `subsets: ['latin']`, `axes: ['opsz']` (`wght` is implicit), `display: 'swap'`. Net add ~30 KB gzipped.
**Alternatives:** Self-host the variable file with manual subsetting (more control, much more setup; rejected: not worth the operational cost for the saving).

### `--font-heading` exposed inside `@theme inline`
Tailwind v4's `@theme inline { }` block in `globals.css` only exposes tokens to utilities for the names declared inside it. Defining `--font-heading` in `:root` alone is invisible to the Tailwind class generator — `font-heading` utilities won't compile.
**Decision:** declare `--font-heading: var(--font-fraunces)` *inside* the `@theme inline` block (alongside the existing `--font-sans` and `--font-mono` declarations). Verified by checking that `font-heading` appears in the generated CSS during build.
**Alternatives:** apply Fraunces only via inline `style={{ fontFamily: 'var(--font-fraunces)' }}` (rejected: hostile to authoring, doesn't compose with responsive variants).

### Bundle real a11y bugs into the visual change, deliberately
Two confirmed accessibility bugs (missing star aria-label in `product/reviews-section.tsx`, ungrouped quantity-stepper buttons in `cart/cart-item.tsx`) live in files this change is already touching for typographic restyle. (A third claimed bug — `h2 → h4` jump in `home/category-strip.tsx` — was disproved during implementation: the file has no inner heading. Documented as N/A in tasks.md §3.5.) Splitting these into a separate "fixes" change would: (a) require a second visual-regression QA pass, (b) leave them invisible after the boutique flip ships.
**Decision:** include them, surface them in `proposal.md` as intentional, log them as their own line items in `tasks.md` so they're auditable rather than buried.
**Alternatives:** ship boutique first, file separate a11y change (rejected: doubles QA, leaks visible bugs).

## Risks / Trade-offs

- **Token flip breaks contrast somewhere unaudited** → `scripts/check-contrast.ts` runs against every committed token pair; failing pair exits 1, blocks merge. Zero tolerance.
- **Fraunces variable payload regresses LCP** → mitigated by `display: swap`, `subsets: ['latin']`, `axes: ['opsz']`. Verify Lighthouse mobile delta vs `develop` ≤ 2 points before declaring done.
- **Component variant changes break consumer pages we forgot to test** → variant names + prop shapes preserved on every primitive. Pre-merge: grep for `variant="default|outline|secondary|destructive|ghost|link|accent"` and visually smoke each surface.
- **`tw-animate-css` defaults fight motion tokens** → mitigated by local override in `dialog.tsx` (data-state keyframes take precedence over package defaults).
- **Dark-mode removal breaks downstream consumer** → only the `.dark { }` block and `prefers-color-scheme: dark` media query are deleted; `dark:` Tailwind classes in component files are left inert (no `.dark` ancestor → no effect). Low risk.
- **Hardcoded color classes outside the audit list** (e.g., `bg-zinc-200`, `text-gray-500`, `border-zinc-100`) survive the token flip and look out of place → grep-and-convert pass listed as task 12. Final pre-merge grep confirms zero stragglers in `app/`.
- **Scope creep during `/opsx:apply`** → explicit Goals/Non-Goals + the per-section out-of-scope blocks in this design are the contract. Deviation triggers back-to-brainstorming per the project's coding-discipline rule.
- **Implementation feel doesn't match brainstorm mockups** → `.superpowers/brainstorm/<session>/content/visual-direction.html`, `accent-color.html`, `typography.html` are the visual reference. If the implementation diverges in texture/feel, that's a per-component bug to fix, not a re-brainstorm.

## Migration Plan

This is a green-field visual change in an active customer surface. No data migration, no API migration. The migration is the merge.

1. Worktree at `../ecom-app-v1-visual-refresh-boutique/` (per project default).
2. Implement in commit-group order: tokens → primitives → surfaces → states+a11y. After each group, run typecheck + lint + the contrast script.
3. Pre-merge gate: full typecheck, full lint, contrast script green, manual smoke through (home → category → PDP → cart → checkout) in light mode + with `prefers-reduced-motion: reduce` toggled.
4. Lighthouse mobile run against the worktree's `next start` build; compare to `develop` baseline.
5. Merge to `develop` (NOT directly to `main` per hard-rules).
6. Rollback strategy: revert is a single squash of the four commit groups. Tokens-only revert is also possible (commit 1 → cream gone, but `dark:` classes remain inert and primitives still parse). Full revert restores Geist Sans + neutral grays.

## Open Questions

None. All decisions ratified during the brainstorm session — see `.superpowers/brainstorm/` for the visual artifacts and the conversation transcript.
