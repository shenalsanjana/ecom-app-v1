## ADDED Requirements

### Requirement: Public CSV catalog feed for Meta

The system SHALL serve a public CSV catalog feed at `/feed/meta-catalog.csv` suitable for Meta Commerce Manager / Facebook Shop scheduled ingestion. The feed SHALL include a header row followed by one row per sellable product, and SHALL be cacheable so scheduled pulls do not hit the database on every request. The response SHALL have a `text/csv` content type.

#### Scenario: Feed returns CSV with header

- **WHEN** a client requests `/feed/meta-catalog.csv`
- **THEN** the response is `200` with content type `text/csv` and the first line is the column header `id,title,description,availability,condition,price,sale_price,link,image_link,brand,google_product_category,item_group_id`

#### Scenario: Archived products excluded

- **WHEN** the feed is generated
- **THEN** products with `archived = true` are absent and non-archived products are present

### Requirement: Feed fields follow Meta conventions

The system SHALL map each product to Meta's catalog fields: `id` = `product.id`; `availability` = `in stock` when stock is positive else `out of stock`; `condition` = `new`; `brand` = `Dressing Bear`; `link` and `image_link` = absolute URLs; prices formatted as `"<amount>.00 LKR"`. For products on sale (an original price greater than the current price), the feed `price` SHALL be the original price and `sale_price` SHALL be the current price; otherwise `price` SHALL be the current price and `sale_price` SHALL be empty. Out-of-stock non-archived products SHALL remain in the feed (marked out of stock) to preserve ad history. CSV field values SHALL be quoted and internal quotes escaped.

#### Scenario: On-sale price mapping is inverted

- **WHEN** a product has an original price greater than its current price
- **THEN** the feed row's `price` is the original price and `sale_price` is the current price (both in LKR)

#### Scenario: Regular price mapping

- **WHEN** a product is not on sale
- **THEN** the feed row's `price` is the current price and `sale_price` is empty

#### Scenario: Availability from stock

- **WHEN** a non-archived product has zero stock
- **THEN** the feed row is present with `availability` = `out of stock`

### Requirement: Feed identifier matches Pixel and JSON-LD

The system SHALL use the same `product.id` as the feed `id` (and `item_group_id`), the Pixel `content_ids`, and the JSON-LD `sku`, so that catalog matching and dynamic retargeting stay aligned.

#### Scenario: Shared product identifier

- **WHEN** comparing a product's feed `id`, its Pixel `content_ids` entry, and its JSON-LD `sku`
- **THEN** all three equal the same `product.id`
