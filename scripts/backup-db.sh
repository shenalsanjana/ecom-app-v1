#!/usr/bin/env bash
set -euo pipefail

# scripts/backup-db.sh — dumps the postgres service to a timestamped file
# outside the pgdata volume. Keeps the most recent N backups (default 7).
# Credentials are read from .env, never passed as CLI args, to avoid
# landing in shell history.
#
# Usage: ./scripts/backup-db.sh [backup-dir] [keep-count]

cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-/var/backups/dressingbear}"
KEEP="${2:-7}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/dressingbear-${TIMESTAMP}.bak"

echo "==> Dumping ${POSTGRES_DB} to ${OUT_FILE}"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$OUT_FILE"

echo "==> Backup written: ${OUT_FILE} ($(du -h "$OUT_FILE" | cut -f1))"

echo "==> Pruning old backups (keeping ${KEEP} most recent)"
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/dressingbear-*.bak 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "    removing $old"
  rm -f "$old"
done

echo "==> Done. Remember: an additional off-server copy (e.g. synced to OVH"
echo "    Object Storage or downloaded periodically) is recommended — this"
echo "    script alone does not protect against loss of the VPS itself."
