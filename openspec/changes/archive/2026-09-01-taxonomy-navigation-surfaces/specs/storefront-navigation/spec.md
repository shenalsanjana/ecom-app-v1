## ADDED Requirements

### Requirement: The header exposes departments and their designs

The site header SHALL offer the taxonomy from every page. A single trigger SHALL open one panel containing a column per department that has at least one design, each column linking to the department and listing that department's designs, each linking to its canonical nested path.

Departments with no designs SHALL NOT appear, by the same derived rule the rest of the storefront uses.

#### Scenario: A visitor opens the header menu

- **WHEN** the menu is opened and more than one department has designs
- **THEN** each such department appears as a column linking to its department page
- **AND** every design under it links to its nested department-and-design path
- **AND** a department holding no designs is absent

#### Scenario: The menu is reachable without a pointer

- **WHEN** a visitor navigates the header by keyboard
- **THEN** the trigger is focusable and opens the panel
- **AND** the panel can be dismissed without a pointer

### Requirement: The header menu degrades rather than render a lone column

When fewer than two departments qualify, the trigger SHALL be a plain link to the browse page and no panel SHALL be rendered. A panel holding a single column is a worse affordance than a link.

#### Scenario: Only one department has designs

- **WHEN** the header renders and exactly one department has designs
- **THEN** the trigger is an ordinary link to the browse page
- **AND** no panel is rendered

### Requirement: The taxonomy is reachable from mobile navigation

The mobile menu SHALL list departments with their designs, since the header panel is desktop-only. Unlike the desktop trigger it SHALL render whenever at least one department qualifies: a single collapsible row is an ordinary list item, and this is the only place the taxonomy appears in mobile navigation.

Following any link there SHALL dismiss the menu.

#### Scenario: A visitor browses the taxonomy on a phone

- **WHEN** the mobile menu is opened and one department has designs
- **THEN** that department and its designs are listed
- **AND** following one of those links dismisses the menu

### Requirement: Taxonomy navigation is computed on the server

The components that render taxonomy navigation in the browser SHALL receive plain link data as props rather than reading the taxonomy themselves. The read and the derivation SHALL happen on the server.

This is not a preference: the taxonomy module reaches the database client, which must never enter a browser bundle.

#### Scenario: The header renders

- **WHEN** the header prepares its navigation
- **THEN** the taxonomy is read once on the server and reduced to link data
- **AND** the interactive components receive that data as props
