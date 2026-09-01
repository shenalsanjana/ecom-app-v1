## MODIFIED Requirements

### Requirement: A tile shows the design's photo when it has one

A taxonomy tile SHALL render photographs of the design when any exist, and fall back to the tint when none do. The tint SHALL remain the tile's background in every case, so a slow or failed image still resolves to a deliberate colour.

The source of those photographs SHALL be a documented fallback chain, taken in order: the CARD images of the design's non-archived products; then the design's own stored image; then no photograph at all, in which case the tile renders its tint carrying the design's name. Only a bounded number of product photographs SHALL be rendered, so a large design does not produce an unbounded tile.

Ink over a photograph SHALL NOT be chosen by measuring contrast against the tint, which says nothing about legibility over an image. A tile carrying a photograph SHALL use the light ink over a scrim; the measured-contrast rule continues to govern tiles without one.

#### Scenario: A design's products have photos

- **WHEN** a tile renders for a design whose products carry CARD images
- **THEN** those photographs are shown over the tint, up to the bounded number
- **AND** the label uses the light ink

#### Scenario: A design has its own photo but its products do not

- **WHEN** a tile renders for a design with a stored image whose products carry none
- **THEN** the design's own image is shown over the tint

#### Scenario: A design without any photo is tiled

- **WHEN** a tile renders for a design with no product images and no stored image
- **THEN** the tile is the flat tint carrying the design's name
- **AND** its ink is whichever measures higher contrast

### Requirement: Tile tints are stored per row and gated for contrast

Every department and design SHALL carry its own tile tint. Tints SHALL be seeded
from a single source shared with the contrast checker so the two cannot disagree.
A design seeded without a tint SHALL abort the seed rather than produce a blank
tile the contrast gate never sees.

Ink colour for a tile SHALL be chosen by whichever ink actually contrasts better
against the tint, never by a luminance threshold. Every seeded tint SHALL meet
WCAG AA (4.5:1) against the ink the runtime would choose, and a tint that fails
SHALL be adjusted rather than shipped.

Where a tile's text is not free to sit anywhere — a caption pinned to one edge —
the scrim guaranteeing that contrast MAY be a gradient rather than a flat layer.
A gradient scrim SHALL declare the minimum opacity it holds across the whole band
the text occupies, and that minimum SHALL be what the contrast gate measures. A
gradient whose opacity at the text's furthest extent cannot carry every tint to
4.5:1 SHALL be rejected, however dark it becomes elsewhere.

Text rendered at partial opacity SHALL be measured at its composited colour, not
as if it were opaque.

#### Scenario: A failing tint blocks the build

- **WHEN** the contrast check runs against a tint that cannot reach 4.5:1 with
  either ink
- **THEN** the check reports the failing tint and exits non-zero

#### Scenario: A tintless design aborts the seed

- **WHEN** the seed encounters a design with no tint defined
- **THEN** it throws rather than writing the row

#### Scenario: A pinned caption sits over a gradient

- **WHEN** a caption is pinned to a tile's edge over a gradient scrim
- **AND** the photograph beneath it never paints
- **THEN** every line of the caption clears 4.5:1 against every tint, measured at
  the gradient's minimum opacity across the text's band and at each line's own
  composited colour
