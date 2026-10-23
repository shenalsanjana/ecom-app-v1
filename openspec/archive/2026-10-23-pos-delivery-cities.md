# Shop POS Royal Express city parity

POS previously used 60 pricing-map names as delivery choices. Online checkout uses 2,029 committed courier records representing 2,028 unique city names across 15 districts. There were 1,979 supported locations missing from POS and 11 legacy POS labels absent from the online catalogue. The shared helper already deduplicates Soranathota.

The authenticated POS server page now supplies catalogueByDistrict() to the same searchable CityCombobox used online. It supports browsing by district, city/district search, keyboard selection and existing string-based drafts. Pricing still uses zoneForCity(), independently of courier district membership. No order, payment, database schema or provider changes.

Validation: 1,270 unit tests; 19 PostgreSQL tests against a disposable localhost:55432 database; scoped TypeScript and lint; bounded two-stage production build; all 12 browser flows validated (11 regression passes plus the focused city test after scoping its option locator to the listbox). The first city assertion counted six unrelated native-select options; no application change was required. Tested COD persisted Soranathota and retained Colombo/outside pricing, dispatch and collection. Browser requests to external services were blocked.

Release uses a fresh production regeneration after removing test caches, a private canary, read-only smoke checks and app-only activation with rollback retained. Memory and CPU caps and low-memory guards protect the OVH host; no production migrations or test writes. Full missing-city CSV, audit JSON, check logs and post-activation evidence are under ignored tmp/pos-cities-release/.

Design and district-level audit: docs/superpowers/specs/2026-10-23-pos-delivery-cities-design.md.
