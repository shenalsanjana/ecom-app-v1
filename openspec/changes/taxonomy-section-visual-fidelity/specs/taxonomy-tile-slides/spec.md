## ADDED Requirements

### Requirement: A tile with more than one image rotates through them

A taxonomy tile given more than one image SHALL cross-fade through them in order and wrap at the end. A tile given one image or none SHALL render it statically: it SHALL NOT rotate, SHALL NOT subscribe to the clock, and SHALL NOT render pagination controls.

The order SHALL be deterministic, so the same catalog produces the same first slide on every render.

#### Scenario: A tile has several images

- **WHEN** a tile is given three images
- **THEN** it advances through them in order and returns to the first after the third
- **AND** it renders one pagination control per image

#### Scenario: A tile has a single image

- **WHEN** a tile is given exactly one image
- **THEN** the image renders statically with no pagination controls

#### Scenario: A tile has no image

- **WHEN** a tile is given no image at all
- **THEN** it renders its tint alone with no pagination controls

### Requirement: Every rotating tile advances off one shared clock

All rotating tiles on a page SHALL derive their current slide from a single shared timer, so they advance together. The implementation MUST NOT start one timer per tile.

The shared tick SHALL begin at zero and advance only after mount, so the server's markup and the first client paint agree on which slide is showing.

#### Scenario: Several tiles rotate on one page

- **WHEN** a page renders more than one rotating tile
- **THEN** exactly one interval drives all of them
- **AND** they change slide at the same moment

#### Scenario: The page is first painted

- **WHEN** a rotating tile renders on the server and is then hydrated
- **THEN** both show the first slide
- **AND** no hydration mismatch occurs

### Requirement: Rotation stops under reduced motion, but the slides stay reachable

When the visitor's system requests reduced motion, the shared timer SHALL NOT start and no tile SHALL advance on its own. The pagination controls SHALL remain present and operable, so every slide is still reachable.

This preference SHALL be read at runtime. A CSS-only guard is insufficient, because it cannot prevent a timer from running.

#### Scenario: The visitor prefers reduced motion

- **WHEN** the page renders for a visitor whose system requests reduced motion
- **THEN** no tile advances on its own
- **AND** the pagination controls still change the visible slide when used

### Requirement: Choosing a slide pins it

When a visitor selects a slide through its pagination control, that tile SHALL hold that slide and SHALL NOT resume advancing. Other tiles on the page are unaffected.

A pinned position that no longer identifies an existing slide SHALL be disregarded, and the tile SHALL resume following the shared tick. It MUST NOT silently resolve to a different image than the one chosen — substituting a neighbour for a vanished selection is a worse answer than resuming rotation.

#### Scenario: A visitor picks a slide

- **WHEN** a visitor selects the third slide of a rotating tile
- **THEN** that tile continues to show the third slide as the clock advances
- **AND** other rotating tiles on the page keep advancing

#### Scenario: A pinned position no longer exists

- **WHEN** a tile holds a pinned position beyond the end of its current slides
- **THEN** it disregards the pin and resumes following the shared tick
- **AND** it does not substitute a neighbouring slide for the one that vanished

### Requirement: A pagination control is named by what it shows

Each pagination control SHALL carry an accessible name identifying the slide it selects, and SHALL indicate which control is current.

Where a slide carries a label of its own, that label SHALL name the control. Where it does not — a product photograph has no caption — the control SHALL be named by the tile's own subject and the slide's position within the set.

#### Scenario: A slide has its own label

- **WHEN** a control selects a slide labelled "Cats"
- **THEN** its accessible name identifies that slide by name

#### Scenario: A slide has no label

- **WHEN** a control selects the second of four unlabelled photographs on a tile for "Cats"
- **THEN** its accessible name identifies the tile's subject and the slide's position in the set

### Requirement: Selecting a slide never navigates

A rotating tile is a link. Activating one of its pagination controls SHALL change the visible slide only, and SHALL NOT follow the tile's link.

#### Scenario: A control inside a linked tile is activated

- **WHEN** a visitor activates a pagination control on a tile that links to a category
- **THEN** the slide changes
- **AND** no navigation occurs
