# POS delivery cities implementation

1. Audit the old POS names against the committed Royal Express catalogue; record missing and duplicate counts.
2. Pass catalogueByDistrict() from the authenticated POS page and reuse CityCombobox. Preserve pricing, drafts and pending-sale locking.
3. Verify catalogue coverage/uniqueness and browser selection/search/restoration/COD totals. Run resource-bounded unit, types, lint, build and isolated database/browser checks sequentially.
4. Archive results, commit and merge the dedicated worktree. Package fresh production build outputs, verify a private canary, deploy app only with rollback and verify live city choices read-only.
