# Shop delivery, bank transfer and COD — 2026-10-23

Shop POS supports confirmed bank transfers and COD orders, required delivery recipient/contact/address details, and Royal Express selection. Delivery pricing comes from the existing Colombo/outside-Colombo settings and free-delivery policy, checked again transactionally against the cashier quote. Delivery orders stay confirmed for dispatch, and COD stays unpaid until collection is recorded.

Shop delivery orders expose existing address/contact, dispatch, tracking, delivered, cancellation and COD collection controls. Receipts show delivery charges, recipient details and payment status. Existing paid collection sales and old pending intent payloads remain compatible. No schema migrations or automatic courier booking.

Validation: 1,261 full-suite unit tests, two additional mocked courier payload regressions, 16 isolated PostgreSQL tests, ten cashier browser flows across runs, scoped TypeScript/lint and constrained production build.

Design: [delivery design](../../docs/superpowers/specs/2026-10-22-pos-delivery-bank-cod-design.md).
Plan: [implementation and validation](../../docs/superpowers/plans/2026-10-22-pos-delivery-bank-cod.md).
