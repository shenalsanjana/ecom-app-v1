## ADDED Requirements

### Requirement: One breadcrumb describes a visitor's place in the taxonomy

Every page beneath the taxonomy — department, design and product — SHALL render a breadcrumb from a single shared implementation, so that markup, separators and semantics cannot drift between them.

The trail SHALL read Home › Categories › Department › sub-category › Design › Product, including only the levels that apply. The breadcrumb SHALL be a navigation landmark with an accessible name, and its items SHALL form an ordered list.

#### Scenario: A product page renders its trail

- **WHEN** a product page renders for a design under a department
- **THEN** the trail names Home, Categories, the department, the design and the product in that order
- **AND** the design links to its canonical nested path

#### Scenario: Every page uses the same breadcrumb

- **WHEN** a department page, a design page and a product page each render a breadcrumb
- **THEN** all three come from the same implementation

### Requirement: The final crumb is the current page, and the sub-category is never a link

The last crumb SHALL carry no link and SHALL be marked as the current page. Exactly one crumb SHALL be marked current.

The sub-category crumb SHALL never be a link, because a sub-category is a property of a department and not an addressable level. It SHALL appear only alongside a design, so that a department's own page ends on the department rather than linking to itself.

#### Scenario: A design page renders

- **WHEN** a design page renders under a department that names a sub-category
- **THEN** the sub-category appears between the department and the design without a link
- **AND** the design crumb, being last, carries no link and is marked as the current page

#### Scenario: A department page renders

- **WHEN** a department page renders
- **THEN** the trail ends on the department, unlinked
- **AND** no sub-category crumb appears

### Requirement: The browse filter tree counts and locates the visitor

The browse page SHALL show, for every department and every design, how many products sit beneath it, using zero rather than a blank where there are none. It SHALL mark the selected design and its parent department as active, and mark nothing else.

#### Scenario: A visitor selects a design

- **WHEN** the browse page renders with a design selected
- **THEN** that design and the department containing it are shown as active
- **AND** no other row is

#### Scenario: A design has no products

- **WHEN** the tree renders a design nothing is filed under
- **THEN** it shows zero

### Requirement: A tile shows the design's photo when it has one

A taxonomy tile SHALL render the design's image when one is stored and fall back to the tint when none is. The tint SHALL remain the tile's background in both cases, so a slow or failed image still resolves to a deliberate colour.

Ink over a photograph SHALL NOT be chosen by measuring contrast against the tint, which says nothing about legibility over an image. A tile carrying a photo SHALL use the light ink over a scrim; the measured-contrast rule continues to govern tiles without one.

#### Scenario: A design with a photo is tiled

- **WHEN** a tile renders for a design that has an image
- **THEN** the image is shown over the tint with a scrim beneath the label
- **AND** the label uses the light ink

#### Scenario: A design without a photo is tiled

- **WHEN** a tile renders for a design with no image
- **THEN** the tile is the flat tint and its ink is whichever measures higher contrast

### Requirement: A product card names its department as well as its design

A product card's label SHALL name the department and the design together. Where the department is unknown the card SHALL show the design alone, never a dangling separator.

The department name SHALL come from the read the card already performs, not from a second query.

#### Scenario: A card renders for a product in a department

- **WHEN** a card renders for a product whose design belongs to a department
- **THEN** the label names the department and then the design

#### Scenario: A card renders without a department

- **WHEN** a card renders for a product whose department cannot be determined
- **THEN** the label is the design name alone
