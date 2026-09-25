#!/usr/bin/env bash
# Backs up every database (control plus one per company) and the uploaded files.
#
#   ./scripts/backup.sh [backup-dir] [keep-days]
#
# Cron, 2am daily:
#   0 2 * * * cd /opt/erp && ./scripts/backup.sh /var/backups/erp 14 >> /var/log/erp-backup.log 2>&1
set -euo pipefail

DIR="${1:-/var/backups/erp}"
KEEP_DAYS="${2:-14}"
PROJECT="${COMPOSE_PROJECT_NAME:-erp}"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a
PG_USER="${PG_ADMIN_USER:-erp}"

mkdir -p "$DIR"
echo "[$(date -Is)] backup started → $DIR"

# One dump holds the control database and every tenant database, plus roles.
docker compose -p "$PROJECT" exec -T postgres \
  pg_dumpall -U "$PG_USER" --clean --if-exists \
  | gzip > "$DIR/postgres-$STAMP.sql.gz"
echo "  databases: $(du -h "$DIR/postgres-$STAMP.sql.gz" | cut -f1)"

# Attachments live in MinIO's volume.
docker run --rm \
  -v "${PROJECT}_miniodata:/data:ro" \
  -v "$DIR:/backup" \
  alpine tar czf "/backup/files-$STAMP.tar.gz" -C /data .
echo "  files: $(du -h "$DIR/files-$STAMP.tar.gz" | cut -f1)"

# The encryption key: without it the stored tenant database passwords cannot be read.
cp .env "$DIR/env-$STAMP.bak"
chmod 600 "$DIR/env-$STAMP.bak"

find "$DIR" -name 'postgres-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
find "$DIR" -name 'files-*.tar.gz'    -mtime "+$KEEP_DAYS" -delete
find "$DIR" -name 'env-*.bak'         -mtime "+$KEEP_DAYS" -delete

echo "[$(date -Is)] backup finished; keeping $KEEP_DAYS days"
echo "Copy these off this server — a backup that only exists on the same machine is not a backup."
