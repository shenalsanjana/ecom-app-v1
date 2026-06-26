# meta-pixel-tracking Specification

## Purpose

Defines the browser Meta Pixel and its funnel-event tracking model for Dressing Bear:
how the Pixel is configured (and disabled), which events fire at which points in the
shopping funnel, and how the Purchase event stays correct and deduplicated across both
the Cash-on-Delivery and online-payment checkout paths.

## Requirements

### Requirement: Meta Pixel is optional and no-op when unconfigured

The system SHALL load the Meta Pixel only when `NEXT_PUBLIC_META_PIXEL_ID` is set to a non-empty value. When it is unset or empty, no Pixel script SHALL load, `window.fbq` SHALL NOT be defined by the application, and every tracking call SHALL be a silent no-op so the site behaves exactly as before the change.

#### Scenario: Pixel disabled when env var unset

- **WHEN** the app renders with `NEXT_PUBLIC_META_PIXEL_ID` unset or empty
- **THEN** no `fbevents.js` request is made, no `meta-pixel-base` script tag is present, and tracking calls do not throw

#### Scenario: Pixel enabled when env var set

- **WHEN** the app renders with `NEXT_PUBLIC_META_PIXEL_ID` set to a Pixel id
- **THEN** the base Pixel script loads, `fbq('init', <id>)` runs, and an initial `PageView` fires

### Requirement: PageView fires on initial load and client navigations

The system SHALL fire `PageView` on initial page load and on subsequent App Router client navigations (route changes), without double-counting the initial load.

#### Scenario: PageView on client navigation

- **WHEN** the user navigates between pages without a full reload
- **THEN** a `PageView` event fires for each route change after the first

### Requirement: Funnel events fire at user-initiated points

The system SHALL fire `ViewContent` when a product page is viewed, `AddToCart` when a user adds a product to the cart, and `InitiateCheckout` when the checkout page is reached with items in the cart. Each event SHALL include `content_ids` equal to the relevant `product.id` values, a monetary `value`, and `currency: "LKR"`.

#### Scenario: ViewContent on product page

- **WHEN** a user opens a product detail page
- **THEN** a `ViewContent` event fires once with `content_ids` = `[product.id]`, the product `value`, and `currency: "LKR"`

#### Scenario: AddToCart on explicit add

- **WHEN** a user adds a product to the cart from the product page, the quick-add dialog, or Buy Now
- **THEN** an `AddToCart` event fires with `content_ids` = `[product.id]`, `value` = price × quantity, and `num_items` = quantity

#### Scenario: InitiateCheckout on checkout with items

- **WHEN** the checkout page mounts with at least one item in the cart
- **THEN** an `InitiateCheckout` event fires once with `content_ids` for all cart items, the cart `value`, and `num_items`

### Requirement: Purchase fires once per confirmed order across both payment paths

The system SHALL fire `Purchase` for confirmed orders on both payment paths — Cash on Delivery (inline success in the checkout client) and online payment providers (after returning to the success page) — and SHALL pass `eventID` equal to the order id. The system SHALL NOT fire `Purchase` for unconfirmed or cancelled orders. The system SHALL deduplicate `Purchase` by order id using a shared persistent guard so that page refreshes, back-navigation, or both payment paths touching the same order never produce more than one `Purchase` per order id.

#### Scenario: COD purchase fires once

- **WHEN** a user places a Cash on Delivery order and the inline "Order Confirmed!" view renders
- **THEN** exactly one `Purchase` event fires with `content_ids` for the ordered products, the order `value`, `currency: "LKR"`, and `eventID` = order id

#### Scenario: Online purchase fires when payment is confirmed

- **WHEN** an online-payment order returns to the success page and the order becomes confirmed (paid)
- **THEN** exactly one `Purchase` event fires with `eventID` = order id

#### Scenario: No Purchase on cancelled payment

- **WHEN** the success page renders for a cancelled or still-unconfirmed order
- **THEN** no `Purchase` event fires

#### Scenario: Purchase deduped on refresh

- **WHEN** a confirmed success page is refreshed or revisited for an order id already tracked
- **THEN** no additional `Purchase` event fires for that order id
