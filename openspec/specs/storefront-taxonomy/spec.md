# storefront-taxonomy Specification

## Purpose

Defines the two-level product taxonomy — departments containing designs — that
replaced the flat category model, and the URL contract that serves it. Written
after the fact from the shipped implementation (see
`docs/superpowers/specs/2026-08-30-storefront-taxonomy-foundation-design.md`),
because this work went brainstorm → plan → implement without an OPSX change
directory.

## Requirements

### Requirement: Products are organised as Department → Design

The system SHALL model the catalog as departments, each containing designs, with
every product belonging to exactly one design and carrying its department
denormalised for querying. A department SHALL carry a display name, a short
navigation label, a tile name, an optional note, an optional sub-category name,
a tile tint, and a sort order. A design SHALL carry a display name, its parent
department, an optional image, a tile tint, and a sort order.

The sub-category name (for example "Oversized Graphic T-Shirts") SHALL be a field
on the department rather than an entity of its own: each department has at most
one, it never appears in a URL, and it is used only for breadcrumbs and as a
filter-tree heading.

#### Scenario: A design belongs to exactly one department

- **WHEN** a design is created or edited
- **THEN** it references exactly one department, and that reference is required

#### Scenario: A product's department follows its design

- **WHEN** a product is created or its design is changed
- **THEN** the product's denormalised department is written from that design's
  current department

#### Scenario: Moving a design between departments re-files its products

- **WHEN** an admin changes a design's department
- **THEN** every product referencing that design has its denormalised department
  updated in the same transaction, so no product remains filed under the old one

### Requirement: Department visibility is derived, never stored

The system SHALL derive whether a department is shown with its designs from the
data itself, rather than from a stored flag. A department SHALL be linked from
the storefront with its designs only when it has at least one design. A
department SHALL appear in a "shop by design" grouping only when it has both a
sub-category name and at least one design.

Storing these as flags is prohibited: a flag can drift out of sync with the
designs that actually exist.

#### Scenario: An empty department is not linked

- **WHEN** the category index renders and a department has no designs
- **THEN** that department is not shown as a tile and not listed in the sidebar

#### Scenario: A department becomes visible when it gains a design

- **WHEN** a design is assigned to a previously empty department
- **THEN** that department appears in the storefront without any further action

### Requirement: Category URLs are nested and derived from current data

The storefront SHALL serve `/categories/{department}` and
`/categories/{department}/{design}`. The nested path SHALL be derived at request
time by joining a design to its current department, and SHALL NOT be stored.

Because the path is derived, moving a design between departments SHALL require no
slug-history rows: requests resolve to the design's current department
automatically.

#### Scenario: A department page renders

- **WHEN** a visitor requests `/categories/{department}` for an existing department
- **THEN** the department page renders

#### Scenario: A design page renders

- **WHEN** a visitor requests `/categories/{department}/{design}` where the design
  belongs to that department
- **THEN** the design's product listing renders

#### Scenario: A wrong department segment is corrected, not rejected

- **WHEN** a visitor requests `/categories/{other}/{design}` where the design
  exists but belongs to a different department
- **THEN** the storefront permanently (308) redirects to the design's canonical
  nested path rather than returning not-found

#### Scenario: Unknown and over-long paths are not found

- **WHEN** a visitor requests a `/categories/` path of three or more segments, or
  one whose slugs match no department or design
- **THEN** the storefront returns not-found without querying slug history

### Requirement: Single-segment category URLs resolve current data before history

For a single-segment `/categories/{slug}` request the system SHALL resolve in this
order: current department, then current design, then department slug history, then
design slug history, and otherwise not-found. A current design SHALL be checked
before either history table.

This ordering is load-bearing. Design slugs that were never renamed exist only as
current slugs and appear in no history table, so a history-first lookup would
return not-found for exactly the live, indexed URLs the taxonomy migration exists
to preserve.

#### Scenario: A live flat design URL redirects to its nested path

- **WHEN** a visitor requests `/categories/{slug}` where `{slug}` is a current
  design that was never renamed
- **THEN** the storefront permanently (308) redirects to
  `/categories/{department}/{slug}`

#### Scenario: A retired design slug redirects to the current nested path

- **WHEN** a visitor requests a retired design slug
- **THEN** the storefront permanently (308) redirects to the nested path built
  from that design's current slug and current department

#### Scenario: A department slug shadows a design slug

- **WHEN** a single-segment slug matches both a current department and a current
  design
- **THEN** the department page renders

### Requirement: Redirects are real status codes, not client-side refreshes

Redirects from retired or non-canonical category URLs SHALL be served as HTTP 308
responses. A Suspense boundary covering the route segment SHALL NOT be introduced,
because flushing the shell before the redirect executes downgrades it to a 200
carrying a `<meta http-equiv="refresh">`, which loses the permanent-redirect
signal that search engines rely on.

Tests asserting this contract SHALL assert the status code with redirects
disabled. Asserting only the final URL after following redirects is insufficient:
a browser follows a meta-refresh, so such a test passes while the contract is
broken.

#### Scenario: A legacy URL returns a real 308

- **WHEN** a client requests a retired or non-canonical category URL without
  following redirects
- **THEN** the response status is 308 and the `Location` header names the
  canonical nested path

### Requirement: Tile tints are stored per row and gated for contrast

Every department and design SHALL carry its own tile tint. Tints SHALL be seeded
from a single source shared with the contrast checker so the two cannot disagree.
A design seeded without a tint SHALL abort the seed rather than produce a blank
tile the contrast gate never sees.

Ink colour for a tile SHALL be chosen by whichever ink actually contrasts better
against the tint, never by a luminance threshold. Every seeded tint SHALL meet
WCAG AA (4.5:1) against the ink the runtime would choose, and a tint that fails
SHALL be adjusted rather than shipped.

#### Scenario: A failing tint blocks the build

- **WHEN** the contrast check runs against a tint that cannot reach 4.5:1 with
  either ink
- **THEN** the check reports the failing tint and exits non-zero

#### Scenario: A tintless design aborts the seed

- **WHEN** the seed encounters a design with no tint defined
- **THEN** it throws rather than writing the row

### Requirement: Storefront taxonomy links are emitted in canonical form

Every internal link the storefront emits to a design SHALL be its canonical nested
path, derived from the design's current department. The storefront MUST NOT emit a
single-segment design URL and rely on the redirect to correct it: those redirects
exist for URLs already indexed or bookmarked elsewhere, not as an internal linking
style.

This applies to every surface that lists designs, including the home page sections
and the site footer.

#### Scenario: The home page links a design

- **WHEN** a home taxonomy section renders a design under a department
- **THEN** the link target is the nested department-and-design path
- **AND** no single-segment design URL is emitted

#### Scenario: The footer lists designs

- **WHEN** the site footer renders its category column
- **THEN** every design link is a nested path
- **AND** departments holding no designs contribute no links

### Requirement: Rendered tints come from stored rows

Every storefront surface that paints a taxonomy tile SHALL take the colour from the
department or design row it is rendering. Deriving a tile's colour from a hard-coded
slug-to-colour map at render time is prohibited, so that re-seeding or editing a row
changes what is displayed.

#### Scenario: A row's tint is changed

- **WHEN** a department or design row's stored tint is changed and the cache is
  revalidated
- **THEN** the rendered tile uses the new colour

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
