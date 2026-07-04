## MODIFIED Requirements

### Requirement: Public CSV catalog feed for Meta

The system SHALL serve a public CSV catalog feed at `/feed/meta-catalog.csv` suitable for Meta Commerce Manager / Facebook Shop scheduled ingestion. The feed SHALL include a header row followed by one row per sellable color variant (a design contributes one row per non-archived color), and SHALL be cacheable so scheduled pulls do not hit the database on every request. The response SHALL have a `text/csv` content type.

#### Scenario: Feed returns CSV with header

- **WHEN** a client requests `/feed/meta-catalog.csv`
- **THEN** the response is `200` with content type `text/csv` and the first line is the column header `id,title,description,availability,condition,price,sale_price,link,image_link,brand,google_product_category,item_group_id`

#### Scenario: One row per color variant

- **WHEN** a non-archived product has three color variants
- **THEN** the feed contains three rows for that product, all sharing the same `item_group_id`

#### Scenario: Archived products excluded

- **WHEN** the feed is generated
- **THEN** variants of products with `archived = true` are absent and variants of non-archived products are present

### Requirement: Feed fields follow Meta conventions

The system SHALL map each color variant to Meta's catalog fields: `id` = the variant SKU when set, otherwise `<productId>-<colorSlug>`; `item_group_id` = `product.id` (shared across the design's colors); `title` = the design name with the color; `availability` = `in stock` when the variant has any positive size cell else `out of stock`; `condition` = `new`; `brand` = `Dressing Bear`; `link` = the product URL with `?color=<colorSlug>`; `image_link` = the variant's first card image as an absolute URL; prices formatted as `"<amount>.00 LKR"` using the variant's effective price. For a variant on sale (an effective original price greater than the effective price), the feed `price` SHALL be the original price and `sale_price` SHALL be the current price; otherwise `price` SHALL be the current price and `sale_price` SHALL be empty. Out-of-stock non-archived variants SHALL remain in the feed (marked out of stock) to preserve ad history. CSV field values SHALL be quoted and internal quotes escaped.

#### Scenario: Variant grouping via item_group_id

- **WHEN** a design has multiple color variants
- **THEN** every variant row's `item_group_id` equals the design's `product.id` and each row's `id` is that variant's SKU (or `<productId>-<colorSlug>`)

#### Scenario: On-sale price mapping is inverted

- **WHEN** a variant's effective original price is greater than its effective price
- **THEN** the feed row's `price` is the original price and `sale_price` is the current price (both in LKR)

#### Scenario: Regular price mapping

- **WHEN** a variant is not on sale
- **THEN** the feed row's `price` is the current price and `sale_price` is empty

#### Scenario: Availability from variant stock

- **WHEN** a non-archived variant has no positive size cell
- **THEN** the feed row is present with `availability` = `out of stock`

### Requirement: Feed identifier matches Pixel and JSON-LD

The system SHALL use `product.id` as the feed `item_group_id`, the Pixel `content_ids` entry, and the JSON-LD product identifier, so catalog matching and dynamic retargeting stay aligned at the design level, while each color variant is represented as its own feed row and its own JSON-LD offer.

#### Scenario: Shared design identifier

- **WHEN** comparing a design's feed `item_group_id`, its Pixel `content_ids` entry, and its JSON-LD product id
- **THEN** all three equal the same `product.id`

#### Scenario: Per-color offers in JSON-LD

- **WHEN** the product detail page renders JSON-LD for a multi-color design
- **THEN** it emits one offer per color variant, each with the color's price, SKU, availability, and `?color=` URL
