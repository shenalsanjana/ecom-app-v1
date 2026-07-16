#!/usr/bin/env bash
set -euo pipefail

# scripts/restore-db.sh — restores a pg_dump custom-format backup into the
# running postgres service. DESTRUCTIVE: overwrites the current database.
#
# Usage: ./scripts/restore-db.sh <path-to-backup.bak>

cd "$(dirname "$0")/.."

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: pass an existing backup file. Usage: ./scripts/restore-db.sh <path-to-backup.bak>" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: .env not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "WARNING: this will overwrite the '${POSTGRES_DB}' database with the contents of ${BACKUP_FILE}."
read -r -p "Type the database name (${POSTGRES_DB}) to confirm: " CONFIRM
if [ "$CONFIRM" != "$POSTGRES_DB" ]; then
  echo "Confirmation did not match. Aborted." >&2
  exit 1
fi

echo "==> Restoring ${BACKUP_FILE} into ${POSTGRES_DB}"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl < "$BACKUP_FILE"

echo "==> Restore complete."
