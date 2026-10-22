# Stage 01: transaction safety

This change hardens the existing stock pools. Finished goods, production,
sellable size SKUs, returns, valuation and POS remain later stages.

## Live rollout: 2026-10-15

Stage 01 was deployed at 13:35 UTC. Its initial image was
`dressingbear-app:stage1-20261015` (digest beginning `aad0d6aea648`). The current
app also includes the later [inventory grouping release](inventory-stock-groups.md).
Only the app container was replaced. The Stage 01 release
was exported from the current commit with 47 Stage 01 files overlaid; unrelated
image, UI and nginx edits in the shared checkout were excluded.

Verified during rollout:

- A production backup restored successfully into a separate test database.
- The migration applied successfully to that test copy before production.
- All six real PostgreSQL transaction tests passed. The workspace unit suite
  previously passed 1,063 tests; the isolated release also passed TypeScript.
- The standalone production build and candidate storefront passed. Candidate
  reconciliation rejected anonymous requests and accepted authenticated requests
  against a test copy with no eligible orders, avoiding provider calls.
- Production migration history and the running image were verified. HTTPS health
  and storefront checks returned 200; anonymous reconciliation returned 401.
- Both stock pools had zero negative quantities. The cutover check covered any
  legacy online orders accepted between migration and replacement startup;
  no additional backfill rows were needed.
- The reconciliation secret is configured, cron is active, and one job is
  installed every 10 minutes with `flock`, a 120-second timeout and low priority.
  Its first live run succeeded with zero eligible orders. No orders were changed
  by that run. Existing cron entries were preserved.

The protected cutover backup is
`/var/backups/dressingbear/dressingbear-stage1-20261015-cutover.bak`.
The pre-rollout backup, previous environment and previous crontab are also
retained there with private file permissions. Release metadata, source hashes
and validation logs are retained in the ignored, private directory
`tmp/operations/stage1-rollout-20261015/`. The test database, copied release
source, packaging files and temporary database credentials were removed after
verification. Source changes remain uncommitted in the shared checkout; record
them through the normal review/commit workflow before future deployments that
pull from Git.

Builds on this VPS must use disk storage: `/tmp` is RAM-backed. The successful
build reused installed dependencies, limited the container to 0.75 CPU and
1,100 MiB RAM, used a 512 MiB Node heap, and compiled server, edge and client
bundles in separate sequential workers. Its temporary Next configuration set
`cpus: 1`, `webpackBuildWorker: true`, `parallelServerCompiles: false`,
`parallelServerBuildTraces: false`, `webpackMemoryOptimizations: true`, and
single-worker static generation. Earlier capped attempts failed without
restarting production. These build settings were applied to the isolated
release; the repository's general deployment script and CI remain unchanged.

The previous app image is retained as
`dressingbear-app:before-stage1-20261015`. For application rollback, disable only
the cron entry labelled `dressingbear-stage1-unpaid-reconciliation`, retag that
image as `dressingbear-app:latest`, and recreate only the app with `--no-build`
through Compose, then verify health. Keep the additive database migration in
place; restoring the database is a separate recovery operation.

## Deployment

1. Back up the database and verify a recent restore on a separate database.
2. Apply the additive migration with the normal deployment migration step.
   It adds optimistic-lock versions, payment review fields, payment initiation
   timestamps and verified payment event records. Existing online orders are
   conservatively marked as already initiated; they cannot be automatically
   expired as though no gateway session had existed.
3. Generate the Prisma client and deploy the app through the existing workflow.
4. Configure a random `RECONCILIATION_SECRET` in both the app and scheduled-job
   environment. The secret must never appear in URLs or application logs.
5. Schedule `npm run orders:reconcile` every 10 minutes from the repository,
   under the existing deployment user. For example (absolute paths required):

   ```cron
   */10 * * * * cd /home/ubuntu/devops/ecom-app-v1 && flock -n /tmp/ecom-unpaid-reconcile.lock npm run orders:reconcile >> /var/log/ecom-unpaid-reconcile.log 2>&1
   ```

The job calls the running app at `APP_URL`, authenticates with the secret, and
processes at most five orders sequentially to bound CPU, database, and provider
usage on the VPS. Run one job at a time with `flock`.
Keep the log private and rotate it. Applying the source patch alone does not
perform these operational steps; the live rollout record above describes the
completed VPS deployment.

## Unpaid order policy

- COD orders are excluded.
- Online orders become eligible for reconciliation two hours after creation.
- If payment initiation never started, close the order and release its stock
  atomically. The gateway initiation path participates in the same version guard.
- If initiation started, check the provider. Verified success records payment;
  verified Koko failure or a signed failed/cancelled PayHere notification closes
  a pending, undispatched order and restores its stock once.
- Unknown/pending provider results, timeouts, missing API credentials, and
  PayHere "no records" responses do not prove non-payment. Flag payment review
  and keep stock held. Mintpay currently needs staff verification because this
  integration has no authoritative status-query API.
- Review orders appear under Orders > Payment review. Staff can retry using
  Recheck payment. After confirming the outcome with the provider, use the
  existing cancellation action when appropriate. A late successful callback is
  recorded and flagged for reconciliation/refund, without reviving a closed order
  or taking stock from a later customer.
- On paid or cancelled orders, Record outcome and resolve review requires a
  written explanation and saves it as an attributed internal note. It clears
  the review flag without pretending to execute a refund or modifying payment
  totals. Pending unpaid reviews cannot be cleared without resolving payment
  or cancelling after provider verification.
- Once online payment starts, lock item and delivery-total edits. This prevents
  already-issued gateway links from referring to a different payable total.

## Inventory and authorization

Quantity edits must carry the version displayed by the inventory page. A sale,
cancellation or another count changes that version, so stale counts are rejected
instead of replacing newer stock. Renaming a print does not write its quantity.
Only zero-quantity stock without order history can be deleted.

Admin guards recheck the current database role on every protected request/action.
A valid old admin JWT no longer grants access after demotion or user deletion.

## Validation

Run tests sequentially (`--maxWorkers=1 --no-file-parallelism`) on constrained
hosts. The focused regression tests cover submitted prices, archive checks,
missing material pools, stale stock edits, payment/cancellation conflicts,
unpaid reconciliation, and immediate admin demotion.

Real PostgreSQL concurrency tests use only an explicitly supplied isolated test
database. Create a separate local database whose name ends in `_test` and apply
the current schema to an isolated schema whose name starts with `stage1_test`.
Set `STAGE1_TEST_DATABASE_URL` to that URL and run
`npm test -- app/_lib/__tests__/stage1-postgres.test.ts`. These checks skip by
default and reject non-local URLs, production database names, and non-test
schemas. They run one test at a time; each concurrency case uses two small
requests to exercise actual PostgreSQL locking. No Docker containers are
created by the tests. Do not point them at production. Runtime gateway delivery
and cron activation must be verified during rollout.
