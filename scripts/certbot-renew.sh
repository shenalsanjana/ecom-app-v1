#!/usr/bin/env bash
set -euo pipefail

# scripts/certbot-renew.sh — renew the Let's Encrypt certificate with nginx
# left running, then reload nginx. This is what cron should call (see
# DEPLOY_OVH.md §3.4); it replaces the older inline
# `docker compose ... certbot renew` one-liner.
#
# Any arguments are passed through to certbot, so a safe rehearsal is:
#   ./scripts/certbot-renew.sh --dry-run
#
# Usage: ./scripts/certbot-renew.sh [extra certbot args...]

cd "$(dirname "$0")/.."

WEBROOT="${WEBROOT:-/var/www/certbot}"

mkdir -p "$WEBROOT" 2>/dev/null || true

# --webroot/--webroot-path are passed explicitly rather than relying on the
# stored renewal config. They override whatever authenticator that config
# names, so a lineage still recorded as `standalone` renews correctly instead
# of failing with "Could not bind TCP port 80 because it is already in use".
# scripts/certbot-issue.sh fixes the stored config permanently; this override
# is the belt-and-braces that keeps renewal working either way.
docker compose --profile tools run --rm certbot renew \
  --webroot --webroot-path "$WEBROOT" \
  "$@"

# Unconditional: certbot exits 0 whether or not anything was actually renewed,
# and a reload of an unchanged certificate is a no-op. A deploy-hook can't be
# used for this — hooks run inside the certbot container, which has no access
# to the docker CLI.
echo "==> Reloading nginx"
docker compose exec -T nginx nginx -s reload
