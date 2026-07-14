# product-color-variants Specification

## Purpose

Defines the color-variant model for the catalog: a single product (design) owns multiple color variants, each carrying its own two image sets (card slider + PDP gallery), SKU, optional price override, and a per-size structural grid (which sizes each color offers). Covers the storefront swatch cards, the product-detail color selector with `?color=` deep-linking, the variant-keyed cart, and checkout validation/decrement against the two shared raw-material pools (see raw-material-inventory) that back each color+size cell.

## Requirements

### Requirement: Products own color variants

The system SHALL model each product as a single design that owns one or more color variants. Each variant SHALL carry a display color name, a URL-safe color slug (unique within the product), an optional swatch color, an optional SKU (unique across variants when set), an optional price and original-price override, a sort order, and an archived flag. A variant's effective price SHALL be its override when set, otherwise the product's base price (the same rule applies to original price). The design (product) SHALL no longer encode color in its name, and color-specific images, SKU, price, and inventory SHALL live on the variant, not the product.

#### Scenario: One product represents all its colors

- **WHEN** a design is offered in White, Ivory, and Baby Pink
- **THEN** it is stored as one product with three color variants (not three products)
- **AND** the product name contains no color

#### Scenario: Variant price override falls back to the base price

- **WHEN** a variant has no price override
- **THEN** its effective price equals the product's base price
- **AND** when it has an override, the override is used

### Requirement: Each variant carries two image sets

The system SHALL store, per color variant, two ordered image sets distinguished by role: a `CARD` set used by shop/category/listing cards and a `DETAIL` set used by the product detail gallery. The two sets SHALL be independently ordered and MAY differ.

#### Scenario: Card and detail images are separate per color

- **WHEN** an admin provides different card and detail images for a color
- **THEN** the storefront card shows the color's CARD images and the product page gallery shows the color's DETAIL images

### Requirement: Per-color, per-size inventory

The system SHALL track which sizes each color variant offers (a color × size structural grid), with each cell's actual quantity drawn from the shared raw-material inventory (plain-tee stock by color+size, gated by the product's assigned DTF design stock) rather than stored on the variant itself. A variant SHALL be considered in stock when any of its offered sizes clears both raw-material pools; a product SHALL be considered in stock when any of its variants is in stock. A size SHALL be shown as unavailable for a color when that color+size's raw-material pool is zero or the product's assigned design pool is zero.

#### Scenario: Size availability is per color

- **WHEN** a color's plain-tee pool for size M is zero and for size L is positive, and the product's design pool is positive
- **THEN** size M is presented as unavailable and size L as available for that color

#### Scenario: A zero design pool makes every size of every color unavailable

- **WHEN** the product's assigned DTF design pool reaches zero
- **THEN** every size of every color variant is presented as unavailable

### Requirement: Storefront cards show color swatches

The system SHALL render one card per design showing color swatches. Selecting a swatch SHALL update the card image to the selected color's card image without a full page reload, keeping the design title unchanged. The card price SHALL reflect the selected color's effective price.

#### Scenario: Swatch updates the card image without reload

- **WHEN** a shopper clicks a color swatch on a product card
- **THEN** the card image updates to that color's card image without navigating away
- **AND** the product title is unchanged

### Requirement: Product page color selection

The system SHALL present the same color swatches on the product detail page on a single canonical page per design (no separate page per color). Selecting a color SHALL update the image gallery (the color's detail images), the displayed SKU, the effective price, the per-size availability, and the Add-to-Cart target variant, and SHALL reflect the selected color in the URL as `?color=<colorSlug>` via shallow routing. When the URL has no valid `color` parameter, the default variant (lowest sort order) SHALL be selected.

#### Scenario: Selecting a color updates the page and URL

- **WHEN** a shopper selects a color on the product detail page
- **THEN** the gallery, SKU, price, and available sizes update to that color
- **AND** the URL gains `?color=<colorSlug>` without a full reload

#### Scenario: Deep link to a color

- **WHEN** a shopper opens a product URL with a valid `?color=<slug>`
- **THEN** that color is selected on load

### Requirement: Variant-aware cart and checkout inventory

The system SHALL identify a cart line by its variant and size, so the same design in two colors or a color in two sizes are distinct lines. At checkout the system SHALL validate each line against the shared plain-tee color+size pool and the product's assigned DTF design pool, and SHALL decrement both pools atomically, refusing the order when either pool has insufficient stock. Checkout SHALL reject a cart line when the selected variant does not belong to the claimed product. Each order line SHALL snapshot the variant id, the database variant color, the database variant SKU, and the specific plain-tee and design pool rows it drew from, alongside the existing name/size/price/quantity.

#### Scenario: Two colors are distinct cart lines

- **WHEN** a shopper adds White / M and Black / M of the same design
- **THEN** the cart holds two separate lines

#### Scenario: Checkout decrements both raw-material pools

- **WHEN** an order for a color+size is placed with sufficient stock in both pools
- **THEN** the matching plain-tee color+size pool and the product's design pool are each decremented by the ordered quantity

#### Scenario: Oversell is refused

- **WHEN** an order requests more units of a color+size than either raw-material pool currently has
- **THEN** the order is refused and neither pool is decremented

#### Scenario: Variant must belong to the claimed product

- **WHEN** a cart line claims product A but selects a variant owned by product B
- **THEN** checkout refuses the order before creating an order or decrementing stock

#### Scenario: Checkout snapshots database variant color

- **WHEN** a cart line contains a stale or manipulated color value for a selected variant
- **THEN** the created order item stores the selected database variant's color and SKU

### Requirement: Order item color snapshots are visible in confirmations and admin views

The system SHALL carry saved order item color and SKU snapshots through order confirmation, prepaid finalization, admin resend, dispatch, pending-payment, and failure-alert paths. Customer confirmation email SHALL show every ordered item's color when present and SHALL omit SKU. Customer confirmation SMS SHALL include a bounded summary of at most two product-color pairs and SHALL append `+N more` when additional order lines are omitted. Itemized admin emails and admin order views SHALL show product name, color, size, SKU, quantity, unit price, and line total. Missing legacy color or SKU values SHALL render safely, with customer messages omitting missing optional attributes and admin surfaces showing an em dash.

#### Scenario: Customer confirmation email shows color without SKU

- **WHEN** an order item has color `White`, size `M`, and SKU `DB-TEE-WHT-M`
- **THEN** the customer confirmation email identifies the item as color `White` and size `M`
- **AND** the customer confirmation email does not include `DB-TEE-WHT-M`

#### Scenario: Customer confirmation SMS summarizes item colors

- **WHEN** an order has three item lines with colors
- **THEN** the confirmation SMS includes at most the first two product-color pairs
- **AND** the confirmation SMS includes `+1 more`
- **AND** the SMS body stays within the configured 160-character application budget

#### Scenario: Itemized admin emails show full item snapshots

- **WHEN** a dispatch, pending-payment, or failure-alert email is generated for an order
- **THEN** each item line shows product name, color, size, SKU, quantity, unit price, and line total

#### Scenario: Admin order list shows compact item colors

- **WHEN** an admin views the orders list
- **THEN** each row's Items column shows up to two compact `Product - Color xquantity` lines
- **AND** additional item lines are summarized with `+N more`

#### Scenario: Admin order detail shows full saved item details

- **WHEN** an admin opens an order detail page
- **THEN** every order item shows its saved product name, color, size, SKU, quantity, unit price, and line total
- **AND** color and SKU are read-only historical fields

#### Scenario: Legacy missing color and SKU values remain renderable

- **WHEN** an existing order item has null color or SKU
- **THEN** customer messages omit the missing optional attributes
- **AND** admin emails and admin order views show an em dash for the missing admin fields

#### Scenario: Status-only customer messages remain unchanged

- **WHEN** a dispatch or cancellation customer notification is generated
- **THEN** the message remains status-only and does not list item colors

### Requirement: Reviews shared across colors; wishlist per product

The system SHALL keep product reviews and their aggregate rating at the product level, shared across all of a product's colors. The wishlist SHALL remain keyed to the product (a shopper saves the design, not a specific color).

#### Scenario: One rating for all colors

- **WHEN** a product has reviews
- **THEN** the same aggregate rating is shown regardless of the selected color

#### Scenario: Wishlist saves the design

- **WHEN** a shopper adds a product to the wishlist
- **THEN** the product is saved without a specific color
