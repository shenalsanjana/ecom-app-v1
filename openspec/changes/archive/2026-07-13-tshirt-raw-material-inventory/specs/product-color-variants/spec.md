## MODIFIED Requirements

### Requirement: Per-color, per-size inventory

The system SHALL track which sizes each color variant offers (a color × size structural grid), with each cell's actual quantity drawn from the shared raw-material inventory (plain-tee stock by color+size, gated by the product's assigned DTF design stock) rather than stored on the variant itself. A variant SHALL be considered in stock when any of its offered sizes clears both raw-material pools; a product SHALL be considered in stock when any of its variants is in stock. A size SHALL be shown as unavailable for a color when that color+size's raw-material pool is zero or the product's assigned design pool is zero.

#### Scenario: Size availability is per color

- **WHEN** a color's plain-tee pool for size M is zero and for size L is positive, and the product's design pool is positive
- **THEN** size M is presented as unavailable and size L as available for that color

#### Scenario: A zero design pool makes every size of every color unavailable

- **WHEN** the product's assigned DTF design pool reaches zero
- **THEN** every size of every color variant is presented as unavailable

### Requirement: Variant-aware cart and checkout inventory

The system SHALL identify a cart line by its variant and size, so the same design in two colors or a color in two sizes are distinct lines. At checkout the system SHALL validate each line against the shared plain-tee color+size pool and the product's assigned DTF design pool, and SHALL decrement both pools atomically, refusing the order when either pool has insufficient stock. Checkout SHALL reject a cart line when the selected variant does not belong to the claimed product. Each order line SHALL snapshot the variant id, the database variant color, the database variant SKU, and the specific plain-tee and design pool rows it drew from, alongside the existing name/size/price/quantity.

#### Scenario: Two colors are distinct cart lines

- **WHEN** a shopper adds White / M and Black / M of the same design
- **THEN** the cart holds two separate lines

#### Scenario: Checkout decrements both raw-material pools

- **WHEN** an order for a color+size is placed with sufficient stock in both pools
- **THEN** the matching plain-tee color+size pool and the product's design pool are each decremented by the ordered quantity

#### Scenario: Oversell is refused

- **WHEN** an order requests more units of a color+size than either raw-material pool currently has
- **THEN** the order is refused and neither pool is decremented

#### Scenario: Variant must belong to the claimed product

- **WHEN** a cart line claims product A but selects a variant owned by product B
- **THEN** checkout refuses the order before creating an order or decrementing stock

#### Scenario: Checkout snapshots database variant color

- **WHEN** a cart line contains a stale or manipulated color value for a selected variant
- **THEN** the created order item stores the selected database variant's color and SKU
