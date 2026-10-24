# Implementation plan

1. Add optional alternatePhone to POS delivery validation and persist it on Order.
2. Add the labelled tel input, draft restoration/persistence, blank omission and successful-sale reset.
3. Verify validation, PostgreSQL persistence/idempotency and mobile browser COD delivery.
4. Run unit/types/lint and bounded build, archive, integrate and deploy the app only after private canary verification. No database migration is required.
