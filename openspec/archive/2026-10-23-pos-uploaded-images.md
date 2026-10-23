# POS runtime-upload photo loading

The custom tote image returned HTTP 200 via nginx at /uploads/custom-design-canvas-tote-card-ef91fea23c9c9638.webp but HTTP 400 through the Next image optimizer. The standalone process indexes local public files at startup, making subsequent uploads invisible to its optimizer. POS had omitted the isUploadedImage() policy already used by storefront cards, galleries and admin tables.

The POS catalogue now supplies unoptimized={isUploadedImage(first.image)} to its Image component. Runtime uploads use nginx's live shared-volume route, including future uploads; other sources retain their existing behavior. No product names, images, prices, stock records, payment or order behavior is modified.

Validation passed: 1,270 unit tests, scoped TypeScript and lint, resource-bounded two-stage production build, 19 tests against an isolated PostgreSQL database, and three browser flows. The new regression creates an image after server startup and intercepts only its raw upload URL, checking src, browser decoding and reload. Category/colour/size selection and cash/receipt flows also pass. External browser requests were blocked and no production orders were submitted.

Release is packaged from freshly regenerated production outputs after removing test caches. A private canary and read-only smoke checks precede app-only activation with rollback retained. Live validation checks both custom product photos for raw upload URLs and nonzero decoded dimensions on desktop and after reload, plus mobile layout. No production schema migration or database/proxy container restart is required. Check logs and release evidence are kept in tmp/pos-images-release/.
