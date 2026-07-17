#!/usr/bin/env bash
set -euo pipefail

# scripts/deploy.sh — pulls latest main, applies migrations, rebuilds the
# app image, and restarts the stack. Run from the repo root on the VPS for
# every deploy AFTER the initial one-time cutover (see DEPLOY_OVH.md for
# that first-time procedure — restoring the database dump and migrating
# existing images off Vercel Blob only happen once, not on every deploy).
#
# Usage: ./scripts/deploy.sh

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in real values first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "==> Pulling latest main"
git pull origin main

echo "==> Starting Postgres (if not already running)"
docker compose up -d postgres

echo "==> Waiting for Postgres to be healthy"
until docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Building the migrator image"
docker compose build migrator

echo "==> Running database migrations"
docker compose --profile tools run --rm migrator npx prisma migrate deploy

echo "==> Ensuring default admin user exists"
docker compose --profile tools run --rm migrator npm run admin:ensure

echo "==> Building the app image (queries Postgres at build time for ISR prerendering)"
docker compose build app

echo "==> Starting the full stack"
docker compose up -d

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Deploy complete. Recent app logs:"
docker compose logs --tail=30 app
