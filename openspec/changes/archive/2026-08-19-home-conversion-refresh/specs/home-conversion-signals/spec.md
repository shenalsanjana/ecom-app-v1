## ADDED Requirements

### Requirement: Announcement marquee

The site-wide announcement bar SHALL present its messages as a continuously scrolling horizontal marquee rather than a single static line. The bar MUST remain non-dismissible and MUST continue to take the live free-shipping threshold as a prop from the layout.

The marquee SHALL carry exactly four messages in this order: the free-shipping label, the pay-in-3 installment label, "Cash on Delivery island-wide", and "New drops every week". The free-shipping label MUST name the formatted threshold when it is greater than zero and MUST use unconditional wording otherwise, and MUST carry the shared free-delivery exclusion note so its wording cannot drift from the cart, product and checkout surfaces. The installment label MUST name Koko only when `NEXT_PUBLIC_KOKO_ENABLED` is `"true"`.

The message set SHALL be rendered twice back-to-back so the scroll loop is seamless. The duplicate copy MUST be hidden from assistive technology. The animation MUST be gated so that it does not run under `prefers-reduced-motion`.

#### Scenario: Visitor sees the scrolling promotional messages

- **WHEN** a visitor loads any storefront page
- **THEN** the announcement bar scrolls its four messages horizontally and continuously
- **AND** the loop repeats with no visible gap or jump

#### Scenario: Free-shipping label reflects a configured threshold

- **WHEN** the delivery configuration has a free-shipping threshold greater than zero
- **THEN** the first message reads "Free shipping over" followed by the formatted threshold
- **AND** it includes the shared exclusion note naming the excluded payment methods

#### Scenario: Free-shipping label with no threshold

- **WHEN** the free-shipping threshold is zero
- **THEN** the first message reads "Free shipping on everything"
- **AND** it does not name a threshold amount

#### Scenario: Koko is not advertised while disabled

- **WHEN** `NEXT_PUBLIC_KOKO_ENABLED` is not `"true"`
- **THEN** the installment message names only Mintpay
- **AND** the exclusion note names only Mintpay

#### Scenario: Visitor prefers reduced motion

- **WHEN** a visitor has `prefers-reduced-motion` set
- **THEN** the announcement bar renders its messages without animating

#### Scenario: Screen reader hears each message once

- **WHEN** a screen reader traverses the announcement bar
- **THEN** the duplicated marquee copy is excluded from the accessibility tree

### Requirement: Social-proof strip

The home page SHALL render a full-bleed social-proof band directly below the hero and above the featured product grid, presenting four icon-and-text signals: an aggregate review rating, a count of units delivered, cash-on-delivery availability, and the returns window.

The strip MUST NOT repeat the free-shipping message, which the announcement marquee and the trust strip already carry.

#### Scenario: Visitor lands on the home page

- **WHEN** a visitor loads the home page
- **THEN** a social-proof band is rendered immediately after the hero
- **AND** it shows four signals: review rating, units delivered, cash on delivery, and returns

#### Scenario: Strip does not duplicate the shipping message

- **WHEN** the social-proof band is rendered
- **THEN** none of its four signals advertises free shipping

### Requirement: Product card conversion signals derive from real data

The product card SHALL support two optional display-only signals: a badge pill rendered over the product image, and a low-stock nudge rendered beneath the rating. Each SHALL render only when its value is present, and neither SHALL participate in pricing, cart, or checkout logic.

Both signals MUST be derived from real system data. The low-stock nudge SHALL report the fulfillable unit count for the colour the customer currently has selected on the card, and MUST update when they change colour — reporting another colour's count beside the selected colour would state something false. That count is computed from live blank and design inventory as `min(design pool quantity, total blanks across the colour's sizes)`: a finished item consumes one blank AND one design print from a single shared design pool, so summing per-size minima would overstate what can actually be fulfilled. The nudge SHALL be shown only when that count is between 1 and 6 inclusive. A count of zero MUST NOT produce a nudge, because unavailability is not scarcity. The badge SHALL read `Bestseller` and SHALL be awarded to the products with the highest quantity sold across orders whose payment status is `PAID` or `COD_COLLECTED`; ties MUST be broken deterministically so the badge does not move between cache windows.

Fixed or fabricated values MUST NOT be used for either signal.

#### Scenario: Low-stock nudge on a scarce product

- **WHEN** the colour selected on a card has between 1 and 6 fulfillable units
- **THEN** its card shows a nudge reading "Only N left" with that count

#### Scenario: No nudge on a well-stocked product

- **WHEN** the colour selected on a card has more than 6 fulfillable units
- **THEN** its card shows no low-stock nudge

#### Scenario: No nudge on an unavailable product

- **WHEN** the colour selected on a card has zero fulfillable units
- **THEN** its card shows no low-stock nudge

#### Scenario: Nudge follows the selected colour

- **WHEN** a customer switches a card to a different colour
- **THEN** the low-stock nudge reflects that colour's fulfillable units, not the default colour's

#### Scenario: Shared design pool caps the count

- **WHEN** a colour has many blanks across its sizes but the shared design pool holds fewer prints
- **THEN** the reported count is the design pool's quantity, not the sum of per-size availability

#### Scenario: Bestseller badge reflects paid sales only

- **WHEN** bestsellers are selected
- **THEN** only order items belonging to orders with payment status `PAID` or `COD_COLLECTED` are counted
- **AND** products with no paid sales receive no badge

#### Scenario: Badge selection is stable across ties

- **WHEN** several products have sold identical quantities
- **THEN** the same products are badged on every recomputation

### Requirement: Conversion signals are scoped to the home page

The badge and low-stock signals SHALL be populated only by the readers backing the home page's featured and deals sections. Every other product-card reader — catalog listing, search, wishlist, product detail and its related strip — MUST leave both fields unpopulated and MUST NOT incur the additional sales query.

#### Scenario: Signals appear on the home page

- **WHEN** a visitor views the home page featured grid or deals band
- **THEN** eligible cards show the bestseller badge and low-stock nudge

#### Scenario: Signals do not appear elsewhere

- **WHEN** a visitor views the catalog, a category, search results, the wishlist, or a product's related products
- **THEN** no card shows a bestseller badge or a low-stock nudge

### Requirement: Deals countdown

The deals section SHALL display a countdown to the end of the current local day in `HH:MM:SS` form, updating every second. Each field MUST be zero-padded to two digits, sub-second remainders MUST be truncated rather than rounded up, and an elapsed deadline MUST render as `00:00:00` rather than a negative value.

The countdown SHALL be implemented as an isolated client component so the surrounding section remains server-rendered. It MUST NOT compute a time value during render: the server-rendered output and the first client render MUST agree, so a stable placeholder is shown until the client-side timer starts.

#### Scenario: Countdown ticks down

- **WHEN** a visitor views the deals section
- **THEN** a pill reads "Ends in" followed by the time remaining until 23:59:59 local time
- **AND** the value decreases every second

#### Scenario: Page hydrates without mismatch

- **WHEN** the home page is server-rendered and hydrated
- **THEN** no hydration mismatch occurs for the countdown

#### Scenario: Deadline has passed

- **WHEN** the remaining time is zero or negative
- **THEN** the countdown renders `00:00:00`

### Requirement: Category tiles are visually distinct and legible

Category tiles SHALL be rendered as solid color fills rather than photographs beneath a gradient. Each known category slug SHALL map to its own tint; a slug with no mapping MUST receive a stable, deterministic tint from the same palette so that categories added later are still distinct rather than blank.

Tile text color SHALL be selected by whichever candidate ink has the higher measured contrast against the tile, and MUST NOT be selected by a luminance threshold. Every tile SHALL meet WCAG AA 4.5:1 for small text.

#### Scenario: Known category renders its own tint

- **WHEN** a category tile is rendered for a slug in the tint map
- **THEN** the tile uses that category's assigned color

#### Scenario: Unknown category still renders a distinct tile

- **WHEN** a category tile is rendered for a slug with no mapping
- **THEN** the tile uses a color from the palette
- **AND** the same slug produces the same color on every render

#### Scenario: Tile text is legible on every tint

- **WHEN** any category tile is rendered
- **THEN** its text color contrasts with its background by at least 4.5:1
