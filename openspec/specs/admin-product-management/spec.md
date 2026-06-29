# admin-product-management Specification

## Purpose
TBD - created by archiving change admin-delete-product. Update Purpose after archive.
## Requirements
### Requirement: Admin can permanently delete a product without order history

The system SHALL allow an admin to permanently delete a product if and only if the product has no associated order line items (`OrderItem`). Deletion SHALL be refused for any product that has ever been ordered, preserving order history. The deletion action SHALL require an authenticated admin.

When a deletable product is removed, its associated gallery images, reviews, and wishlist entries SHALL be removed with it.

#### Scenario: Delete a product that has never been ordered

- **WHEN** an admin confirms deletion of a product that has zero order line items
- **THEN** the product is permanently removed from the catalog
- **AND** its gallery images, reviews, and wishlist entries are removed with it
- **AND** the product no longer appears in the admin products list or the storefront

#### Scenario: Deletion blocked for a product with order history

- **WHEN** an admin attempts to delete a product that has one or more order line items
- **THEN** the deletion is refused
- **AND** the admin is shown a message indicating the product has order history and should be archived instead
- **AND** the product and its order history remain intact

#### Scenario: Non-admin cannot delete a product

- **WHEN** a non-admin (or unauthenticated) user attempts the delete action
- **THEN** the request is rejected by the admin guard and no product is deleted

#### Scenario: Delete is reachable from the products table

- **WHEN** an admin views the products table on either the Active or Archived tab
- **THEN** each product row exposes a Delete control that asks for confirmation before deleting

