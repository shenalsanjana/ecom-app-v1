# storefront-home

## Purpose

Defines the composition and ordering of sections on the public storefront home page, including which product collections appear and how they are sourced.

## Requirements

### Requirement: Home page section order

The public home page SHALL render its primary sections in this top-to-bottom order: hero banner, social-proof strip, Featured products, Shop by category, Deals, Trust strip. The social-proof strip MUST appear directly below the hero banner, and Featured products MUST appear directly below the social-proof strip.

#### Scenario: Visitor lands on the home page

- **WHEN** a visitor loads the home page
- **THEN** the social-proof strip is rendered immediately after the hero banner
- **AND** the Featured products grid is rendered immediately after the social-proof strip
- **AND** the Shop by category section still renders below Featured products
