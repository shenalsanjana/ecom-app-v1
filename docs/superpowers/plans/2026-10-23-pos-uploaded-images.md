# Plan

1. Reproduce raw-image HTTP 200 versus optimizer HTTP 400 for custom uploads.
2. Apply the shared uploaded-image policy to POS thumbnails.
3. Add a browser regression for an upload introduced after startup; verify image decoding and raw request URL. Run unit, scoped types/lint, production build and relevant isolated POS flows with resource caps.
4. Archive and integrate, canary the packaged application, deploy app only with rollback, then verify live image decoding and health.
