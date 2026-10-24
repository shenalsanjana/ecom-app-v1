# POS secondary delivery contact

Add an optional Secondary Contact Number beneath the existing POS delivery contact number. Use the online checkout's LkPhoneSchema and existing Order.alternatePhone field, which the Royal Express booking already forwards as customer_secondary_phone. No schema migration, payment or delivery pricing change. Keep the field in the delivery details group for COD and other Royal Express deliveries.

Restore the optional number from session drafts, omit blank values from sale payloads and preserve exact pending-sale retries. Reset after a completed sale. Existing drafts and payloads without this field remain valid, including idempotent retries. Retain the existing courier-only handling of secondary phones; do not add it to receipts or customer messages.

Validate optional/invalid/formatted inputs, real database persistence and retry protection, and a mobile browser COD workflow covering refresh, invalid number rejection, clearing and successful save. Run checks sequentially under fixed memory/CPU limits with a host memory reserve, package a private canary, deploy only the app with rollback, then perform read-only live checks.
