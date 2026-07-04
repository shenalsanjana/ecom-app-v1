## ADDED Requirements

### Requirement: Admin manages color variants

The system SHALL let an admin edit a product as a design with a repeatable list of color variants. For each variant the admin SHALL be able to set the color name and slug, an optional swatch color, an optional SKU, an optional price and original-price override, an ordered set of card images and a separate ordered set of detail images, and a per-size stock grid. The admin SHALL be able to add, remove, reorder, and duplicate variants; the first variant (lowest sort order) is the design's default color. Saving SHALL persist all variants, their two image sets, and their size-stock cells in a single transaction, and SHALL reject duplicate color slugs or duplicate SKUs within the product with a clear message.

#### Scenario: Create a multi-color product

- **WHEN** an admin creates a product with three colors, each with card images, detail images, and size stock
- **THEN** the product is saved with three variants and their image sets and size-stock cells

#### Scenario: Duplicate SKU within a product is rejected

- **WHEN** an admin saves a product with two variants sharing the same non-empty SKU
- **THEN** the save is refused with a message identifying the duplicate

### Requirement: Product list shows colors and total stock

The system SHALL show, for each product in the admin list, its number of color variants and its total stock (the sum of all its color+size cells). The low-stock view SHALL select products having any color+size cell at or below the low-stock threshold.

#### Scenario: List reflects variant data

- **WHEN** an admin views the products list
- **THEN** each row shows the product's color count and total stock

## MODIFIED Requirements

### Requirement: Admin can permanently delete a product without order history

The system SHALL allow an admin to permanently delete a product if and only if the product has no associated order line items (`OrderItem`). Deletion SHALL be refused for any product that has ever been ordered, preserving order history. The deletion action SHALL require an authenticated admin.

When a deletable product is removed, its associated color variants (including each variant's images and size-stock cells), reviews, and wishlist entries SHALL be removed with it.

#### Scenario: Delete a product that has never been ordered

- **WHEN** an admin confirms deletion of a product that has zero order line items
- **THEN** the product is permanently removed from the catalog
- **AND** its color variants (with their images and size-stock cells), reviews, and wishlist entries are removed with it
- **AND** the product no longer appears in the admin products list or the storefront

#### Scenario: Deletion blocked for a product with order history

- **WHEN** an admin attempts to delete a product that has one or more order line items
- **THEN** the deletion is refused
- **AND** the admin is shown a message indicating the product has order history and should be archived instead
- **AND** the product and its order history remain intact

#### Scenario: Non-admin cannot delete a product

- **WHEN** a non-admin (or unauthenticated) user attempts the delete action
- **THEN** the request is rejected by the admin guard and no product is deleted

#### Scenario: Delete is reachable from the products table

- **WHEN** an admin views the products table on either the Active or Archived tab
- **THEN** each product row exposes a Delete control that asks for confirmation before deleting
