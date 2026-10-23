# POS delivery city parity

Shop POS must use the same Royal Express catalogue and searchable district-grouped CityCombobox as online checkout. Supply slim city groups from the authenticated server page; do not fetch the courier API or ship courier IDs to the client. The shared catalogue helper already removes the duplicate Soranathota record.

Audit: 60 existing POS choices; 2,029 courier records; 2,028 unique supported cities across 15 districts. 49 POS names match and 1,979 supported names were missing. Eleven old generic choices are absent from the online catalogue: Ampara, Batticaloa, Colombo, Jaffna, Kandy, Kilinochchi, Mannar, Mullaitivu, Nuwara Eliya, Trincomalee, Vavuniya. The new picker matches online support exactly (Colombo 01–15 remain available). Existing saved draft city strings remain readable; this change does not rewrite orders or pricing policy.

Examples added include Soranathota, Dankotuwa, Dekatana and Agalawatta. Rates continue to use the existing city-to-pricing-zone map; courier district membership must not redefine the Colombo pricing zone. No database migration, production data edits, live courier requests or new payment behavior.

Validation: full unit suite, scoped TypeScript/lint, bounded production build, isolated POS browser flows including full option count, uniqueness, city/district search, keyboard selection, draft restoration, mobile fit, COD pricing and dispatch. Package a private canary; health/read-only smoke it before replacing only the app container with rollback ready. Keep PostgreSQL and nginx containers intact.

Missing POS locations by district (before this change):

| District | Missing cities |
| --- | ---: |
| Anuradhapura | 146 |
| Badulla | 140 |
| Colombo | 122 |
| Galle | 104 |
| Gampaha | 169 |
| Hambantota | 84 |
| Kalutara | 149 |
| Kegalle | 135 |
| Kurunegala | 280 |
| Matale | 109 |
| Matara | 118 |
| Monaragala | 65 |
| Polonnaruwa | 101 |
| Puttalam | 89 |
| Ratnapura | 168 |
