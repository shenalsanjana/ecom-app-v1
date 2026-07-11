## MODIFIED Requirements

### Requirement: Admin manages color variants

The system SHALL let an admin edit a product as a design with a required DTF print design assignment and a repeatable list of color variants. For each variant the admin SHALL be able to set the color name and slug, an optional swatch color, an optional SKU, an optional price and original-price override, an ordered set of card images and a separate ordered set of detail images, and the set of sizes the color is offered in. The admin SHALL be able to add, remove, reorder, and duplicate variants; the first variant (lowest sort order) is the design's default color. Saving SHALL persist all variants, their two image sets, their offered sizes, and the product's DTF design assignment in a single transaction, and SHALL reject duplicate color slugs or duplicate SKUs within the product, or a missing DTF design, with a clear message. Editing a product SHALL preserve existing variant identity (so historical order references survive); a removed color SHALL be archived rather than hard-deleted. Stock quantities are managed separately in the Inventory admin section, not on the product editor.

#### Scenario: Create a multi-color product

- **WHEN** an admin creates a product with a DTF design assigned and three colors, each with card images, detail images, and offered sizes
- **THEN** the product is saved with its design assignment and three variants with their image sets and offered sizes

#### Scenario: Duplicate SKU within a product is rejected

- **WHEN** an admin saves a product with two variants sharing the same non-empty SKU
- **THEN** the save is refused with a message identifying the duplicate

#### Scenario: Missing DTF design is rejected

- **WHEN** an admin saves a product without selecting a DTF design
- **THEN** the save is refused with a message asking the admin to choose a design

#### Scenario: Editing a product preserves variant identity

- **WHEN** an admin edits any field of a product that has past orders
- **THEN** the existing color variants keep their identity (order line items still reference them)
- **AND** a color the admin removes is archived, not hard-deleted

### Requirement: Product list shows colors and total stock

The system SHALL show, for each product in the admin list, its number of color variants and whether it is currently available (at least one offered color+size clearing both the plain-tee and DTF design raw-material pools). The low-stock view SHALL select products where the assigned DTF design or any offered color+size plain-tee pool is at or below the low-stock threshold.

#### Scenario: List reflects variant data

- **WHEN** an admin views the products list
- **THEN** each row shows the product's color count and an Available/Unavailable badge

#### Scenario: Low-stock tab reflects the raw-material pools

- **WHEN** an admin opens the low-stock tab
- **THEN** it lists products whose assigned design or any offered color+size plain-tee pool is at or below the low-stock threshold
