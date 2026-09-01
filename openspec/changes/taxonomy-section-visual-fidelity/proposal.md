## Why

The storefront prototype was revised after `taxonomy-navigation-surfaces` shipped. Diffing the new revision against the one that change was built from, its substance — department nav, department cards, "Shop by design", breadcrumbs, photo-backed cards — is already built. What did not land is the *visual treatment* of the two home taxonomy sections, which the implementation collapsed into a single shared `TintTile`.

Both sections consequently read as the same tile twice: a flat colour square with a centred word. The prototype distinguishes them — a department is a card with a body, a design is a photograph with a caption — and gives each a rotating view of what is actually inside it. That difference is the whole point of the section split, and today it is invisible.

## What Changes

- **A department is a card, not a tile.** The label moves out of the coloured square and into a card body beneath it: name, a mono caption, and a brand arrow. The square above becomes a 1:1 media area.
- **A department card previews its designs.** It cross-fades through one slide per design it contains, each carrying that design's photo, tint and name. This is a re-projection of rows the page already reads — no new query.
- **A design tile previews its products.** It cross-fades through up to four CARD photos of the products under that design, falling back to the design's own image, then to a tint-only slide carrying its name.
- **Tiles carry real counts.** A department card reads `N designs`; a design tile's caption reads `N products`, from a count of non-archived products.
- **Slides rotate off one clock**, every tile in sync, at the prototype's 3.8s. Under `prefers-reduced-motion` the timer never starts and the dots remain the way through.
- **A design tile's caption sits over a gradient**, replacing the flat full-tile scrim. **BREAKING for the contrast guarantee**: the flat scrim's promise held everywhere; a gradient's holds only where the text sits, and measurement shows a plain two-stop fade reaches barely 2.8:1 against white on the lightest tint. The caption therefore uses a three-stop gradient with a measured alpha floor.
- **The sub-category moves to the section eyebrow.** `Oversized Graphic T-Shirts` is shared by Men and Women, so it names the section; the department name names each group. This retires the `sr-only` disambiguator two identical group headings currently need.
- **`TintTile` is removed.** Both of its consumers gain purpose-built shells, leaving nothing for it to serve.

## Capabilities

### New Capabilities

- `taxonomy-tile-slides`: how a taxonomy tile rotates through more than one image — the shared clock, the reduced-motion rule, pinning on a manual choice, the single-slide short-circuit, and how a dot is named when its slide has no label of its own.

### Modified Capabilities

- `storefront-taxonomy`: the tile-photo requirement widens from one stored `Design.image` to an ordered set of product photos with a documented fallback chain; and the scrim rule gains a second form, since a caption pinned to the bottom of a tile is governed by a gradient floor rather than the flat full-tile scrim.
- `storefront-home`: the single-taxonomy-read requirement gains a second, home-only read for design media, which must not be folded into the shared taxonomy read; both sections remain pure of data access.

## Impact

**Code**
- `app/_lib/slide-rotation.ts`, `app/_lib/taxonomy-media.ts` — new, both pure apart from one cached query
- `app/_components/ui/slide-clock.tsx`, `app/_components/ui/slide-show.tsx` — new client components
- `app/_components/home/department-card.tsx`, `app/_components/home/design-tile.tsx` — new server shells
- `app/_components/ui/tint-tile.tsx` and its test — deleted
- `app/_components/home/department-cards.tsx`, `app/_components/home/design-grid.tsx` — rewritten around the new shells
- `app/_lib/taxonomy-tint.ts` — `compositeOverBlack` generalises to `compositeOver`; gains the caption gradient's constants. `SCRIM_ALPHA` is removed if `TintTile` was its only consumer
- `app/page.tsx` — reads design media alongside the departments, in parallel

**Data** — no schema change and no migration. One new read, on the home route only: non-archived products, two columns wide, covered by the existing `VariantImage @@index([variantId, role, sortOrder])`. Cached an hour under `["catalog", "products"]`, which the admin actions' `revalidateTag("catalog", "max")` already busts.

**Risk**
- The caption's contrast floor is the live risk. Measurement, not the prototype, sets it; if it must rise far above 0.68 the caption reads heavier than designed, and that is a product call rather than an implementation one.
- The rotation is the home page's second piece of client state. The tick starts at zero and advances only after mount, so a hydration mismatch is the failure mode to watch.
- `app/page.tsx` gains a second `await`; the two reads run in parallel, so a mistake here shows up as a serialised home render rather than an error.
- The Vitest run is node-only, so the two client components cannot be unit-tested at all. Their logic is therefore pure and tested separately, and the components themselves are covered only by the props their consumers hand them.

**Out of scope** — the prototype's other six screens (Browse, Product, Cart, Checkout, Confirmation, Account); any schema change; and any change to `getDepartments()` or the ~20 routes that read it through the footer.
