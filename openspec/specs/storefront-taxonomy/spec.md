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
