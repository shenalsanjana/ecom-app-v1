# social-sharing Specification

## Purpose

Defines how customers share Dressing Bear products and how shared links render: the
product-page share controls (native Web Share plus explicit Facebook / WhatsApp /
Copy-link), the enriched Open Graph metadata that makes shared links show image, title
with price, and description, and the `Product` JSON-LD structured data on product pages.

## Requirements

### Requirement: Product pages provide share controls

The system SHALL render share controls on each product page that let a visitor share the canonical product URL. The controls SHALL include explicit Facebook, WhatsApp, and Copy-link actions, and SHALL additionally offer the device's native Web Share sheet when the browser supports it. There SHALL be no dedicated Instagram button, since Instagram has no web share-link URL; Instagram is reached through the native share sheet.

#### Scenario: Explicit share buttons present

- **WHEN** a visitor views a product page
- **THEN** Facebook, WhatsApp, and Copy-link controls are visible, each targeting the absolute canonical product URL (`<APP_URL>/products/<id>`)

#### Scenario: Native share offered when supported

- **WHEN** the visitor's browser supports the Web Share API
- **THEN** a native "Share" control is shown that invokes the device share sheet with the product title and URL

#### Scenario: Copy link gives feedback

- **WHEN** the visitor activates Copy-link
- **THEN** the canonical product URL is written to the clipboard and the control shows a transient "Copied" confirmation

### Requirement: Shared links render rich previews with price

The system SHALL emit Open Graph metadata for product pages so that links shared to Facebook, WhatsApp, and similar surfaces show the product image, title, and description. Because standard link cards have no dedicated price field, the price SHALL be folded into the title (format `Name — LKR <price>`). Image URLs in metadata SHALL be absolute.

#### Scenario: Open Graph title includes price

- **WHEN** a product page is rendered
- **THEN** the `og:title` contains the product name and its price in LKR

#### Scenario: Open Graph image is absolute

- **WHEN** a product page is rendered
- **THEN** the `og:image` is an absolute URL resolvable by external scrapers

### Requirement: Product pages emit Product JSON-LD

The system SHALL include `Product` JSON-LD structured data on product pages, containing the product name, absolute image, description, brand, and an `Offer` with `price`, `priceCurrency: "LKR"`, and `availability` derived from stock. When the product has reviews, the JSON-LD SHALL include `AggregateRating` with the rating value and review count. The JSON-LD `sku` SHALL equal `product.id`, matching the Pixel `content_ids` and the catalog feed `id`.

#### Scenario: JSON-LD Offer reflects price and availability

- **WHEN** a product page is rendered
- **THEN** a `Product` JSON-LD script is present with an `Offer` whose `priceCurrency` is `LKR`, `price` is the product price, and `availability` is `InStock` when stock is positive (else `OutOfStock`)

#### Scenario: JSON-LD sku matches product id

- **WHEN** a product page is rendered
- **THEN** the JSON-LD `sku` equals the `product.id`
