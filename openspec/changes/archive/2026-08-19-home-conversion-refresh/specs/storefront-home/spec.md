## MODIFIED Requirements

### Requirement: Home page section order

The public home page SHALL render its primary sections in this top-to-bottom order: hero banner, social-proof strip, Featured products, Shop by category, Deals, Trust strip. The social-proof strip MUST appear directly below the hero banner, and Featured products MUST appear directly below the social-proof strip.

#### Scenario: Visitor lands on the home page

- **WHEN** a visitor loads the home page
- **THEN** the social-proof strip is rendered immediately after the hero banner
- **AND** the Featured products grid is rendered immediately after the social-proof strip
- **AND** the Shop by category section still renders below Featured products

## REMOVED Requirements

### Requirement: New Arrivals product selection

**Reason**: The New Arrivals section was removed from the home page by commit `0c02610` ("feat(home): replace New Arrivals with Featured products above categories"), which reinstated the Featured products grid in that slot. The spec was never updated, so this requirement has described absent behavior since then. No New Arrivals component exists in the codebase.

**Migration**: None. Featured products already occupies the slot this section held; visitors reach newest-first browsing through `/categories?sort=newest`, which remains available.

### Requirement: New Arrivals presentation

**Reason**: Removed together with the section itself in commit `0c02610`. Its "View all" action pointing at `/categories?sort=newest` has no rendering surface, since the section it described is not built.

**Migration**: None. The Featured products section supplies its own header and "View all" action linking to `/categories`.
