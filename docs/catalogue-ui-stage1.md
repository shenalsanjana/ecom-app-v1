# Catalogue and inventory UI — first stage

Approved scope: the user reviewed the private interactive proposal, responded
“good!”, then instructed “go on” after implementation was held for approval.
This stage improves terminology and everyday admin workflows. It does not
approve later catalogue schema, finished-goods, production, ledger or POS work.

## Changes

- Store categories are labelled **Store collections**, with visible shop
  departments. Existing URLs, API names and single-collection relationships
  remain unchanged.
- Inventory uses **physical categories**, **families**, **design products** and
  **DTF print components** consistently. Add-design links carry the family into
  the new-product page. Product-list creation carries a selected collection.
- New products follow physical family → product details → colours/sizes/images.
  Editing keeps all sections accessible. Inline errors replace product alerts.
- Quick collection creation requires an explicit department, inherits a selected
  collection's department, and allows the same optional image as the full form.
- New colours and size presets come from the selected physical family. Existing
  saved colours, explicit shared blank links and deliberately unavailable cells
  remain editable. Preset additions preserve existing bindings.
- Advanced stock-source overrides and optional colour SKU/price fields stay
  available under disclosures. Shop images can be reused for a product gallery.
- Existing product URLs remain stable when only the display name changes.
- Blank and print counts use explicit Adjust / Save count / Cancel controls.
  They retain the stock version displayed when editing began, even after a
  parent refresh. The existing server guard rejects stale replacements.
- Receive stock continues using the existing atomic increment. Counts remain
  **available quantities**, excluding allocations; no physical-on-hand totals,
  adjustment-reason history or receipt references are fabricated.

## Compatibility and release

No migration, stock-consumption rule or payment/order mutation is introduced.
DTF remains required by the existing sales model until the separately reviewed
stock-lifecycle stage. Multiple collections, size-level SKUs, production,
finished goods, movement history and POS are not part of this release.

Release source starts from the exact deployed order-deletion release. Only
reviewed UI files and focused tests are overlaid. The product-table label is
applied separately so unrelated local gallery, image and nginx edits remain
excluded. Private release evidence is retained under
`tmp/operations/catalogue-ui-stage1-20261017/`.

## Deployment and validation

Deployed on 18 October 2026 (Asia/Colombo) as
`dressingbear-app:catalogue-ui-stage1-20261017`. No schema migration ran.
The previous inventory-aware order-deletion release remains tagged
`dressingbear-app:before-catalogue-ui-stage1-20261017` for rollback.

- 110 focused tests passed, including 16 checks against an isolated PostgreSQL
  database. Full TypeScript, targeted lint and the production build passed.
- Candidate HTTP and server-action checks passed against a restored database
  copy. Temporary collection/product creation, shared-blank binding and
  name-only editing preserved variant links and stock quantities.
- Read-only live checks passed for admin authentication, contextual creation,
  family-scoped colours, explicit stock controls, inventory tabs, retained
  deleted orders, the storefront and the new JavaScript asset over HTTPS.
- All 27 database tables matched before and after the app restart. A fresh
  private backup and source/build manifest are retained with release evidence.
- The existing unpaid-order reconciliation cron remains active with one entry.
  No negative blank or print stock rows were found.
- Tests ran sequentially. Candidate/check containers had CPU and RAM caps; the
  completed build was packaged without another compile or dependency install.
- Browser visual review is pending because this environment has no browser.

The release archive contains the exact build source; this deployment record
was added afterward. Later schema, stock-lifecycle and POS stages remain outside
this deployment.
