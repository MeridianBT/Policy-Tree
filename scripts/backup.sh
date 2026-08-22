#!/usr/bin/env bash
# Database backup. Writes a timestamped custom-format dump into ./backups.
#
#   ./scripts/backup.sh                 # dump the Compose database
#   ./scripts/backup.sh restore FILE    # restore a dump, replacing the database
#
# Custom format (-Fc) is used so a restore can be parallelised and so single
# tables can be pulled out of a dump without replaying the whole thing.
set -euo pipefail

SERVICE="${DB_SERVICE:-db}"
DB_USER="${POSTGRES_USER:-hoshin}"
DB_NAME="${POSTGRES_DB:-hoshin}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

mkdir -p "$BACKUP_DIR"

case "${1:-backup}" in
  backup)
    STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
    OUT="$BACKUP_DIR/hoshin-$STAMP.dump"
    docker compose exec -T "$SERVICE" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$OUT"
    echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
    ;;
  restore)
    FILE="${2:?usage: $0 restore <file.dump>}"
    echo "This replaces the contents of database '$DB_NAME'. Ctrl-C within 5s to abort."
    sleep 5
    docker compose exec -T "$SERVICE" pg_restore -U "$DB_USER" -d "$DB_NAME" \
      --clean --if-exists --no-owner < "$FILE"
    echo "Restored $FILE"
    ;;
  *)
    echo "usage: $0 [backup|restore <file.dump>]" >&2
    exit 1
    ;;
esac
