# Deploying Dressing Bear to an OVHcloud VPS

Target: OVHcloud VPS-1, Ubuntu 24.04 LTS, 2 vCores, 4GB RAM, 40GB NVMe.
Stack: Docker Compose (PostgreSQL + Next.js app + Nginx), Let's Encrypt TLS.
Domain used throughout this doc: **dressingbear.com** — replace if it ever changes.

This is a one-time server setup + a one-time production cutover (migrating
the live database and images off Vercel), followed by a repeatable deploy
procedure for every future update.

## 1. Initial server setup

### 1.1 Connect via SSH

OVH emails the initial root password on provisioning:

```bash
ssh root@<VPS_IP>
```

### 1.2 Create a non-root sudo user

```bash
adduser deploy
usermod -aG sudo deploy
```

### 1.3 Configure SSH key authentication

From your **local machine** (not the VPS):

```bash
ssh-copy-id deploy@<VPS_IP>
```

If `ssh-copy-id` isn't available, append your public key manually:

```bash
ssh root@<VPS_IP> "mkdir -p /home/deploy/.ssh && cat >> /home/deploy/.ssh/authorized_keys" < ~/.ssh/id_ed25519.pub
ssh root@<VPS_IP> "chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys"
```

Confirm key login works **before** disabling password auth:

```bash
ssh deploy@<VPS_IP>
```

### 1.4 Disable root login and password authentication

On the VPS, edit `/etc/ssh/sshd_config`:

```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### 1.5 Configure the UFW firewall (SSH, HTTP, HTTPS only)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### 1.6 Install Docker Engine + Compose plugin

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
sudo systemctl enable docker
```

Log out and back in for the `docker` group membership to take effect, then confirm:

```bash
docker --version
docker compose version   # MUST be >= 2.23 — the `secrets: environment:` source in
                          # docker-compose.yml needs it. Upgrade docker-compose-plugin
                          # via apt if it reports an older version.
```

### 1.7 Clone the repository

```bash
sudo mkdir -p /opt/dressingbear
sudo chown deploy:deploy /opt/dressingbear
git clone git@github.com:shenalsanjana/ecom-app-v1.git /opt/dressingbear
cd /opt/dressingbear
```

(Add the VPS's SSH public key as a **read-only deploy key** on the GitHub repo — Settings → Deploy keys — or clone over HTTPS with a personal access token instead.)

### 1.8 Create the production `.env`

```bash
cp .env.example .env
nano .env    # fill in every real value — see the list below
chmod 600 .env
```

Required values (see `.env.example` for the full annotated list): `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL` (must match the three Postgres values, host `postgres`), `AUTH_SECRET` (generate with `openssl rand -base64 32`), `AUTH_URL`/`APP_URL` (`https://www.dressingbear.com` — the canonical host; the bare apex only 301s to it, so pointing these at the apex breaks auth redirects), SMTP credentials, `BRAND_EMAIL`, Notify.lk credentials, and whichever payment/courier credentials are actually in use (`PAYHERE_*` at minimum; `KOKO_*`/`MINTPAY_*`/`ROYAL_EXPRESS_*` only if those integrations are enabled).

## 2. One-time production cutover (live data migration)

**Do this once**, before the first `docker compose up -d`. This is the
highest-risk part of the migration — it touches the real production
database. The source database (Neon-backed Vercel Postgres) is never
written to; every step below is read-only against it.

### 2.1 Confirm PostgreSQL version parity

Before anything else, check the source database's major version — via the
Vercel/Neon dashboard's SQL console, or:

```bash
psql "<NEON_DIRECT_URL>" -c "SELECT version();"
```

`docker-compose.yml` pins `postgres:16-alpine`. If Neon reports a different
major version, edit that image tag in `docker-compose.yml` to match before
continuing (`pg_restore` across major versions can fail or silently lose
features).

### 2.2 Dump the source database

Get the **direct** (non-pooled) Neon connection string from the Vercel
dashboard — the same requirement the old `migrate deploy` step had. Run the
dump from a `postgres` client container so the client version always
matches the server, regardless of local tooling:

```bash
docker run --rm postgres:16 pg_dump "<NEON_DIRECT_URL>" \
  -Fc --no-owner --no-acl -f /tmp/dump.bak
docker cp "$(docker create --rm postgres:16)":/tmp/dump.bak ./dump.bak 2>/dev/null || true
```

(Simpler in practice: run the `pg_dump` above with a bind mount so the file
lands directly on the host: `docker run --rm -v "$(pwd)":/out postgres:16
pg_dump "<NEON_DIRECT_URL>" -Fc --no-owner --no-acl -f /out/dump.bak`.)

If you dumped on a different machine than the VPS, copy it over:

```bash
scp dump.bak deploy@<VPS_IP>:/opt/dressingbear/dump.bak
```

`--no-owner --no-acl` avoids restore failing on Neon-managed roles (e.g.
`neon_superuser`) that don't exist on the new self-hosted Postgres. Because
this is a full dump, it carries the `_prisma_migrations` table too — schema,
data, and migration history all arrive together.

### 2.3 Start Postgres and restore

```bash
cd /opt/dressingbear
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2)"; do sleep 2; done

docker compose cp dump.bak postgres:/tmp/dump.bak
docker compose exec -T postgres pg_restore -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2)" \
  -d "$(grep '^POSTGRES_DB=' .env | cut -d= -f2)" --no-owner --no-acl /tmp/dump.bak
```

### 2.4 Confirm migration state

```bash
docker compose build migrator
docker compose --profile tools run --rm migrator npx prisma migrate status
```

Expected: "Database schema is up to date!" — the restored `_prisma_migrations`
table already reflects every applied migration, so no `migrate deploy` or
`migrate resolve` is needed here.

### 2.5 Migrate existing images off Vercel Blob

```bash
docker compose --profile tools run --rm migrator npm run migrate:images
```

This downloads every `Category.image` / `VariantImage.url` currently
pointing at `*.public.blob.vercel-storage.com` into the `uploads` Docker
volume and rewrites those DB rows to the new local `/uploads/...` URL. Safe
to re-run (already-local URLs are skipped). Do this **before** the next step
so the app's first build prerenders pages with the new local URLs.

`Category.image` and `VariantImage.url` are the only *typed* URL columns in
the schema, but product descriptions render through `react-markdown`
(`app/_components/product/description.tsx`), so a stray Blob URL could in
principle be hand-authored into free-text content (a markdown image link in
a description, for example) rather than one of the two structured columns
the script above handles. Do a quick sanity scan before moving on:

```bash
docker compose --profile tools run --rm migrator npx tsx -e '
import { prisma } from "@/app/_lib/prisma";
(async () => {
  const products = await prisma.product.findMany({ where: { description: { contains: "vercel-storage.com" } }, select: { id: true, name: true } });
  const reviews = await prisma.review.findMany({ where: { body: { contains: "vercel-storage.com" } }, select: { id: true, productId: true } });
  console.log("Products with a Blob URL in description:", products);
  console.log("Reviews with a Blob URL in body:", reviews);
  await prisma.$disconnect();
})();
'
```

If either list is non-empty, edit those rows manually (via `/admin`) to
point at the migrated local URL before going live — `next/image`'s
`remotePatterns` no longer allow-lists `*.public.blob.vercel-storage.com`
(Task 2), so any surviving reference to it will hard-fail to render.

### 2.6 Build and start the app

This is the very first build, so `.env`'s variables need to be exported into
the shell's real process environment first — the `database_url` secret is
sourced via `environment: DATABASE_URL` in `docker-compose.yml`, which reads
from the actual process environment `docker compose build` runs in, not just
from Compose's own `.env`-file substitution (`scripts/deploy.sh` does this
same step before every subsequent build):

```bash
set -a
source .env
set +a
docker compose build app
docker compose up -d
docker compose ps
curl -f http://localhost/api/health
```

At this point the site is reachable over plain HTTP on the VPS's IP —
useful for verifying everything works before DNS/TLS are in place.

## 3. Go live

### 3.1 Point DNS at the VPS

Create an `A` record for `dressingbear.com` → `<VPS_IP>`, and either an `A`
record or a `CNAME` for `www.dressingbear.com` → the same target. Wait for
propagation:

```bash
dig +short dressingbear.com
```

### 3.2 Obtain the Let's Encrypt certificate

Nginx is already serving the ACME challenge path (bootstrap HTTP-only
config, `nginx/conf.d/app.conf`) from step 2.6, so the webroot method works
with zero downtime:

```bash
./scripts/certbot-issue.sh <your-email>
```

That wrapper issues for both `dressingbear.com` and `www.dressingbear.com`
via webroot, then reloads nginx. It requires the nginx service to be up (it
checks, and refuses otherwise) because the challenge is served through it.

### 3.3 Enable HTTPS

Replace the HTTP-only bootstrap contents of `nginx/conf.d/app.conf` with the
HTTPS config already checked into this repo at that same path — read it rather
than copying a snippet from here, so the two can't drift apart.

Two properties of that file are load-bearing, so don't "simplify" them away:

- **`www.dressingbear.com` is the canonical host, and the bare apex only 301s
  to it.** Both hosts must not be served as co-equal origins: `AUTH_URL` makes
  NextAuth rewrite every request URL to the www origin, so an apex request to a
  protected route gets a cross-origin redirect — which browsers block for Next's
  RSC prefetches (CORS), and which scopes auth cookies to the wrong origin.
- **`/.well-known/acme-challenge/` is served over plain HTTP from the certbot
  webroot, ahead of the HTTPS redirect.** Redirecting it hands Let's Encrypt to
  the app, which 404s, and `certbot renew` fails silently until the cert expires.

Then reload:

```bash
docker compose restart nginx
curl -f https://www.dressingbear.com/api/health
```

Commit this change to the repo (`git add nginx/conf.d/app.conf && git commit
-m "chore: enable HTTPS after Let's Encrypt cert issuance"`) so future
deploys don't revert to the HTTP-only bootstrap config. Then push it (`git
push origin main`) — `scripts/deploy.sh` runs `git pull origin main` on
every future deploy, so a commit left local-only on the VPS risks diverging
from what those pulls expect and causing conflicts.

### 3.4 Certificate renewal

Let's Encrypt certs expire after 90 days. Renewal uses the **webroot**
authenticator, which works with nginx left running — nginx serves the
challenge token from the shared webroot at `/var/www/certbot`.

Do not use `standalone`. It needs to bind port 80 for itself, which nginx
already holds, so it fails with:

```
Could not bind TCP port 80 because it is already in use
```

#### One-time: confirm the lineage renews via webroot

A certificate originally issued with `--standalone` keeps renewing that way,
because the authenticator is recorded per-certificate in
`/etc/letsencrypt/renewal/dressingbear.com.conf`. Migrate it:

```bash
cd /opt/dressingbear
./scripts/certbot-issue.sh <your-email>
```

The script reads the stored authenticator and acts accordingly: already on
webroot, it exits without touching anything; on `standalone` (or anything
else), it reissues via webroot so certbot rewrites the renewal config itself.
It is safe to re-run.

Do **not** hand-edit `/etc/letsencrypt/renewal/dressingbear.com.conf`.
Certbot regenerates that file on every issuance, so the edit is silently
reverted the next time the cert is renewed — which is exactly when you need
it to be correct.

#### Ongoing: the cron entry

```bash
sudo crontab -e
```

```cron
0 3 * * * cd /opt/dressingbear && ./scripts/certbot-renew.sh --quiet >> /var/log/certbot-renew.log 2>&1
```

`scripts/certbot-renew.sh` passes `--webroot --webroot-path /var/www/certbot`
explicitly, so it renews correctly even if a lineage is still recorded as
`standalone`, and it reloads nginx afterwards.

Rehearse it any time without touching the real certificate:

```bash
./scripts/certbot-renew.sh --dry-run
```

The webroot directory itself is created by `scripts/deploy.sh` on every
deploy and bind-mounted into both nginx (read-only) and the certbot service
(read-write) — see the volume comments in `docker-compose.yml`. It is a host
path rather than a named Docker volume on purpose: `/etc/letsencrypt` is also
a host bind mount, so the path certbot records in the renewal config has to
resolve on the host too.

## 4. Ongoing operations

### 4.1 Deploy an update

#### One-time CI/CD setup

Before the first push relies on the workflow below, the repository owner
must do the following (none of it is automatable from a workflow run):

1. **Create the `production` environment.** Settings → Environments → New
   environment → `production`, then add yourself as a **required
   reviewer**. Without this the `deploy` job runs unattended as soon as
   tests pass.
2. **Generate a dedicated CI keypair** — never reuse a personal key, so it
   can be revoked independently of human access:
   ```bash
   ssh-keygen -t ed25519 -f ci_deploy_key -C "github-actions-deploy" -N ""
   ```
3. **Capture the VPS host key** so the workflow can pin it instead of
   trusting on first connect:
   ```bash
   ssh-keyscan -t ed25519 <VPS_HOST> > known_hosts_ci
   ```
   Run this once, from a machine you trust, and verify the fingerprint out
   of band (e.g. against the OVH control panel or a console session) before
   using it. The workflow itself must never run `ssh-keyscan` at runtime or
   set `StrictHostKeyChecking=no`/`accept-new` — either would accept a
   machine-in-the-middle silently.
4. **Add four repository secrets** (Settings → Secrets and variables →
   Actions):

   | Secret | Value |
   |---|---|
   | `VPS_HOST` | The VPS IP or hostname |
   | `VPS_USER` | `deploy` |
   | `VPS_SSH_KEY` | Contents of `ci_deploy_key` (the private half) |
   | `VPS_SSH_KNOWN_HOSTS` | Contents of `known_hosts_ci` |

5. **Restrict the CI key on the VPS — required, not optional.** The
   `deploy` user is in both the `sudo` and `docker` groups (§1.2, §1.6), and
   docker-group membership is root-equivalent (a container can bind-mount
   the host filesystem). An unrestricted key in `authorized_keys` therefore
   grants the CI key root-equivalent shell access if it ever leaks.

   First, once this work is merged, pull `main` on the VPS so
   `scripts/ci-deploy-dispatch.sh` exists and is executable:
   ```bash
   cd /opt/dressingbear && git pull origin main
   ```
   Then append the CI public key to `/home/deploy/.ssh/authorized_keys`,
   restricted with a forced command:
   ```
   restrict,command="/opt/dressingbear/scripts/ci-deploy-dispatch.sh" ssh-ed25519 AAAA... github-actions-deploy
   ```
   `restrict` is OpenSSH's umbrella option: it implies `no-port-forwarding`,
   `no-agent-forwarding`, `no-pty`, `no-X11-forwarding`, and `no-user-rc`
   all at once, plus any equivalent restriction OpenSSH adds in a future
   release — safer and more future-proof than listing individual `no-*`
   options by hand.

   A forced command overrides **any** command the SSH client sends — but
   `.github/workflows/deploy.yml` needs this key for two different
   operations: running the deploy, and afterwards reading back the VPS's
   current commit (`git rev-parse HEAD`) to confirm it matches the commit
   that was approved. Pointing the forced command straight at
   `scripts/deploy.sh` would silently break that second check. Instead,
   point it at `scripts/ci-deploy-dispatch.sh` — a small wrapper that reads
   the client's original command from `$SSH_ORIGINAL_COMMAND` (sshd still
   sets this under a forced command) and allow-lists exactly those two
   operations, rejecting anything else. Do not edit the forced-command path
   to point at `deploy.sh` directly.

#### Every deploy

Deploys run through GitHub Actions (`.github/workflows/deploy.yml`). Pushing
to `main` starts a `test` job; if it passes, the `deploy` job targets the
`production` environment. Approval-gating only happens if that environment
has been configured in repo settings with a required reviewer — that setting
is what makes the job pause on the Actions tab until someone approves it. If
it is not configured, the deploy proceeds unattended as soon as tests pass.
**Verify the `production` environment has a required reviewer before the
first push to `main`** (Settings → Environments → production).

Once that gate is in place, nothing reaches production without an approval
click. Either way, deploys are serialized by a concurrency group so two can
never apply migrations at once.

The manual path still works and remains the fallback when GitHub is
unavailable or you are mid-incident:

```bash
cd /opt/dressingbear
./scripts/deploy.sh
# or: make deploy
```

This pulls `main`, runs migrations, rebuilds the app image, and restarts
the stack — see `scripts/deploy.sh` for the exact sequence.

**Keep this working tree clean.** `scripts/deploy.sh` runs `git pull origin
main` under `set -e`, so a local commit or uncommitted edit on the VPS will
fail every CI deploy until it is resolved (see §3.3).

There is no automatic rollback. `scripts/deploy.sh` runs `prisma migrate
deploy` (step before the app image is even built) BEFORE `docker compose
build app` / `docker compose up -d`, and CI does not gate on `npm run
build`. So a commit that passes Vitest but fails `next build` leaves
production in a **half-migrated state**: the schema change has already been
applied to the live database, but the old app container is still serving
the old code against it. If the schema change is backward-compatible this
is invisible; if not, the old code may start erroring. Recovery: do not try
to reverse the migration — fix whatever broke `next build` and redeploy as
soon as possible so the correct code reaches the already-migrated database.
If the old code is actively erroring and a fix will take a while, consider
taking the app offline (`docker compose stop app`) rather than serving
broken requests until the fix lands.

**Red build on "Verify the VPS deployed the reviewed commit":** this means a
second push landed and won the race against the preflight check while this
run was awaiting approval (or in flight) — `deploy.sh` already pulled,
migrated, and restarted on that newer commit, and the health check earlier
in the job passed against it. Production is live and healthy, but on a
commit that was not the one approved. This is not a broken deploy to roll
back; it is a decision: check what actually changed in the unreviewed
commit and either accept it as the new production state, or manually deploy
the originally-intended commit (`git checkout <sha> && ./scripts/deploy.sh`,
or wait for/approve the newer run so it becomes the reviewed state going
forward).

### 4.2 View logs

```bash
docker compose logs -f app
docker compose logs -f nginx
docker compose logs -f postgres
# or: make logs (all services)
```

### 4.3 Restart services

```bash
docker compose restart
# or a single service: docker compose restart app
```

### 4.4 Run migrations manually

```bash
make migrate
```

### 4.5 Back up the database

```bash
./scripts/backup-db.sh
# or with custom dir/retention: ./scripts/backup-db.sh /var/backups/dressingbear 14
```

Schedule daily backups via cron:

```bash
sudo crontab -e
```

```cron
0 2 * * * cd /opt/dressingbear && ./scripts/backup-db.sh >> /var/log/dressingbear-backup.log 2>&1
```

**Also keep an off-server copy** — sync `/var/backups/dressingbear` to OVH
Object Storage, another cloud provider, or download it periodically. Backups
that live only on the same VPS don't protect against loss of that VPS.

### 4.6 Restore the database

```bash
./scripts/restore-db.sh /var/backups/dressingbear/dressingbear-<timestamp>.bak
```

This is destructive (overwrites the live database) and requires typing the
database name to confirm.

### 4.7 Recovery after a VPS reboot

Docker's systemd service is enabled (step 1.6: `systemctl enable docker`),
and every service in `docker-compose.yml` has `restart: unless-stopped` —
containers that were running before the reboot come back automatically once
Docker starts, with no manual action needed. One transient exception:
`nginx`'s upstream (`server app:3000` in `nginx/conf.d/app.conf`) resolves at
nginx's config-load time, and `depends_on` conditions only govern ordering
for the initial `docker compose up`, not container restarts after a reboot —
so `nginx` may briefly restart-loop if it comes up before `app` is ready. It
self-heals via `restart: unless-stopped` once `app` becomes healthy; no
action needed unless it hasn't stabilized within a minute or two.

## 5. What this migration deliberately does not automate

- The one-time database dump/restore (§2) and image migration (§2.5) are
  run manually, once, by design — they touch production data and warrant a
  human watching each step, not a script.
- Never run `docker compose down -v` — it deletes the `pgdata` volume. None
  of the scripts in this repo do this.
