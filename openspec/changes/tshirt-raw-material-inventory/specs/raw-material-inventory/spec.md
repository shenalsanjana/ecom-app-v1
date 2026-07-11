## ADDED Requirements

### Requirement: Plain T-shirt stock is a shared pool by color and size

The system SHALL track plain T-shirt (blank) stock as a single quantity per color and size, shared across every product that offers that color and size. Admins SHALL be able to add, edit, and delete color+size stock rows from the Inventory admin section.

#### Scenario: One quantity shared across products
- **WHEN** two different products both offer a White, size M variant
- **THEN** both draw from the same White/M plain-tee quantity

#### Scenario: Admin edits a color+size quantity
- **WHEN** an admin sets the White/M quantity to 12 in the Inventory section
- **THEN** every product offering White/M reflects that quantity for availability purposes

### Requirement: DTF print design stock is a shared pool per design

The system SHALL track DTF print design stock as a single quantity per design, shared across every product built on that design. Each product SHALL be assigned exactly one DTF design. Admins SHALL be able to create, edit, and delete designs from the Inventory admin section; deleting a design that is still assigned to any product SHALL be refused with a message identifying that products must be reassigned first.

#### Scenario: One quantity shared across a design's products
- **WHEN** two products are both built on the "Cats" design
- **THEN** both draw from the same Cats design quantity

#### Scenario: Design deletion is blocked while in use
- **WHEN** an admin attempts to delete a design that one or more products still reference
- **THEN** the deletion is refused and the admin is told to reassign those products first

### Requirement: A size is purchasable only when both raw materials are in stock

The system SHALL consider a specific color+size of a product purchasable only when both the matching plain-tee color+size quantity and the product's assigned DTF design quantity are greater than zero. A product SHALL be considered in stock when at least one of its offered color+size combinations is purchasable by this rule.

#### Scenario: Plain-tee stock reaching zero disables just that size
- **WHEN** the White, size M plain-tee quantity reaches zero
- **THEN** size M is shown disabled and greyed for every product offering White in size M
- **AND** other sizes with positive plain-tee stock remain selectable for that color

#### Scenario: Design stock reaching zero takes the whole product out of stock
- **WHEN** a product's assigned DTF design quantity reaches zero
- **THEN** every size of every color of that product is shown disabled and greyed
- **AND** the product cannot be added to the cart

#### Scenario: A product with no design assigned is always unavailable
- **WHEN** a product has no DTF design assigned
- **THEN** every size of every color of that product is shown as unavailable

### Requirement: Orders acquire and restore both raw-material pools together

The system SHALL, when an order is successfully placed, deduct one unit from the matching plain-tee color+size pool and one unit from the product's assigned DTF design pool for each unit sold, atomically and only when both pools have sufficient quantity; the order SHALL be refused if either pool has insufficient quantity. Each order line SHALL record which specific plain-tee and design pool rows it drew from at the time of purchase. When an order is cancelled, its payment fails, or an admin edits an order's items, the system SHALL restore quantity to the exact pool rows the affected line originally drew from, not to whichever pools the product currently points to.

#### Scenario: Placing an order deducts both pools
- **WHEN** an order for 2 units of a White/M, Cats-design product is placed successfully
- **THEN** the White/M plain-tee quantity decreases by 2 and the Cats design quantity decreases by 2

#### Scenario: Insufficient stock in either pool refuses the order
- **WHEN** an order requests more units than either the matching plain-tee pool or the assigned design pool currently has
- **THEN** the order is refused and neither pool is changed

#### Scenario: Cancelling an order restores both pools
- **WHEN** a confirmed order is cancelled
- **THEN** the plain-tee and design quantities its line items originally drew from are each increased by the cancelled quantity

#### Scenario: A restore targets the pools an order actually drew from, not the product's current state
- **WHEN** an order was placed against a design that a product no longer uses, and that order is later cancelled
- **THEN** the restore still credits the original design the order drew from

### Requirement: Admin Inventory section shows low-stock and out-of-stock pools

The system SHALL provide an admin Inventory section listing current quantities for every plain-tee color+size row and every DTF design, visually distinguishing rows at or below the low-stock threshold and rows at zero.

#### Scenario: Out-of-stock row is visually distinct
- **WHEN** a plain-tee color+size or a DTF design has a quantity of zero
- **THEN** its row in the Inventory section is shown as out of stock, visually distinct from rows with stock

#### Scenario: Low-stock row is visually distinct
- **WHEN** a pool's quantity is at or below the configured low-stock threshold but above zero
- **THEN** its row in the Inventory section is shown as low stock
