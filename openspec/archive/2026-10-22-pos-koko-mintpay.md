# Koko and Mintpay in Shop POS

Added externally approved Koko/Mintpay payment recording with mandatory references, exact non-cash totals, draft/pending intent recovery, provider names on receipts and order details, and a compact payment selector. No migrations or provider API changes.

Validation: 1,259 unit tests, 12 isolated PostgreSQL tests, eight Chromium flows, scoped types/lint and constrained production build.

Design: [payment methods](../../docs/superpowers/specs/2026-10-22-pos-koko-mintpay-design.md).
