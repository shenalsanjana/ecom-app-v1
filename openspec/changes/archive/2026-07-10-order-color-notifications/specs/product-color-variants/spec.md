## MODIFIED Requirements

### Requirement: Variant-aware cart and checkout inventory

The system SHALL identify a cart line by its variant and size, so the same design in two colors or a color in two sizes are distinct lines. At checkout the system SHALL validate each line against the exact color+size stock cell for the selected variant and SHALL decrement that cell atomically, refusing the order when the cell has insufficient stock. Checkout SHALL reject a cart line when the selected variant does not belong to the claimed product. Each order line SHALL snapshot the variant id, the database variant color, and the database variant SKU alongside the existing name/size/price/quantity.

#### Scenario: Two colors are distinct cart lines

- **WHEN** a shopper adds White / M and Black / M of the same design
- **THEN** the cart holds two separate lines

#### Scenario: Checkout decrements the exact cell

- **WHEN** an order for a color+size is placed with sufficient stock
- **THEN** only that color+size stock cell is decremented by the ordered quantity

#### Scenario: Oversell is refused

- **WHEN** an order requests more units of a color+size than are in stock
- **THEN** the order is refused and no stock is decremented

#### Scenario: Variant must belong to the claimed product

- **WHEN** a cart line claims product A but selects a variant owned by product B
- **THEN** checkout refuses the order before creating an order or decrementing stock

#### Scenario: Checkout snapshots database variant color

- **WHEN** a cart line contains a stale or manipulated color value for a selected variant
- **THEN** the created order item stores the selected database variant's color and SKU

## ADDED Requirements

### Requirement: Order item color snapshots are visible in confirmations and admin views

The system SHALL carry saved order item color and SKU snapshots through order confirmation, prepaid finalization, admin resend, dispatch, pending-payment, and failure-alert paths. Customer confirmation email SHALL show every ordered item's color when present and SHALL omit SKU. Customer confirmation SMS SHALL include a bounded summary of at most two product-color pairs and SHALL append `+N more` when additional order lines are omitted. Itemized admin emails and admin order views SHALL show product name, color, size, SKU, quantity, unit price, and line total. Missing legacy color or SKU values SHALL render safely, with customer messages omitting missing optional attributes and admin surfaces showing an em dash.

#### Scenario: Customer confirmation email shows color without SKU

- **WHEN** an order item has color `White`, size `M`, and SKU `DB-TEE-WHT-M`
- **THEN** the customer confirmation email identifies the item as color `White` and size `M`
- **AND** the customer confirmation email does not include `DB-TEE-WHT-M`

#### Scenario: Customer confirmation SMS summarizes item colors

- **WHEN** an order has three item lines with colors
- **THEN** the confirmation SMS includes at most the first two product-color pairs
- **AND** the confirmation SMS includes `+1 more`
- **AND** the SMS body stays within the configured 160-character application budget

#### Scenario: Itemized admin emails show full item snapshots

- **WHEN** a dispatch, pending-payment, or failure-alert email is generated for an order
- **THEN** each item line shows product name, color, size, SKU, quantity, unit price, and line total

#### Scenario: Admin order list shows compact item colors

- **WHEN** an admin views the orders list
- **THEN** each row's Items column shows up to two compact `Product - Color xquantity` lines
- **AND** additional item lines are summarized with `+N more`

#### Scenario: Admin order detail shows full saved item details

- **WHEN** an admin opens an order detail page
- **THEN** every order item shows its saved product name, color, size, SKU, quantity, unit price, and line total
- **AND** color and SKU are read-only historical fields

#### Scenario: Legacy missing color and SKU values remain renderable

- **WHEN** an existing order item has null color or SKU
- **THEN** customer messages omit the missing optional attributes
- **AND** admin emails and admin order views show an em dash for the missing admin fields

#### Scenario: Status-only customer messages remain unchanged

- **WHEN** a dispatch or cancellation customer notification is generated
- **THEN** the message remains status-only and does not list item colors
