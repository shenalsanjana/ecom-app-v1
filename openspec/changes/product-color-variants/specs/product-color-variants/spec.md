## ADDED Requirements

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

The system SHALL track stock as an integer count per color variant and size (a color × size grid). A variant SHALL be considered in stock when any of its size cells has a positive count; a product SHALL be considered in stock when any of its variants is in stock. A size SHALL be shown as unavailable for a color when that color's cell for the size is zero.

#### Scenario: Size availability is per color

- **WHEN** a color has size M stock of 0 and size L stock of 4
- **THEN** size M is presented as unavailable and size L as available for that color

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

The system SHALL identify a cart line by its variant and size, so the same design in two colors (or a color in two sizes) are distinct lines. At checkout the system SHALL validate each line against the exact color+size stock cell and SHALL decrement that cell atomically, refusing the order when the cell has insufficient stock. Each order line SHALL snapshot the variant id, color, and SKU alongside the existing name/size/price/quantity.

#### Scenario: Two colors are distinct cart lines

- **WHEN** a shopper adds White / M and Black / M of the same design
- **THEN** the cart holds two separate lines

#### Scenario: Checkout decrements the exact cell

- **WHEN** an order for a color+size is placed with sufficient stock
- **THEN** only that color+size stock cell is decremented by the ordered quantity

#### Scenario: Oversell is refused

- **WHEN** an order requests more units of a color+size than are in stock
- **THEN** the order is refused and no stock is decremented

### Requirement: Reviews shared across colors; wishlist per product

The system SHALL keep product reviews and their aggregate rating at the product level, shared across all of a product's colors. The wishlist SHALL remain keyed to the product (a shopper saves the design, not a specific color).

#### Scenario: One rating for all colors

- **WHEN** a product has reviews
- **THEN** the same aggregate rating is shown regardless of the selected color

#### Scenario: Wishlist saves the design

- **WHEN** a shopper adds a product to the wishlist
- **THEN** the product is saved without a specific color
