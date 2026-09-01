## MODIFIED Requirements

### Requirement: Home page section order

The public home page SHALL render its primary sections in this top-to-bottom order: hero banner, social-proof strip, Featured products, Shop by category, Shop by design, Deals, Trust strip. The social-proof strip MUST appear directly below the hero banner, Featured products MUST appear directly below the social-proof strip, and the Shop by design section MUST appear directly below the Shop by category section.

#### Scenario: Visitor lands on the home page

- **WHEN** a visitor loads the home page
- **THEN** the social-proof strip is rendered immediately after the hero banner
- **AND** the Featured products grid is rendered immediately after the social-proof strip
- **AND** the Shop by category section still renders below Featured products
- **AND** the Shop by design section renders immediately after Shop by category

## ADDED Requirements

### Requirement: Home taxonomy sections render departments, not designs

The Shop by category section SHALL render departments, not designs. Each tile SHALL be labelled with the department's tile name, carry its note as a sub-label when one exists, and be painted with the department row's stored tint.

The Shop by design section SHALL render one group per department, and a group SHALL be identified by its department name together with its sub-category name. Because more than one department may share a sub-category name, a group MUST NOT be labelled by sub-category alone.

#### Scenario: A department tile is rendered

- **WHEN** the Shop by category section renders a department that has a note
- **THEN** the tile shows the department's tile name and its note
- **AND** the tile background is the department row's stored tint

#### Scenario: Two departments share a sub-category name

- **WHEN** the Shop by design section renders two departments whose sub-category names are identical
- **THEN** each group is additionally labelled with its own department name

### Requirement: Home taxonomy sections are hidden while the catalog is too thin

Each home taxonomy section SHALL render nothing at all rather than render a near-empty grid. The Shop by category section SHALL render only when at least two departments qualify to be linked. The Shop by design section SHALL render only when at least one department qualifies for a design grouping.

Both sections SHALL become visible on their own as the catalog grows, requiring no deploy or configuration change.

#### Scenario: Only one department holds designs

- **WHEN** the home page renders and exactly one department has designs
- **THEN** the Shop by category section is absent from the page
- **AND** the Shop by design section renders that department's group if it also has a sub-category name

#### Scenario: The catalog grows past the threshold

- **WHEN** a design is added under a second department
- **THEN** the Shop by category section appears on the home page without further action

### Requirement: The home page reads the taxonomy once

The home page SHALL read the department taxonomy a single time per render and pass the same rows to every section that needs them. Sections that display the taxonomy SHALL be pure of data access.

#### Scenario: The home page renders

- **WHEN** the home page renders both taxonomy sections
- **THEN** the department taxonomy is read exactly once
- **AND** both sections receive the same rows
