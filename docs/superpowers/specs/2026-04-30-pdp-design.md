# Product Detail Page — Design

**Date:** 2026-04-30
**Status:** Approved for implementation planning
**Branch:** `develop`
**Scope:** A `/products/[id]` route that renders a real product detail page with a multi-image gallery, markdown description, stock indicator, read-only paginated reviews, and a "you might also like" strip. Backed by schema additions to `Product` plus two new tables (`ProductImage`, `Review`).

This is the next spec after [Account, Auth, and Wishlist](./2026-04-29-account-auth-design.md). Cart, checkout, and orders are deferred to later specs.

## Goal

Today, every product card in the storefront is a dead end — clicking it goes nowhere. This spec lands the page a shopper reaches when they click a card. The PDP shows enough detail (gallery, description, stock, reviews, related items) to feel like a real e-commerce product page without committing to a cart/checkout subsystem yet. The "Add to cart" button exists but stays a no-op until the cart spec lands.

The schema gains the fields a real PDP needs (multiple images, markdown body, stock count, reviews) so that future cart/order work can build on a realistic data model rather than retrofitting columns later.

## Out of scope for v1

- Review submission (read-only only — reviews come from the seed)
- Variants (size, color, SKU)
- Admin moderation of reviews
- Real cart wiring — `Add to cart` renders styled but does nothing
- Stock decrement on purchase
- Recently-viewed history
- Real payment, real orders

## Stack additions

On top of the existing stack (Next 16.2.4, React 19, Tailwind v4, shadcn/ui, Prisma + SQLite, Auth.js v5):

- **`react-markdown`** — renders the product `description` field. Server-rendered, no plugins, no `rehype-raw` (no raw HTML allowed). ~30KB gzipped.
- **`picsum.photos` allowlisted** in `next.config.ts` under `images.remotePatterns` so seed images render through `next/image`.

No other new runtime dependencies. No test framework — matches the existing project convention (manual walkthrough only).

## Data model

Three changes to `prisma/schema.prisma`, applied as a single migration `add_pdp_fields_and_relations`.

### `Product` (modified)

```prisma
model Product {
  id            String   @id
  name          String
  price         Float
  originalPrice Float?
  image         String         // KEPT — used as card thumbnail and OG image
  description   String         // NEW — markdown body
  stock         Int      @default(0)   // NEW
  categorySlug  String

  category      Category       @relation(fields: [categorySlug], references: [slug])
  wishlistItems WishlistItem[]
  images        ProductImage[]   // NEW
  reviews       Review[]         // NEW

  @@index([categorySlug])
}
```

**Removed:** `rating: Float` and `reviewCount: Int`. Aggregates are now computed from the `Review` relation. The denormalized fields are dropped in the same migration.

**Kept:** `image` is intentionally retained alongside the new `images` relation. It serves as the canonical thumbnail (used by `ProductCard`, the OG/social card, and the related-products strip) so callers don't have to also fetch from `ProductImage` for a single thumbnail.

### `ProductImage` (new)

```prisma
model ProductImage {
  id        String  @id @default(cuid())
  productId String
  url       String
  sortOrder Int     @default(0)

  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, sortOrder])
}
```

Used by the PDP gallery only. Cards continue to use `Product.image`.

### `Review` (new)

```prisma
model Review {
  id          String   @id @default(cuid())
  productId   String
  authorName  String   // seeded names — reviews are not tied to real users in v1
  rating      Int      // 1–5
  title       String?
  body        String
  createdAt   DateTime @default(now())

  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, createdAt])
}
```

`authorName` is a free-text string in v1 because reviews come from the seed, not real users. When review submission lands later, the model gains a nullable `userId` and `authorName` becomes a denormalized snapshot of the user's name at submit time.

## Seed updates (`prisma/seed.ts`)

For each of the 12 existing products:

1. Insert 4 `ProductImage` rows with URLs of the form `https://picsum.photos/seed/{productId}-{n}/800/800` (deterministic by seed, no API key required, stable across reseeds).
2. Insert 5–10 `Review` rows with:
   - `rating` chosen from a small fixed list (skewed toward 4–5)
   - `authorName` from a fixed list of 12 names
   - `title` from a fixed list (some null)
   - `body` from a fixed list of short blurbs
   - `createdAt` spread across the last ~90 days
3. Set `stock` to a stable per-product value: most products in the 5–25 range, **one product set to `stock = 0`** to exercise the out-of-stock UI, **one product set to `stock = 3`** to exercise the low-stock UI.
4. Set `description` to a markdown template that includes a paragraph + a short heading + a bullet list. Templates can be product-name-aware (e.g., headphones get a paragraph about sound quality) without becoming hand-written copy.
5. **Update `Product.image`** to a stable picsum URL (`https://picsum.photos/seed/{productId}/600/600`) so product cards across the site show the same realistic photo style as the PDP gallery's first image. Without this, cards still show the placeholder SVGs while the PDP shows real photos — a jarring inconsistency. The `ProductImage` rows for the same product use seeds `{productId}-1` through `{productId}-4`; the card-thumbnail seed `{productId}` is a fifth distinct image.

## Routes

### `/products/[id]` (new)

```
app/products/[id]/page.tsx
```

Server component, async, fully SSR. URL params:

- `id` (path): product id (e.g. `p1`, `d3`)
- `reviews` (search): integer page size for the reviews list. Defaults to 5. Clamped to `[1, 100]` server-side; invalid values fall back to 5.

Renders 404 (`notFound()`) when the product id doesn't resolve.

### `app/not-found.tsx`

Add a minimal site-wide 404 if one doesn't already exist, so an unknown product id renders something better than the framework default.

## File layout

```
ecom-app-v1/
  prisma/
    schema.prisma                # MODIFIED — Product changes + ProductImage + Review
    migrations/
      <ts>_add_pdp_fields_and_relations/   # NEW migration
    seed.ts                      # MODIFIED — adds images, reviews, stock, description
  app/
    not-found.tsx                # NEW (if missing)
    products/
      [id]/
        page.tsx                 # NEW — PDP server component
    _components/
      product/                   # NEW directory
        breadcrumb.tsx           # server
        image-gallery.tsx        # CLIENT — only component with state
        buy-box.tsx              # server
        description.tsx          # server (renders react-markdown)
        reviews-section.tsx      # server (paginated via ?reviews=N)
        related-strip.tsx        # server (reuses ProductCard)
      home/
        product-card.tsx         # MODIFIED — wraps content in Link to /products/{id}
    _lib/
      products.ts                # MODIFIED — getProductDetail, getProductReviews,
                                 # and aggregate-based rating/reviewCount in existing helpers
  next.config.ts                 # MODIFIED — add picsum.photos to images.remotePatterns
  package.json                   # MODIFIED — adds react-markdown
```

## Components

### `ImageGallery` (client)

- Props: `images: { url: string; sortOrder: number }[]`, `productName: string`, `fallbackImage: string` (the `Product.image` field, used when `images` is empty).
- State: `selectedIndex: number` (defaults to 0).
- Renders a main image (large, square) and a row of up to N thumbnails. Clicking a thumb sets `selectedIndex`.
- Thumbnails are `<button type="button" aria-label="Show image {n+1}">`. Selected thumb gets a visible ring.
- All images use `next/image`.
- This is the **only client component** in the PDP. Everything else stays server-rendered.

### `BuyBox` (server)

- Props: name, price, originalPrice, ratingAvg, ratingCount, stock, productId, wishlisted, fromPath.
- Renders: name (h1), star rating + review count (linkable to the reviews section via `#reviews`), price (with `originalPrice` strikethrough + discount % badge if applicable), stock chip, quantity select (1..min(stock, 10)) when in stock, "Add to cart" button (disabled when `stock === 0`, otherwise a styled but inert button), wishlist heart form.
- Wishlist heart reuses `toggleWishlistAction` with `fromPath="/products/{id}"`.
- Quantity select is plain `<select>` — no client JS. Its value is currently ignored (no cart yet); it exists so the layout is correct and so the cart spec doesn't have to add it later.

### `Breadcrumb` (server)

- `Home › {Category name} › {Product name}` with the first two as links.
- Uses `<nav aria-label="Breadcrumb">` with an ordered list.

### `Description` (server)

- Renders `product.description` through `react-markdown`.
- No `rehype-raw`, no custom HTML — defense in depth even though seeded content is trusted.
- Section heading: "About this product".

### `ReviewsSection` (server)

- Top: average rating (large), out of 5 stars, total count, and a 5-row histogram (count of 5★, 4★, …) computed once via `prisma.review.groupBy`.
- List: each review shows author, date, rating (5 small stars), optional title, body. Up to N reviews where N comes from `?reviews=` (default 5).
- Pagination: a "Show more reviews" link. Server-side: `<Link href="?reviews={N+5}#reviews">`. The `#reviews` hash scrolls back to the section after Next streams in the new content. No client JS.
- Empty state: "No reviews yet." line, no histogram.

### `RelatedStrip` (server)

- 4 cards from the same `categorySlug`, excluding the current product, ordered by `id`. Reuses the existing `ProductCard` component.
- Cards still need `wishlisted` state, so the page passes the same wishlisted set used elsewhere.
- Section omitted entirely (not rendered as an empty heading) when no related products exist.

## Data flow

```
GET /products/p1?reviews=5
  └─ app/products/[id]/page.tsx
       ├─ getProductDetail("p1")
       │    └─ prisma.product.findUnique({ include: { category, images } })
       │    └─ Promise.all([
       │          prisma.review.aggregate({ _avg, _count }),
       │          prisma.product.findMany({ where: same category, take: 4 }),
       │       ])
       ├─ getProductReviews("p1", 5)        // first-page review records
       ├─ getReviewHistogram("p1")          // 5-bucket count via groupBy
       ├─ auth()                            // current session
       └─ getWishlistProductIds(userId)     // for buy-box heart + related cards
```

If `getProductDetail` returns `null`, the page calls `notFound()`.

### `app/_lib/products.ts` extensions

```ts
export async function getProductDetail(id: string): Promise<{
  product: Product & { category: Category; images: ProductImage[] };
  agg: { avg: number | null; count: number };
  related: ProductView[];
} | null>;

export async function getProductReviews(
  id: string,
  take: number,
): Promise<Review[]>;

export async function getReviewHistogram(
  id: string,
): Promise<Record<1 | 2 | 3 | 4 | 5, number>>;
```

### Card-data shape preserved

`ProductCard` still expects `rating` and `reviewCount` props. The home, deals, and wishlist queries now compute them via Prisma aggregates (one `groupBy` over `Review` per page render is fine for 12 products) and project them into the `ProductView` shape. None of the consuming components change.

## Card linkage

`ProductCard` becomes a `<Link href="/products/{id}">` wrapping its image + body + footer regions. Inner `<form>` elements (wishlist heart, "Add to cart") submit normally because clicking the form's button doesn't bubble as a link click. The footer's "Add to cart" button stays a no-op for now.

## Error handling and edge cases

| Case | Behavior |
|---|---|
| Unknown product id | `notFound()` → site-wide 404 |
| `?reviews=` is non-numeric, negative, or > 100 | Falls back to 5 (clamped server-side) |
| Product has 0 reviews | Reviews section renders title + "No reviews yet." line, histogram skipped |
| Product has < 4 related products | Related strip renders only what exists (no empty heading) |
| Product has 0 related products | Related strip omitted entirely |
| Product has fewer images than the gallery expects | Gallery shows whatever is in `images`, falling back to `Product.image` if `images` is empty |
| `stock === 0` | Out-of-stock chip (red), quantity hidden, button disabled |
| `1 ≤ stock ≤ 5` | "Only {n} left" chip (amber), quantity select capped at `stock` |
| `stock > 5` | "In stock" chip (green), quantity select capped at min(stock, 10) |
| Guest clicks wishlist heart | `toggleWishlistAction` redirects to `/login?callbackUrl=/products/{id}` |
| Broken image URL | Default `next/image` broken-image rendering |

## SEO and metadata

Each product page exports `generateMetadata({ params })`:

- `title` — the product name. (The root layout currently sets `title: "Create Next App"` — that's pre-existing scaffolding noise unrelated to this spec; the per-page title overrides it.)
- `description` — first ~160 chars of the `description` markdown after stripping markdown syntax (a small helper).
- `openGraph.images` — `product.image` (the existing single-image field, now a picsum URL after the seed update).

## Accessibility

- Gallery thumbnails are `<button type="button">` with descriptive `aria-label`. Selected thumb has visible focus + selection ring.
- Star ratings expose an `aria-label="{n.n} out of 5 stars"` on the wrapper; individual star icons are `aria-hidden`.
- Breadcrumb wrapped in `<nav aria-label="Breadcrumb">` with an ordered list and `aria-current="page"` on the final crumb.
- Stock chips combine color + text (no color-only signals).
- "Add to cart" disabled state uses `disabled` plus `aria-disabled="true"` and stays focusable for keyboard users.
- Description heading uses an `<h2>`; reviews and related each get an `<h2>`. Page has exactly one `<h1>` (product name in the buy box).

## Performance

- All data fetched in parallel where possible (`Promise.all` inside `getProductDetail` and at the page level).
- Aggregates run as Prisma `groupBy` / `aggregate` (no N+1 — one query per aggregate, not one per product).
- Gallery is a small client island; the rest of the page is fully RSC.
- `react-markdown` renders on the server — no client bundle cost for the description.

## Testing

Manual only — matches the existing project convention (no Vitest / Jest / Playwright in the repo today).

### v1 manual walkthrough

1. `npm run db:reset` — apply migration + reseed
2. `npm run dev` — open the site
3. From the home page, click any product card → lands on `/products/{id}`
4. Verify above-the-fold: breadcrumb, gallery (4 thumbs, click swaps main image), buy box (name, rating, price, stock, qty, Add-to-cart button styled, wishlist heart)
5. Verify below-the-fold: description renders markdown (heading + bullets), reviews section shows histogram + 5 reviews + "Show more" link, related strip shows up to 4 cards from the same category
6. Click "Show more reviews" → URL becomes `?reviews=10` and 10 reviews render
7. Visit the product seeded with `stock = 0` → out-of-stock chip, qty hidden, button disabled
8. Visit the product seeded with `stock = 3` → "Only 3 left" chip, qty select capped at 3
9. Log out, click the wishlist heart on a PDP → redirected to `/login?callbackUrl=/products/{id}` → log in → returns to PDP with heart filled
10. Visit `/products/does-not-exist` → 404
11. Confirm home, deals, and wishlist pages still render correctly (since `Product.rating` / `reviewCount` were dropped and replaced by aggregates)
12. `npm run build` cleanly with no type / lint errors

### Pass criteria

All 12 walkthrough steps complete without errors. `npm run build` exits 0.

## Future specs (not in this one)

- **Cart** — wires the "Add to cart" button to a real cart subsystem; quantity selector starts being read.
- **Checkout + Orders** — replaces the static mock orders, adds payment.
- **Reviews v2** — auth-gated submission form, "verified purchase" flag, moderation.
- **Admin** — product / category / review CRUD.
- **Search and category pages** — `/category/[slug]`, `/search?q=`.
