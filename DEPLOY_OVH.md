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

Required values (see `.env.example` for the full annotated list): `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL` (must match the three Postgres values, host `postgres`), `AUTH_SECRET` (generate with `openssl rand -base64 32`), `AUTH_URL`/`APP_URL` (`https://dressingbear.com`), SMTP credentials, `BRAND_EMAIL`, Notify.lk credentials, and whichever payment/courier credentials are actually in use (`PAYHERE_*` at minimum; `KOKO_*`/`MINTPAY_*`/`ROYAL_EXPRESS_*` only if those integrations are enabled).

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
docker compose --profile tools run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d dressingbear.com -d www.dressingbear.com \
  --email <your-email> --agree-tos --no-eff-email
```

### 3.3 Enable HTTPS

Replace the contents of `nginx/conf.d/app.conf` with:

```nginx
upstream dressingbear_app {
    server app:3000;
}

server {
    listen 80;
    listen [::]:80;
    server_name dressingbear.com www.dressingbear.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name dressingbear.com www.dressingbear.com;

    ssl_certificate     /etc/letsencrypt/live/dressingbear.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dressingbear.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://dressingbear_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;

        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    }
}
```

Then reload:

```bash
docker compose restart nginx
curl -f https://dressingbear.com/api/health
```

Commit this change to the repo (`git add nginx/conf.d/app.conf && git commit
-m "chore: enable HTTPS after Let's Encrypt cert issuance"`) so future
deploys don't revert to the HTTP-only bootstrap config. Then push it (`git
push origin main`) — `scripts/deploy.sh` runs `git pull origin main` on
every future deploy, so a commit left local-only on the VPS risks diverging
from what those pulls expect and causing conflicts.

### 3.4 Certificate renewal

Let's Encrypt certs expire after 90 days. Add a cron entry for automatic
renewal:

```bash
sudo crontab -e
```

```cron
0 3 * * * cd /opt/dressingbear && docker compose --profile tools run --rm certbot renew --quiet && docker compose exec nginx nginx -s reload
```

## 4. Ongoing operations

### 4.1 Deploy an update

```bash
cd /opt/dressingbear
./scripts/deploy.sh
# or: make deploy
```

This pulls `main`, runs migrations, rebuilds the app image, and restarts
the stack — see `scripts/deploy.sh` for the exact sequence.

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
