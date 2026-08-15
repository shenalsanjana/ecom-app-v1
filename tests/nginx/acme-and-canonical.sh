#!/usr/bin/env bash
# tests/nginx/acme-and-canonical.sh
#
# Behavioural tests for nginx/conf.d/app.conf. Runs the REAL config in an nginx
# container against a stub upstream, so these assert what nginx actually does
# rather than what the file looks like.
#
# Covers the two properties that are easy to regress and expensive to discover
# in production:
#   1. Canonical host — everything ends up on https://www.dressingbear.com.
#   2. ACME HTTP-01 — /.well-known/acme-challenge/ is served over plain HTTP
#      from the certbot webroot and is NOT redirected to HTTPS. Redirecting it
#      breaks `certbot renew` silently, and the cert simply expires.
#
# Requires Docker. Run with: npm run test:nginx

set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
NET="nginxtest-net-$$"
APP="nginxtest-app-$$"
NGX="nginxtest-nginx-$$"
PASS=0
FAIL=0

cleanup() {
  docker rm -f "$APP" "$NGX" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "SKIP: Docker is not available; nginx behavioural tests need it." >&2
  exit 0
fi

echo "==> Building fixtures"
mkdir -p "$TMP/certs/live/dressingbear.com" "$TMP/webroot/.well-known/acme-challenge"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -keyout "$TMP/certs/live/dressingbear.com/privkey.pem" \
  -out "$TMP/certs/live/dressingbear.com/fullchain.pem" \
  -subj "/CN=dressingbear.com" \
  -addext "subjectAltName=DNS:dressingbear.com,DNS:www.dressingbear.com" >/dev/null 2>&1
# Stands in for the token certbot drops into the webroot during HTTP-01.
echo "acme-challenge-token" > "$TMP/webroot/.well-known/acme-challenge/testtoken"

docker network create "$NET" >/dev/null 2>&1

docker run -d --name "$APP" --network "$NET" --network-alias app python:3.12-alpine \
  sh -c 'mkdir -p /s && cd /s && echo APP_RESPONSE > index.html && python -m http.server 3000' >/dev/null

docker run -d --name "$NGX" --network "$NET" \
  -v "$REPO/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$REPO/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "$TMP/certs:/etc/letsencrypt:ro" \
  -v "$TMP/webroot:/var/www/certbot:ro" \
  nginx:1.27-alpine >/dev/null

sleep 3
if ! docker ps --format '{{.Names}}' | grep -q "$NGX"; then
  echo "!! nginx failed to start:"
  docker logs "$NGX" 2>&1 | tail -20
  exit 1
fi

IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$NGX")"

check() { # check <description> <expected> <actual>
  if [ "$3" = "$2" ]; then
    echo "  PASS  $1"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $1"
    echo "          expected: $2"
    echo "          actual:   $3"
    FAIL=$((FAIL + 1))
  fi
}

# Returns "<status> <location>" for a request, resolving both hostnames to the
# nginx container so Host-based routing is exercised for real.
req() { # req <scheme> <host> <path>
  docker run --rm --network "$NET" curlimages/curl:latest -sS -o /dev/null -D - \
    --resolve "$2:443:$IP" --resolve "$2:80:$IP" -k "$1://$2$3" 2>/dev/null \
    | tr -d '\r' \
    | awk 'BEGIN{s="";l=""} /^HTTP/{s=$2} tolower($1)=="location:"{l=$2} END{print s" "l}'
}

echo "==> nginx configuration validation"
if docker exec "$NGX" nginx -t >/dev/null 2>&1; then
  echo "  PASS  nginx -t accepts the configuration"
  PASS=$((PASS + 1))
else
  echo "  FAIL  nginx -t rejected the configuration:"
  docker exec "$NGX" nginx -t 2>&1 | sed 's/^/          /'
  FAIL=$((FAIL + 1))
fi

echo "==> Canonical host"
check "http apex -> https www (single hop)" \
  "301 https://www.dressingbear.com/shop" "$(req http dressingbear.com /shop)"
check "http www -> https www" \
  "301 https://www.dressingbear.com/shop" "$(req http www.dressingbear.com /shop)"
check "https apex -> https www" \
  "301 https://www.dressingbear.com/shop" "$(req https dressingbear.com /shop)"
check "https apex preserves the query string" \
  "301 https://www.dressingbear.com/wishlist?_rsc=1wb5z" "$(req https dressingbear.com '/wishlist?_rsc=1wb5z')"
check "https apex root -> https www root" \
  "301 https://www.dressingbear.com/" "$(req https dressingbear.com /)"
check "https www reaches the app (not redirected)" \
  "200 " "$(req https www.dressingbear.com /)"

echo "==> ACME HTTP-01 challenge"
check "http apex challenge served, not redirected" \
  "200 " "$(req http dressingbear.com /.well-known/acme-challenge/testtoken)"
check "http www challenge served, not redirected" \
  "200 " "$(req http www.dressingbear.com /.well-known/acme-challenge/testtoken)"

echo "==> Compose wiring for the webroot"
compose="$REPO/docker-compose.yml"
if grep -qE '^\s*-\s*/var/www/certbot:/var/www/certbot:ro\s*$' "$compose"; then
  echo "  PASS  nginx bind-mounts the host webroot read-only"; PASS=$((PASS + 1))
else
  echo "  FAIL  nginx does not bind-mount /var/www/certbot read-only"; FAIL=$((FAIL + 1))
fi
if grep -qE '^\s*-\s*/var/www/certbot:/var/www/certbot\s*$' "$compose"; then
  echo "  PASS  certbot bind-mounts the host webroot read-write"; PASS=$((PASS + 1))
else
  echo "  FAIL  certbot does not bind-mount /var/www/certbot read-write"; FAIL=$((FAIL + 1))
fi
if grep -qE '^\s*certbot-www:\s*$' "$compose"; then
  echo "  FAIL  the certbot-www named volume is back; the webroot must be a host bind mount"
  FAIL=$((FAIL + 1))
else
  echo "  PASS  no certbot-www named volume (webroot is a host path)"; PASS=$((PASS + 1))
fi

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
