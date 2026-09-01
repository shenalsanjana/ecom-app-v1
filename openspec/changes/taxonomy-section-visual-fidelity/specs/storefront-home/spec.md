## MODIFIED Requirements

### Requirement: The home page reads the taxonomy once for its own sections

The home page SHALL read the department taxonomy a single time and pass those same rows to both of its taxonomy sections, which SHALL be pure of data access.

Site-wide chrome that renders on every page — the footer — is excluded: it SHALL read the taxonomy itself rather than receive it, because it cannot depend on any one page having read it. Both reads SHALL share a cache entry, so the exclusion costs at most one additional query on a cold cache.

Data needed by only one section, and by no other route, SHALL be read separately rather than widened into the shared taxonomy read. The shared read is performed by site-wide chrome on every page, so deepening it to serve a single section would charge every route for data only the home page uses. Such a read SHALL be cached under its own key, SHALL be invalidated by the same catalog signal as the taxonomy read, and SHALL be issued concurrently with it rather than after it. The section receiving it SHALL remain pure of data access.

#### Scenario: The home page renders

- **WHEN** the home page renders both taxonomy sections
- **THEN** the page reads the department taxonomy exactly once
- **AND** both sections receive the same rows

#### Scenario: Site-wide chrome renders

- **WHEN** the footer renders on any page, including one that never reads the taxonomy
- **THEN** it obtains the taxonomy through its own read

#### Scenario: One section needs data the others do not

- **WHEN** the home page renders a section requiring per-design media that no other route reads
- **THEN** that data comes from its own cached read rather than a widened taxonomy read
- **AND** the two reads are issued concurrently
- **AND** the section receives the result as a prop rather than reading it itself

#### Scenario: The catalog changes

- **WHEN** an admin action invalidates the catalog
- **THEN** the per-design media read is invalidated by the same signal as the taxonomy read
