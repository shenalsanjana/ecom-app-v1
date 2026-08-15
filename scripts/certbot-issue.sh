#!/usr/bin/env bash
set -euo pipefail

# scripts/certbot-issue.sh — issue the Let's Encrypt certificate, or migrate an
# existing lineage onto the webroot authenticator. Safe to re-run: it inspects
# the stored renewal config first and does nothing when already on webroot.
#
# This is the supported way to change a certificate's authenticator — certbot
# rewrites /etc/letsencrypt/renewal/<cert-name>.conf itself. Do NOT hand-edit
# that file; it is regenerated on every issuance and your edit will be lost.
#
# Requires nginx to be UP and serving /.well-known/acme-challenge/ from the
# webroot (see nginx/conf.d/app.conf). That is the whole point of webroot over
# standalone: standalone needs port 80, which nginx already holds.
#
# Usage: ./scripts/certbot-issue.sh <contact-email>
#        CERTBOT_EMAIL=you@example.com ./scripts/certbot-issue.sh

cd "$(dirname "$0")/.."

CERT_NAME="${CERT_NAME:-dressingbear.com}"
WEBROOT="${WEBROOT:-/var/www/certbot}"
DOMAINS=(dressingbear.com www.dressingbear.com)
EMAIL="${CERTBOT_EMAIL:-${1:-}}"

if [ -z "$EMAIL" ]; then
  echo "ERROR: no contact email. Pass it as the first argument, or set CERTBOT_EMAIL." >&2
  echo "       Usage: ./scripts/certbot-issue.sh <contact-email>" >&2
  exit 1
fi

# Docker would auto-create this as root when it binds the mount, but do it
# explicitly so the failure is loud and early rather than a confusing 404 on
# the challenge. Non-fatal if unprivileged — the bind mount still works.
mkdir -p "$WEBROOT" 2>/dev/null || true
if [ ! -d "$WEBROOT" ]; then
  echo "ERROR: $WEBROOT does not exist and could not be created." >&2
  echo "       Run: sudo mkdir -p $WEBROOT" >&2
  exit 1
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx nginx; then
  echo "ERROR: the nginx service is not running, so the ACME HTTP-01 challenge" >&2
  echo "       cannot be served. Start it first: docker compose up -d nginx" >&2
  exit 1
fi

# Read the stored authenticator from inside the certbot container: /etc/letsencrypt
# is root-owned on the host, so grepping it as the deploy user would fail and be
# indistinguishable from "no lineage yet".
current_authenticator() {
  docker compose --profile tools run --rm --entrypoint sh certbot -c \
    "sed -n 's/^authenticator *= *//p' /etc/letsencrypt/renewal/${CERT_NAME}.conf 2>/dev/null" \
    2>/dev/null | tr -d '\r' | tail -n 1
}

domain_args=()
for d in "${DOMAINS[@]}"; do domain_args+=(-d "$d"); done

common_args=(
  certonly --webroot -w "$WEBROOT"
  "${domain_args[@]}"
  --cert-name "$CERT_NAME"
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive
)

existing="$(current_authenticator || true)"

if [ -z "$existing" ]; then
  echo "==> No existing lineage for ${CERT_NAME}; issuing via webroot"
  docker compose --profile tools run --rm certbot "${common_args[@]}"
elif [ "$existing" = "webroot" ]; then
  echo "==> ${CERT_NAME} already renews via webroot — nothing to do."
  exit 0
else
  echo "==> ${CERT_NAME} currently renews via '${existing}'; switching to webroot"
  # --force-renewal is required here, not optional: with a cert that is not yet
  # due, certbot exits early with "not yet due for renewal" and never rewrites
  # the renewal config — leaving the old authenticator in place. Forcing the
  # reissue is what persists `authenticator = webroot`. This consumes one
  # duplicate-certificate slot (Let's Encrypt allows 5/week), which is why the
  # webroot check above guards it — re-running this script is a no-op.
  docker compose --profile tools run --rm certbot "${common_args[@]}" --force-renewal
fi

echo "==> Reloading nginx to pick up the certificate"
docker compose exec -T nginx nginx -s reload

echo "==> Done. Verify the stored authenticator is now webroot:"
echo "    ./scripts/certbot-renew.sh --dry-run"
