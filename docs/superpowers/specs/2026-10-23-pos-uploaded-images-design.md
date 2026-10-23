# POS uploaded product images

New custom-product images return HTTP 200 at their /uploads URLs but HTTP 400 through /_next/image. POS did not apply the isUploadedImage() policy already used in storefront cards and galleries. Next standalone caches local file existence at boot; nginx serves the uploads volume dynamically.

Reuse isUploadedImage(first.image) on the POS catalogue Image unoptimized prop. Local runtime uploads must use the raw URL; other image sources retain existing handling. No database, pricing, stock or payment changes. Verify actual browser image decoding, not only element presence, with an upload created after server startup.

Use a dedicated worktree, sequential memory-limited tests/build, isolated browser database and private canary. Replace only the application with rollback ready; database and proxy containers stay running. Live checks must assert currentSrc uses /uploads and complete && naturalWidth > 0 for both custom products, and exercise existing images/chooser without live sale submissions.
