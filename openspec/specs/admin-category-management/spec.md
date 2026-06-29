# admin-category-management Specification

## Purpose
TBD - created by archiving change admin-category-management. Update Purpose after archive.
## Requirements
### Requirement: Admin can list, create, and edit categories

The system SHALL provide an admin `/admin/categories` area where an authenticated admin can view all categories with their product counts, create a new category (name + image), and edit an existing category's name and image. All category mutations SHALL require an authenticated admin.

#### Scenario: List categories with product counts

- **WHEN** an admin opens `/admin/categories`
- **THEN** every category is listed with its name, slug, image, and the number of products in it

#### Scenario: Create a category

- **WHEN** an admin submits a new category with a name and image
- **THEN** a category is created with a slug derived from the name (made unique if needed)

#### Scenario: Reject a name with no slug-able characters

- **WHEN** an admin submits a category name that contains no letters or numbers
- **THEN** the action is refused with a message that the name must contain letters or numbers, and no category is created or renamed

### Requirement: Renaming a category regenerates its slug and preserves old links

When an edit changes the category name such that its derived slug changes, the system SHALL regenerate the slug (kept unique, excluding the category itself), propagate the new slug to all referencing products, and record a mapping from the old slug to the current slug. An edit that does not change the slug (e.g. capitalization only) SHALL update name/image without creating a slug-history entry. The storefront SHALL permanently (308) redirect a request for a retired slug to the current slug. Redirect chains SHALL collapse so that every retired slug points directly at the current slug.

#### Scenario: Rename changes the slug

- **WHEN** an admin renames a category so its derived slug changes
- **THEN** the category's slug is updated and all its products now reference the new slug
- **AND** a mapping from the old slug to the new slug is recorded

#### Scenario: Cosmetic edit does not change the slug

- **WHEN** an admin edits a category's name in a way that produces the same slug (e.g. only capitalization)
- **THEN** the name/image are updated and no slug-history mapping is created

#### Scenario: Retired slug redirects to current

- **WHEN** a visitor requests `/categories/<old-slug>` for a category that was renamed
- **THEN** the storefront responds with a permanent (308) redirect to `/categories/<current-slug>`

#### Scenario: Rename back removes the self-loop

- **WHEN** a category is renamed away and then back to a previously retired slug
- **THEN** no slug-history row maps a slug to itself (no redirect loop)

### Requirement: Admin can delete a category only when it has no products

The system SHALL allow an admin to delete a category only when no products reference it. If any product references the category, deletion SHALL be refused with a message to reassign or remove those products first. Deleting a category SHALL remove its slug-history mappings.

#### Scenario: Delete an empty category

- **WHEN** an admin deletes a category that has zero products
- **THEN** the category is removed, along with its slug-history mappings

#### Scenario: Deletion blocked for a category in use

- **WHEN** an admin attempts to delete a category that still has products
- **THEN** the deletion is refused with a message to reassign or remove the products first, and the category remains

