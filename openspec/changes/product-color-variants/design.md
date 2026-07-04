## Context

The catalog currently stores one `Product` row per color, with color baked into the name; there is no color/variant concept anywhere in the schema or code. This change introduces a Shopify-style variant layer. The full technical design and a step-by-step, code-level implementation plan already exist and are the source of truth for details:

- Design spec: `docs/superpowers/specs/2026-07-04-product-color-variants-design.md`
- Implementation plan: `docs/superpowers/plans/2026-07-04-product-color-variants.md`

Key environment constraints (from the repo): **no local database** — `next build` prerender and `prisma migrate dev` fail locally, so the verification gate is `npx tsc --noEmit` + `npm run test` (Vitest); migrations are **hand-authored** and applied in the deploy pipeline. Framework is Next.js 16 App Router with Prisma/PostgreSQL (Neon), NextAuth v5, Vercel Blob uploads.

## Goals / Non-Goals

**Goals:**
- One product = one design with many color variants; one card and one canonical PDP per design.
- Two image sets per color (card slider vs. PDP gallery), real per-color-per-size stock, optional SKU + price override, `?color=` deep-linking.
- Variant-aware cart/checkout with per-cell stock decrement and order snapshot; per-color SEO (JSON-LD offers, Meta feed rows).
- Every phase leaves the tree green under `tsc + Vitest`.

**Non-Goals:**
- Color/size **facets** in search and category filtering (clean future add).
- Per-color wishlisting and per-color review filtering (reviews shared; wishlist per product).
- Non-color option axes (material, fit) — the model is color-only for now.
- Preserving existing catalog rows — the demo catalog is **reseeded from scratch**.

## Decisions

- **`ProductVariant` + `VariantImage` (role CARD|DETAIL) + `VariantSizeStock`, with a base price on `Product` and optional per-variant overrides.** Chosen over encoding colors in one denormalized `Product` (JSON columns) because normalized rows give clean per-color images, SKU uniqueness, and a real inventory grid that the checkout decrement can target atomically. Effective price = `variant.price ?? product.price`.
- **Real per-size stock counts per color** (a color × size grid), not an in/out toggle. Matches the requirement and lets checkout decrement the exact cell and block oversell; the trade-off is a new inventory subsystem replacing the single `Product.stock`.
- **Expand-contract migration.** Phase 1 adds the variant tables *additively* and keeps legacy `Product.image/stock/sizes` + `ProductImage` (seed-populated) so the tree keeps typechecking; middle phases migrate each read/write/UI path; a final contract phase drops the legacy columns/table. Chosen over a single breaking change because it yields small, independently-green phases without throwaway fallback code (no runtime app exists locally to need it).
- **Shared TS types migrate atomically with their consumers.** DB columns can expand-contract, but an app-level type cannot drop a field additively: `ProductDetail` reshapes with the PDP (Phase 4) and the list `ProductView` reshapes with the card + every list consumer (Phase 5), never split across a phase boundary.
- **`?color=<colorSlug>` in the URL, shared via shallow routing.** The PDP buy box and the (client) image gallery both read the `color` search param as the single source of truth; the buy box writes it. Chosen over pure React state so colors are shareable/indexable and drive per-color JSON-LD offers and the Meta feed `item_group_id`.
- **The product card becomes a client leaf** owning `selectedColorSlug` (it drives image, price, and cart target); swatches are a shared presentational `ColorSwatches` component reused by card and PDP.

## Risks / Trade-offs

- **[Cascade of a breaking schema change]** → Expand-contract keeps every phase green; legacy columns are dropped only in the final phase after all consumers migrate.
- **[No local DB to catch runtime errors]** → Gate is `tsc + Vitest`; pure logic (pricing, stock, cart-vs-inventory validation, feed mapping) is extracted into unit-tested modules (`variants.ts`, `order-validation.ts`, `meta-feed.ts`); the app flow is validated via Playwright only where a DB is available.
- **[Prisma `satisfies ProductSelect` may widen the nested `orderBy` literal]** → Documented fallback to `Prisma.validator<Prisma.ProductSelect>()` in the plan.
- **[Transient color-blind cart between Phases 4–6]** → Explicitly time-boxed and closed in Phase 6; phase order must be preserved.
- **[Price/stock filters operate on base price and variant grid]** → `minPrice/maxPrice` filter on base price (documented limitation); in-stock filter uses the variant grid.

## Migration Plan

- Two hand-authored migrations: additive `add_product_variants` (Phase 1) and `drop_legacy_product_columns` (final phase). Both re-runnable (`IF EXISTS`/`IF NOT EXISTS`), applied via the deploy pipeline (`.github/workflows/migrate.yml`), not locally.
- Reseed from scratch (`mock.ts`/`seed.ts`) with nested variants and per-variant image folders; no data-collapse migration since the current catalog is demo data.
- Rollback: revert the branch before the contract migration runs; the additive migration is backward-compatible (legacy columns still present).

## Open Questions

- None blocking. Generating real per-variant demo images (`public/products/<id>/<colorSlug>/card|detail/`) is out of scope for this change; the seed falls back to a demo SVG when absent.
