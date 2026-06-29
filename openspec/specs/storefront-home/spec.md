# storefront-home

## Purpose

Defines the composition and ordering of sections on the public storefront home page, including which product collections appear and how they are sourced.

## Requirements

### Requirement: Home page section order

The public home page SHALL render its primary sections in this top-to-bottom order: hero banner, New Arrivals, Shop by category, Featured products, Deals, Trust strip. New Arrivals MUST appear directly below the hero, and Shop by category MUST appear directly below New Arrivals.

#### Scenario: Visitor lands on the home page

- **WHEN** a visitor loads the home page
- **THEN** the New Arrivals section is rendered immediately after the hero banner
- **AND** the Shop by category section is rendered immediately after New Arrivals
- **AND** the Featured products grid still renders below Shop by category

### Requirement: New Arrivals product selection

The New Arrivals section SHALL display 6 non-archived catalog products, ordered by product `id` descending as the approximation of "newest first". The selection MUST be limited to catalog product rows whose `id` starts with `p`, matching the existing featured-products filter.

#### Scenario: New Arrivals lists newest catalog products

- **WHEN** the New Arrivals section is rendered
- **THEN** it shows at most 6 products
- **AND** the products are non-archived catalog rows ordered by `id` descending

#### Scenario: Archived products are excluded

- **WHEN** a product is archived
- **THEN** it does not appear in the New Arrivals section

### Requirement: New Arrivals presentation

The New Arrivals section SHALL reuse the storefront product card and the shared Section/SectionHeader layout, presenting a header with the title "New arrivals" and a "View all" action linking to the catalog sorted by newest (`/categories?sort=newest`).

#### Scenario: Section header and action

- **WHEN** the New Arrivals section is rendered
- **THEN** its header shows the title "New arrivals"
- **AND** a "View all" link points to `/categories?sort=newest`
