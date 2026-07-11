## MODIFIED Requirements

### Requirement: Feed fields follow Meta conventions

The system SHALL map each color variant to Meta's catalog fields: `id` = the variant SKU when set, otherwise `<productId>-<colorSlug>`; `item_group_id` = `product.id` (shared across the design's colors); `title` = the design name with the color; `availability` = `in stock` when at least one of the variant's offered sizes clears both the matching plain-tee color+size pool and the product's assigned DTF design pool, else `out of stock`; `condition` = `new`; `brand` = `Dressing Bear`; `link` = the product URL with `?color=<colorSlug>`; `image_link` = the variant's first card image as an absolute URL; prices formatted as `"<amount>.00 LKR"` using the variant's effective price. For a variant on sale (an effective original price greater than the effective price), the feed `price` SHALL be the original price and `sale_price` SHALL be the current price; otherwise `price` SHALL be the current price and `sale_price` SHALL be empty. Out-of-stock non-archived variants SHALL remain in the feed (marked out of stock) to preserve ad history. CSV field values SHALL be quoted and internal quotes escaped.

#### Scenario: Variant grouping via item_group_id

- **WHEN** a design has multiple color variants
- **THEN** every variant row's `item_group_id` equals the design's `product.id` and each row's `id` is that variant's SKU (or `<productId>-<colorSlug>`)

#### Scenario: On-sale price mapping is inverted

- **WHEN** a variant's effective original price is greater than its effective price
- **THEN** the feed row's `price` is the original price and `sale_price` is the current price (both in LKR)

#### Scenario: Regular price mapping

- **WHEN** a variant is not on sale
- **THEN** the feed row's `price` is the current price and `sale_price` is empty

#### Scenario: Availability from the two raw-material pools

- **WHEN** a non-archived variant has no offered size that clears both its plain-tee pool and the product's design pool
- **THEN** the feed row is present with `availability` = `out of stock`
