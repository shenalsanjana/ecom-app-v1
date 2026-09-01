## ADDED Requirements

### Requirement: Storefront taxonomy links are emitted in canonical form

Every internal link the storefront emits to a design SHALL be its canonical nested path, derived from the design's current department. The storefront MUST NOT emit a single-segment design URL and rely on the redirect to correct it: those redirects exist for URLs already indexed or bookmarked elsewhere, not as an internal linking style.

This applies to every surface that lists designs, including the home page sections and the site footer.

#### Scenario: The home page links a design

- **WHEN** a home taxonomy section renders a design under a department
- **THEN** the link target is the nested department-and-design path
- **AND** no single-segment design URL is emitted

#### Scenario: The footer lists designs

- **WHEN** the site footer renders its category column
- **THEN** every design link is a nested path
- **AND** departments holding no designs contribute no links

### Requirement: Rendered tints come from stored rows

Every storefront surface that paints a taxonomy tile SHALL take the colour from the department or design row it is rendering. Deriving a tile's colour from a hard-coded slug-to-colour map at render time is prohibited, so that re-seeding or editing a row changes what is displayed.

Ink colour SHALL be chosen by measured contrast against the tint, never by a lightness threshold.

#### Scenario: A row's tint is changed

- **WHEN** a department or design row's stored tint is changed and the cache is revalidated
- **THEN** the rendered tile uses the new colour

#### Scenario: A tile picks its ink

- **WHEN** a tile is painted with any stored tint
- **THEN** the ink is whichever of the two ink colours measures higher contrast against that tint
