# admin-category-management Specification

## Purpose

Admin management of the catalog's design level — the rows that were called categories
before the Department -> Design taxonomy landed. The storefront-facing URL and
taxonomy contract lives in `storefront-taxonomy`.
## Requirements
### Requirement: Admin can list, create, and edit categories

The system SHALL provide an admin `/admin/categories` area where an authenticated admin can view all designs with their product counts, create a new design (name + department, with an optional image), and edit an existing design's name, department and image. All design mutations SHALL require an authenticated admin.

The department field SHALL be required on both create and update, and its options SHALL be read from the database ordered by sort order rather than hardcoded. Defaulting the department on update is prohibited: a silent default there re-files a design without the admin choosing to.

The image SHALL be optional. An absent or blank image SHALL persist as NULL rather than an empty string, and SHALL NOT block saving — a design with no image renders as a flat tint tile.

#### Scenario: List categories with product counts

- **WHEN** an admin opens `/admin/categories`
- **THEN** every category is listed with its name, slug, image, and the number of products in it

#### Scenario: Create a design

- **WHEN** an admin submits a new design with a name and a department
- **THEN** a design is created with a slug derived from the name (made unique if needed), filed under the chosen department

#### Scenario: Create a design without an image

- **WHEN** an admin submits a new design leaving the image blank
- **THEN** the design is created with a null image and renders as a flat tint tile

#### Scenario: Edit a design that has no image

- **WHEN** an admin opens a design whose image is null and changes only its name
- **THEN** the edit saves successfully; a missing image does not block the form

#### Scenario: Move a design to another department

- **WHEN** an admin changes a design's department
- **THEN** the design is re-filed and every product referencing it has its denormalised department updated in the same transaction

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

#### Scenario: Retired slug redirects to the current nested path

- **WHEN** a visitor requests `/categories/<old-slug>` for a design that was renamed
- **THEN** the storefront responds with a permanent (308) redirect to `/categories/<department>/<current-slug>`, where the department is the design's current one — see `storefront-taxonomy`

#### Scenario: Rename back removes the self-loop

- **WHEN** a category is renamed away and then back to a previously retired slug
- **THEN** no slug-history row maps a slug to itself (no redirect loop)

### Requirement: Admin can delete a design only when it has no products

The system SHALL allow an admin to delete a design only when no products reference it. If any product references the design, deletion SHALL be refused with a message to reassign or remove those products first. Deleting a design SHALL remove its slug-history mappings.

#### Scenario: Delete an empty category

- **WHEN** an admin deletes a category that has zero products
- **THEN** the category is removed, along with its slug-history mappings

#### Scenario: Deletion blocked for a category in use

- **WHEN** an admin attempts to delete a category that still has products
- **THEN** the deletion is refused with a message to reassign or remove the products first, and the category remains

