## Context

The client delivered a high-fidelity design handoff (`design_handoff_home_conversion_refresh/` in the Claude Design project `Ecom-app-v1 setup`, `d904cb16-b993-4d2e-ae78-3b58508384a5`) specifying seven changes to the storefront home page, plus a brand-color change sampled from a new logo. The handoff includes a working HTML prototype and states that colors, typography, spacing, copy and interactions are final.

The full design spec, including every measurement behind the decisions below, is `docs/superpowers/specs/2026-08-19-home-conversion-refresh-design.md`; the handoff is preserved verbatim beside it. The task-by-task implementation plan is `docs/superpowers/plans/2026-08-19-home-conversion-refresh.md`.

Constraints that shaped this design:

- **The project gates its own palette.** `scripts/check-contrast.ts` verifies every published token pair against WCAG AA and exits non-zero on failure. Two of its eight pairs involve `--brand`.
- **Vitest runs `environment: "node"` with `globals: false`, collecting only `app/**/__tests__/**/*.test.ts` and `app/**/*.test.ts`.** `.tsx` is never collected, so React components cannot be unit-tested in this repo.
- **CLAUDE.md forbids rendering an async Server Component inside a `"use client"` component.**
- **`NEXT_PUBLIC_*` env reads must stay literal**, because Next inlines them by exact textual match at build time.
- **`ProductCard` is shared by seven routes**, so anything added to it is visible far beyond the home page unless the data is scoped.

## Goals / Non-Goals

**Goals:**

- Recreate all seven handoff changes with the codebase's existing primitives, not pasted prototype markup.
- Ship a terracotta brand identity that passes the project's own accessibility gate.
- Derive every conversion signal shown to customers from real data.
- Keep the change confined to the home route, as the handoff specifies.
- Give the new logic real test coverage despite the node-only test environment.

**Non-Goals:**

- Replacing `public/logo.png` with the client's newer `uploads/Logo-01.png`.
- Touching `TrustStrip`, including its hardcoded "over Rs. 5,000" copy, which ignores the live `freeThreshold`. Real bug, pre-existing, separate change.
- Real category photography.
- A `Product.badge` column plus admin merchandising UI — the route to shipping `Trending`/`Almost gone` honestly, if the client asks for them later.
- Re-hueing `--chart-2` through `--chart-5`, which stay on the olive hue and will sit beside a terracotta `--chart-1` in admin charts.
- Any cart, checkout, payment, courier or admin behavior.

## Decisions

### 1. Brand token is `oklch(0.55 0.08 52)`, not the handoff's `#b27657`

The handoff names `#b27657` authoritative but explicitly forbids shipping without re-running the contrast check. Running the script's own OkLab → linear-sRGB → WCAG-luminance math:

| Candidate | Hex | brand on bg (≥4.5) | brand-fg on brand (≥4.5) |
|---|---|---|---|
| `oklch(0.62 0.075 55)` — handoff authoritative | `#aa7a5a` | 3.43 ❌ | 3.56 ❌ |
| `oklch(0.56 0.08 52)` — handoff fallback | `#9a6747` | 4.41 ❌ | 4.58 ✅ |
| `oklch(0.55 0.08 52)` — chosen | `#976445` | 4.59 ✅ | 4.77 ✅ |

The handoff anticipated a darkening but under-shot it. **Alternatives considered:** (a) ship `#b27657` and relax the gate — rejected, it puts sale prices at 3.43:1, below AA for body text, and weakening an accessibility gate to accommodate a color is the wrong direction; (b) split into `--brand` for decorative fills and a darker `--brand-strong` for text — rejected as machinery serving a 0.07-lightness difference, requiring an audit of every brand-as-text call site and a change to the check script's pair list.

### 2. Tile ink is chosen by measured contrast, not a luminance threshold

The handoff says "dark tiles → `#F1EDE4`, light tiles → `#3a332c`" computed from tile luminance. Implemented literally with a threshold at 0.5, that rule renders Dino (luminance 0.471) at **1.73:1** and Bear (0.328) at **2.38:1** — the two darkest tints get the light ink and become illegible. Dark ink in fact wins on all six tints.

`inkFor(bg)` therefore returns whichever of the two inks has the higher contrast. Same intent as the handoff, correct outcome, and it stays correct if the palette is edited later. The dark ink is darkened from `#3a332c` to `#332d26`, lifting the worst tint from 4.47 to 4.90 so all six clear AA — without altering any handoff tint.

The caption's "soft ink" is dropped: no softened ink clears 4.5:1 on Bear (`#6b6157` reaches 2.18), so it would have been the one illegible element on the page. The caption separates from the name by mono face, size, uppercase and tracking instead.

### 3. Card signals derive from real data, behind an opt-in flag

The handoff suggests populating `badge`/`lowStock` "from the product source / mock" and gives an example mapping with fixed stock counts. Shipping that would put fabricated scarcity — "Only 4 left" — in front of real customers.

Instead: `lowStock` sums fulfillable units for the default variant from the `plainStock`/`designStock` maps `attachAggregates` **already loads**, so it costs no extra query and no schema change. `badge` is `Bestseller` for the top products by paid `orderItem` quantity (`PAID` or `COD_COLLECTED`, matching how `checkoutPaymentState` already defines paid — counting `PENDING` would let an abandoned checkout mint a bestseller).

`Trending` has no measurable definition in this schema and `Almost gone` restates what the stock nudge already says in words; both are dropped.

Because `ProductCard` is shared by seven routes, the derivation sits behind a `withSignals` option on `attachAggregates`, defaulting false, passed only by `getFeaturedProducts` and `getDealsProducts`. Search and category listings pay nothing, and the handoff's "nothing else in the app changes" holds literally. **Alternative considered:** computing signals for all readers — rejected, it adds a `groupBy` to every product query to render something only two surfaces show.

### 4. Testable logic lives in pure `app/_lib` modules

Because Vitest cannot collect `.tsx` here, any logic left inside a component is untestable. Four pure modules carry it: `marquee.ts` (message assembly), `category-tint.ts` (tint/luminance/ink), `countdown.ts` (clock math), `product-signals.ts` (unit summing, threshold, bestseller ranking). Components become thin enough to verify by eye.

This also forced a small improvement to `free-delivery-note.ts`: it read the Koko env flag internally, making it untestable. The pure `…For(kokoEnabled)` forms are extracted and the existing zero-arg functions delegate, so the shared "excludes Koko & Mintpay" wording stays a single source while becoming testable.

`pickBestsellers` breaks ties by `productId` ascending so badges do not shuffle between cache windows.

### 5. The countdown is an isolated client island that defers its first value

`DealsSection` is an async server component; the countdown needs `setInterval`. The countdown is therefore its own `"use client"` component rendered as a child — never the inverse, per CLAUDE.md.

It renders a fixed `--:--:--` placeholder until `useEffect` runs. Computing `Date.now()` during render would make the server HTML and the first client render disagree and trip a hydration mismatch on every page load.

### 6. The social-proof strip does not repeat free shipping

The handoff's fourth item is free shipping, but the marquee and the existing `TrustStrip` both already carry it — three mentions on one page. That slot carries 7-day returns instead, so the strip adds a signal rather than echoing one. It consequently needs no props.

### 7. The stale `storefront-home` spec is corrected here

That spec requires a New Arrivals section which commit `0c02610` removed; no such code exists. Since this change modifies the same section-order requirement, correcting it here costs a few lines and avoids leaving a known-false requirement in `openspec/specs/`. **Alternative considered:** a separate reconciliation change first — cleaner history, but a full propose/apply/sync/archive cycle before any of the refresh gets built.

## Risks / Trade-offs

- **The brand token is global; every brand-colored surface shifts hue at once** — sale prices, sale badges, wishlist heart fill, focus rings, admin `--chart-1`. → Intended, and bounded by `npm run check:contrast` as a required gate. Visual review must cover the product and cart pages, not just the home page.
- **`--chart-2` through `--chart-5` stay olive beside a terracotta `--chart-1`** in admin charts. → Accepted cosmetic inconsistency, explicitly out of scope; noted so it is not "fixed" mid-task.
- **`Bestseller` renders nothing on a database with no paid orders**, including most local environments. → Correct behavior, not a bug. Called out in the plan's verification steps so it is not chased as a defect.
- **The marquee is continuous motion in the page's top chrome**, which some users find distracting. → Gated behind `motion-safe:`, so `prefers-reduced-motion` renders it static; the duplicated track is `aria-hidden` so screen readers hear the set once.
- **`npm run build` and `npm run test:e2e` need a reachable `DATABASE_URL`**, which `STUB_READINESS_STATUS.md` records as a repeated local blocker on this project. → If no Postgres is available they must be recorded as blocked-environmental and run in CI or against the VPS before merge — never marked passed.
- **Solid tiles are a downgrade in richness versus real photography.** → Deliberate: the current photos are near-identical, so the tiles carry no information today. The tint map is a stopgap the design spec explicitly allows reverting once real category imagery exists.

## Migration Plan

No data migration, no schema change, no new dependency. The change is deployed as ordinary application code through the existing `.github/workflows/deploy.yml` → `scripts/deploy.sh` flow.

Rollback is `git revert` of the merge commit: the two new `ProductView` fields are optional and unread by any other surface, and the brand token change is a pure CSS value. Nothing persists state that would survive a rollback.

## Open Questions

- Does the client want `uploads/Logo-01.png` to become the official `public/logo.png`? The brand color is sampled from it either way; replacing the asset is deliberately out of scope here.
- Are `Trending` and `Almost gone` wanted badly enough to justify a `Product.badge` column and admin merchandising UI? Only `Bestseller` ships now.
- Should the terracotta darkening propagate to the `--chart-2`…`--chart-5` ramp so admin charts stay hue-coherent? Out of scope here; worth a follow-up if the charts look wrong in practice.
